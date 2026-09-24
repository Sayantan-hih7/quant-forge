import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/errors.js';
import { engineClient, engineInstruments, type EvaluationResult } from '../../engine/services/engine.service.js';
import { feedStatus } from '../../market-feed/services/feed.service.js';
import { MonthlyUniverseModel } from '../../qualification/models/qualification.model.js';
import { currentMonth } from '../../qualification/services/universe.service.js';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel, PaperSignalModel } from '../models/paper.model.js';
import { fillPaperOrder } from './fill.service.js';
import { sessionTime } from './paper.service.js';
import { monitoringIds } from './scope.service.js';
import {redis} from '../../../shared/redis.js';
import type {LiveQuote} from '../../market-feed/types/feed.types.js';
import {protectiveTrigger} from './protection.js';
interface Decision {id:string;entry:EvaluationResult;exit:EvaluationResult;barEnd:string|null;atr:number|null}
const evaluated=new Map<string,string>();
let lastTickId:string|undefined;
async function recentTicks(){
  // Restart from current time. Missed ticks must never become retrospective fills.
  lastTickId??=`${Date.now()}-0`;
  const records=await redis.xrange('quantforge:market:ticks',`(${lastTickId}`,'+','COUNT',1000);
  return {ticks:records.map(([,fields])=>JSON.parse(fields[1]) as LiveQuote),cursor:records.at(-1)?.[0]??lastTickId};
}
export async function processPaperOrders(){
  const now=new Date().toISOString();
  await PaperOrderModel.updateMany({status:{$in:['pending','confirmation']},expiresAt:{$lte:now}},{$set:{status:'expired',message:'Order expired before an eligible fill'}});
  const feed=await feedStatus();
  if(!sessionTime().open || feed.state!=='live'){lastTickId=`${Date.now()}-0`;return;}
  const {ticks,cursor}=await recentTicks(),current=feed.quotes.filter(x=>x.fresh);
  const quotes=ticks.filter(q=>current.some(c=>c.instrumentId===q.instrumentId && c.session===q.session) && Date.now()-Date.parse(q.at)<=15000 && Date.parse(q.at)<=Date.now()+1000);
  const sessions=await PaperSessionModel.find({active:true}).lean();
  for(const session of sessions){
    const held=await PaperPositionModel.find({sessionId:session._id}).lean();
    for(const position of held){
      const risk=session.strategy.risk;
      const {quote,reason,stop}=protectiveTrigger(position,risk,quotes,!risk.overnight && (sessionTime().minute>=915 || position.openedAt.slice(0,10)<now.slice(0,10)));
      if(reason && quote){
        await mongoose.connection.transaction(async transaction=>{
          // Protection replaces an unconfirmed discretionary sell immediately.
          await PaperOrderModel.updateMany({sessionId:session._id,instrumentId:position.instrumentId,status:{$in:['confirmation','pending']},source:{$ne:'protection'}},{$set:{status:'cancelled',message:'Replaced by protective exit'}},{session:transaction});
          const active=await PaperOrderModel.exists({sessionId:session._id,instrumentId:position.instrumentId,status:'pending',source:'protection'}).session(transaction);
          if(!active)await PaperOrderModel.create([{_id:randomUUID(),sessionId:session._id,instrumentId:position.instrumentId,side:'SELL',quantity:0,source:'protection',status:'pending',createdAt:now,eligibleAfter:quote.at,expiresAt:new Date(Date.now()+60000).toISOString(),reason}],{session:transaction});
        });
      } else if(stop>position.stopPaise)await PaperPositionModel.updateOne({_id:position._id},{$max:{stopPaise:stop}});
    }
  }
  for(const order of await PaperOrderModel.find({status:'pending'}).lean()){
    const quote=quotes.find(q=>q.instrumentId===order.instrumentId && q.at>order.eligibleAfter);if(quote)await fillPaperOrder(order._id,quote);
  }
  lastTickId=cursor;
}
export async function evaluatePaperStrategies(){
  const sessions=await PaperSessionModel.find({active:true}).lean();if(!sessions.length)return;
  const universe=await MonthlyUniverseModel.findById(currentMonth()).lean();
  const feed=await feedStatus();
  for(const session of sessions){
    const held=await PaperPositionModel.find({sessionId:session._id}).lean();
    const ids=monitoringIds(universe?.members.map(x=>x.instrumentId)??[],session.ids,held.map(x=>x.instrumentId),session.entriesPaused);
    const update=async(message:string)=>{await PaperSessionModel.updateOne({_id:session._id},{$set:{checkedAt:new Date().toISOString(),message}});};
    if(!ids.length){await update('No published stocks to monitor. Held positions still use their saved exit rules.');continue;}
    if(ids.length>100){await update('This worker supports up to 100 qualified and held stocks per session.');continue;}
    if(feed.state!=='live'){await update('Waiting for the Motilal feed. No signals or fills are being invented.');continue;}
    const cadence=String(session.strategy.entry.cadence),minutes=cadence==='daily'?375:Number(cadence.slice(0,-1));
    const local=sessionTime(),boundary=cadence==='daily'?`${local.date}:daily`:`${local.date}:${Math.floor((local.minute-555)/minutes)}`;
    if(evaluated.get(session._id)===boundary)continue;
    if(cadence==='daily'?local.minute<930:!local.open || local.minute<555+minutes)continue;
    // Allow a few seconds for the feed worker to publish the completed bucket.
    if(new Date().getUTCSeconds()<5)continue;
    try{
      const cutoff=new Date().toISOString(),data:{results:Decision[]}={results:[]};
      for(let index=0;index<ids.length;index+=5){
        const instruments=await engineInstruments(ids.slice(index,index+5),cutoff);
        const response=await engineClient.post<{results:Decision[]}>('/decisions',{strategy:session.strategy,cutoff,instruments});
        data.results.push(...response.data.results);
      }
      let unavailable=0,signals=0;
      for(const result of data.results){
        if(!result.barEnd || Date.parse(result.barEnd)<Date.parse(session.createdAt) || Date.now()-Date.parse(result.barEnd)>(cadence==='daily'?3600000:minutes*60000)){unavailable++;continue;}
        const selling=held.some(p=>p.instrumentId===result.id),side=selling?'SELL':'BUY',evaluation=selling?result.exit:result.entry;
        if(evaluation.matched===null){unavailable++;continue;}if(!evaluation.matched)continue;
        const signalId=`${session._id}:${result.id}:${side}:${result.barEnd}`;
        await mongoose.connection.transaction(async transaction=>{
          if(await PaperSignalModel.exists({_id:signalId}).session(transaction))return;
          const active=await PaperOrderModel.exists({sessionId:session._id,instrumentId:result.id,status:{$in:['pending','confirmation']}}).session(transaction);
          const atrMissing=!selling && session.strategy.risk.stopMode==='ATR' && !result.atr;
          const orderId=active||atrMissing?undefined:randomUUID();
          await PaperSignalModel.create([{_id:signalId,sessionId:session._id,instrumentId:result.id,side,barEnd:result.barEnd!,createdAt:cutoff,checks:evaluation.checks,orderId,message:atrMissing?'ATR history missing':active?'An order already awaits action':undefined}],{session:transaction});
          if(orderId)await PaperOrderModel.create([{_id:orderId,sessionId:session._id,instrumentId:result.id,side,quantity:0,source:'signal',status:session.mode==='automatic'?'pending':'confirmation',createdAt:cutoff,eligibleAfter:cutoff,expiresAt:new Date(Date.now()+(cadence==='daily'?4*86400000:minutes*60000)).toISOString(),reason:selling?'Sell rule on completed candle':'Buy rule on completed candle',atr:result.atr??undefined}],{session:transaction});
          signals++;
        });
      }
      evaluated.set(session._id,boundary);
      await update(`Checked ${ids.length} stocks · ${signals} new signals · ${unavailable} missing or stale observations.`);
    }catch(e){await update(e instanceof AppError?e.message:'Rule evaluation unavailable; existing protective exits remain active.');}
  }
}
