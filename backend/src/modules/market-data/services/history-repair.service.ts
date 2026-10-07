import { storedCandles } from '../repository.js';
import { DatasetReceiptModel } from '../models/dataset-receipt.model.js';
import { dhanRequest } from '../../connections/services/dhan.service.js';
import { parseDhanHistory } from '../sources/dhan-history.js';
import { intradaySessions } from './intraday-quality.js';
import type { Instrument } from '../types.js';
import { AppError } from '../../../shared/errors.js';
export interface HistoryReview { checkedSessions:number; recoveredCandles:number; providerMissingSessions:number; failedChecks:number; deferredSessions:number; reusedChecks:number }
export const emptyHistoryReview=():HistoryReview=>({checkedSessions:0,recoveredCandles:0,providerMissingSessions:0,failedChecks:0,deferredSessions:0,reusedChecks:0});
/** Recheck only absent observations. A provider-confirmed gap is cached for a week;
 * retry failures after an hour. Zero-volume observations are not download gaps. */
export async function repairIntradayHistory(stock:Instrument,from:string,to:string,budget:{remaining:number},request=dhanRequest,now=Date.now(), force=false){
 const result=emptyHistoryReview(),start=from+'T00:00:00+05:30',end=to+'T00:00:00+05:30';
 const rows=await storedCandles.find({instrumentId:stock._id,interval:'1m',time:{$gte:new Date(start).toISOString(),$lt:new Date(end).toISOString()}}).select('time volume -_id').lean();
 const days=intradaySessions(rows,start,end).filter(day=>day.missing>0)
   .sort((a,b)=>Number(b.noCandles||b.internal>0||b.trailing>0)-Number(a.noCandles||a.internal>0||a.trailing>0)||b.date.localeCompare(a.date));
 const receipts=await DatasetReceiptModel.find({instrumentId:stock._id,kind:'intraday-review',from:{$gte:from,$lt:to}}).lean();
 for(const day of days){
   const receipt=receipts.find(r=>r.from===day.date);
   if(!force&&receipt?.parserVersion===2&&receipt?.retryAt&&Date.parse(receipt.retryAt)>now&&day.observed>=(receipt.records??0)){
     result.reusedChecks++;if(receipt.error)result.failedChecks++;else result.providerMissingSessions++;continue;
   }
   if(budget.remaining<=0){result.deferredSessions++;continue;}
   budget.remaining--;result.checkedSessions++;
   const next=new Date(Date.parse(day.date)+86400000).toISOString().slice(0,10),at=new Date(now).toISOString();
   try{
     const raw=await request('/charts/intraday',{securityId:stock.securityId,exchangeSegment:stock.exchange+'_EQ',instrument:'EQUITY',interval:'1',oi:false,fromDate:day.date+' 09:14:00',toDate:next+' 09:15:00'},{maxWaitMs:30000});
     const fresh=parseDhanHistory(raw,stock,'1m',at).filter(row=>row.time.slice(0,10)===day.date);
     const seen=new Set(rows.filter(row=>row.time.slice(0,10)===day.date).map(row=>row.time));
     const recovered=fresh.filter(row=>!seen.has(row.time)).length;
     if(fresh.length)await storedCandles.bulkWrite(fresh.map(row=>({updateOne:{filter:{instrumentId:stock._id,interval:'1m',time:row.time},update:{$set:row},upsert:true}})));
     result.recoveredCandles+=recovered;
     const providerMissing=375-fresh.length;if(providerMissing)result.providerMissingSessions++;
     await DatasetReceiptModel.updateOne({_id:'intraday-review:'+stock._id+':'+day.date},{$set:{instrumentId:stock._id,kind:'intraday-review',from:day.date,to:next,checkedAt:at,parserVersion:2,records:fresh.length,
       retryAt:new Date(now+7*86400000).toISOString(),quality:{providerMissing,recovered,zeroVolume:fresh.filter(row=>row.volume===0).length}},$unset:{error:1}},{upsert:true});
   }catch(error){
     result.failedChecks++;
     await DatasetReceiptModel.updateOne({_id:'intraday-review:'+stock._id+':'+day.date},{$set:{instrumentId:stock._id,kind:'intraday-review',from:day.date,to:next,checkedAt:at,parserVersion:2,
       retryAt:new Date(now+3600000).toISOString(),error:error instanceof AppError?error.message:'Provider recheck unavailable; existing candles retained'}},{upsert:true});
   }
 }
 return result;
}
