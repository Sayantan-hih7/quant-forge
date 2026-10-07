import { maintenance, announce } from '../../../shared/redis.js';
import { marketTime } from '../../../shared/market-calendar.js';
import { MonthlyUniverseModel } from '../models/qualification.model.js';
import { instruments, sourceRuns } from '../../market-data/repository.js';
import { sourceRun } from '../../market-data/imports.js';
import { ensureMonthlyHistory, ensureCompanyData } from '../../market-data/services/dhan-cache.service.js';
import { ensureIntradayHistory } from '../../market-data/services/intraday-history.service.js';
import { completedSessions } from './horizon-fit.service.js';
import { AppError } from '../../../shared/errors.js';
let nextQueueCheck=0;
/** Fetch only the published pool in the background. Never alter monthly membership. */
export async function queueQualifiedResearchRefresh(now=Date.now(), reconnect=false) {
 if(!reconnect&&now<nextQueueCheck)return;
 const sessions=completedSessions(now),last=sessions.at(-1);
 if(!last)return;
 const month=marketTime(now).date.slice(0,7);
 const universe=await MonthlyUniverseModel.findById(month).select('members revision').lean();
 if(!universe?.members.length)return;
 const jobId='qualified-research-'+month+'-'+universe.revision+'-'+last;
 const existing=await maintenance.getJob(jobId);
 if(existing){
  const state=await existing.getState();
  if(reconnect&&state==='completed')await existing.retry('completed');
  else if(state==='failed'&&(reconnect||(existing.finishedOn??0)<now-3600000))await existing.retry('failed');
  else if(reconnect&&state==='delayed')await existing.promote();
 }else await maintenance.add('qualified-research',{}, {jobId,removeOnComplete:{age:86400},removeOnFail:{age:3600}});
 nextQueueCheck=now+60000;
 return {jobId};
}
export async function refreshQualifiedResearch(now=Date.now()){
 const sessions=completedSessions(now),last=sessions.at(-1),month=marketTime(now).date.slice(0,7);
 if(!last)return;
 const universe=await MonthlyUniverseModel.findById(month).lean();
 if(!universe?.members.length)return;
 const stocks=await instruments.find({_id:{$in:universe.members.map(m=>m.instrumentId)},active:true}).lean();
 const to=new Date(Date.parse(last)+86400000).toISOString().slice(0,10);
 const from=new Date(Date.parse(last)-400*86400000).toISOString().slice(0,10);
 const result=await sourceRun('qualified-research',async(progress,errors)=>{
  await progress(0,stocks.length,{asOf:last,month});
  for(const [i,stock] of stocks.entries()){
   const tasks=[
    ['Daily history',()=>ensureMonthlyHistory(stock,from,to)],
    ['Recent minute history',()=>ensureIntradayHistory(stock,sessions[0],to)],
    ['Company facts',()=>ensureCompanyData(stock,['marketCap','roe'],month)],
   ] as const;
   for(const [label,task] of tasks)try{
    await progress(i,stocks.length,{asOf:last,month,symbol:stock.symbol,stage:label});
    await task();
   }catch(error){
    if(error instanceof AppError&&[424,429].includes(error.status))throw error;
    errors.push({item:stock._id+' '+label,message:error instanceof AppError?error.message:'Data refresh unavailable'});
   }
   await progress(i+1,stocks.length);
  }
  return {companies:stocks.length,asOf:last,monthlyMembershipChanged:false};
 });
 await announce('qualification.changed');
 return result;
}

/** Read-only status for the qualified list; failures remain visible after restart. */
export async function qualifiedResearchStatus(now=Date.now()) {
 const month=marketTime(now).date.slice(0,7),last=completedSessions(now).at(-1);
 const universe=await MonthlyUniverseModel.findById(month).select('members revision').lean();
 if(!universe?.members.length||!last)return {status:'idle'};
 const jobId='qualified-research-'+month+'-'+universe.revision+'-'+last;
 const job=await maintenance.getJob(jobId),state=job?await job.getState():undefined;
 const run=await sourceRuns.findOne({source:'qualified-research'}).sort({startedAt:-1}).lean();
 if(state&&['waiting','delayed','prioritized','waiting-children'].includes(state))return {status:'queued',asOf:last,total:universe.members.length};
 if(state==='active'&&run?._id!==jobId)return {status:'running',asOf:last,total:universe.members.length,processed:0};
 if(!run)return {status:'idle'};
 return {status:state==='active'?'running':state==='failed'?'failed':run.status,asOf:run.details?.asOf,processed:run.processed,total:run.total,
  symbol:run.details?.symbol,stage:run.details?.stage,finishedAt:run.finishedAt,
  failures:run.failures.length,message:run.failures[0]?.message};
}

/** Connection success must not be reported as a login failure if queueing is unavailable. */
export async function retryResearchAfterDhanConnect() {
 try { const queued=await queueQualifiedResearchRefresh(Date.now(),true);return queued?'queued':'not-needed'; }
 catch { return 'queue-unavailable'; }
}
