import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { invariant } from '../../../shared/errors.js';
import { redis } from '../../../shared/redis.js';
import { StrategyModel } from '../../strategies/models/strategy.model.js';
import { MonthlyUniverseModel } from '../../qualification/models/qualification.model.js';
import { currentMonth } from '../../qualification/services/universe.service.js';
import { feedStatus } from '../../market-feed/services/feed.service.js';
import { instruments } from '../../market-data/repository.js';
import { engineClient, engineInstruments } from '../../engine/services/engine.service.js';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel, PaperSignalModel, type PaperOrder } from '../models/paper.model.js';
import { orderSchema, sessionSchema } from '../validations/paper.validation.js';
export const PAPER_HEARTBEAT = 'quantforge:paper:heartbeat';
export function sessionTime(now = Date.now()) {
  const local = new Date(now+19800000), minute = local.getUTCHours()*60+local.getUTCMinutes();
  return { date:local.toISOString().slice(0,10), minute, open:local.getUTCDay()>0 && local.getUTCDay()<6 && minute>=555 && minute<930 };
}
export async function paperState() {
  const [sessions,positions,orders,signals,worker,feed] = await Promise.all([PaperSessionModel.find().sort({createdAt:-1}).lean(),PaperPositionModel.find().lean(),PaperOrderModel.find().sort({createdAt:-1}).limit(200).lean(),PaperSignalModel.find().sort({createdAt:-1}).limit(100).lean(),redis.exists(PAPER_HEARTBEAT),feedStatus()]);
  return {sessions,positions,orders,signals,workerRunning:!!worker,execution:'paper-only',feed:{state:feed.state,message:feed.message,freshIds:feed.quotes.filter(q=>q.fresh).map(q=>q.instrumentId)},marketOpen:sessionTime().open};
}
export async function createPaperSession(raw:unknown) {
  const input=sessionSchema.parse(raw), strategy=await StrategyModel.findById(input.strategyId).lean();
  invariant(strategy,'Save a strategy before starting a paper session');
  invariant(input.expectedRevision === undefined || strategy.revision === input.expectedRevision, 'The strategy changed. Reload its saved rules before starting monitoring.');
  const universe=await MonthlyUniverseModel.findById(currentMonth()).lean();
  invariant(universe?.members.length,'Publish this month’s qualified stocks first');
  const ids=[...new Set(input.ids)];
  invariant(ids.every(id=>universe.members.some(m=>m.instrumentId===id)),'Only currently qualified stocks can be selected for entries');
  invariant(!await PaperSessionModel.exists({strategyId:strategy._id,active:true}),'This strategy already has an active paper session');
  return PaperSessionModel.create({_id:randomUUID(),strategyId:strategy._id,strategy,ids,mode:input.mode,cashPaise:Math.round(strategy.risk.initialCapital*100),initialPaise:Math.round(strategy.risk.initialCapital*100),entriesPaused:false,active:true,createdAt:new Date().toISOString(),revision:1,message:'Waiting for fresh quotes and a completed candle after session start.'});
}
export async function freshQuote(id:string) {
  const feed=await feedStatus(), quote=feed.quotes.find(x=>x.instrumentId===id && x.fresh);
  invariant(quote && sessionTime().open,'A fresh Motilal quote during the regular cash-market session is required');
  return quote;
}
export async function manualPaperOrder(raw:unknown) {
  const input=orderSchema.parse(raw);
  const existing=await PaperOrderModel.findById(input.id).lean();
  if(existing){invariant(existing.sessionId===input.sessionId && existing.instrumentId===input.instrumentId && existing.side===input.side && existing.quantity===input.quantity,'Order ID already used');return existing;}
  invariant(await redis.exists(PAPER_HEARTBEAT),'Start the paper worker before submitting orders');
  const session=await PaperSessionModel.findById(input.sessionId).lean();invariant(session?.active,'Active paper session required');
  const quote=await freshQuote(input.instrumentId);
  let atr:number|undefined;
  if(input.side==='BUY') {
    invariant(!session.ids || session.ids.includes(input.instrumentId),'Choose a stock included in this paper session');
    invariant(await MonthlyUniverseModel.exists({_id:currentMonth(),'members.instrumentId':input.instrumentId}),'Buy orders must use the current qualified list');
    if(session.strategy.risk.stopMode==='ATR') {
      const {data}=await engineClient.post('/decisions',{strategy:session.strategy,cutoff:new Date().toISOString(),instruments:await engineInstruments([input.instrumentId],new Date().toISOString())});
      atr=data.results[0]?.atr; invariant(atr && atr>0,'Import enough completed history to calculate the ATR stop');
    }
  } else invariant(await PaperPositionModel.exists({sessionId:session._id,instrumentId:input.instrumentId,quantity:{$gte:input.quantity}}),'The sell quantity exceeds held paper shares');
  const at=new Date().toISOString();
  let result:PaperOrder|undefined;
  await mongoose.connection.transaction(async transaction=>{
    // Manual intervention pauses automatic entries atomically with order creation.
    await PaperSessionModel.updateOne({_id:session._id},{$set:{entriesPaused:true},$inc:{revision:1}},{session:transaction});
    result=(await PaperOrderModel.create([{_id:input.id,sessionId:session._id,instrumentId:input.instrumentId,side:input.side,quantity:input.quantity,source:'manual',status:'pending',createdAt:at,eligibleAfter:at>quote.at?at:quote.at,expiresAt:new Date(Date.now()+60000).toISOString(),reason:'Manual paper order',atr}],{session:transaction}))[0].toObject();
  });
  return result;
}
export async function confirmPaperOrder(id:string) {
  const order=await PaperOrderModel.findById(id).lean();invariant(order?.status==='confirmation','This order is not awaiting confirmation');
  invariant(Date.parse(order.expiresAt)>Date.now(),'This signal has expired');await freshQuote(order.instrumentId);
  return PaperOrderModel.findOneAndUpdate({_id:id,status:'confirmation'},{$set:{status:'pending',eligibleAfter:new Date().toISOString()}},{returnDocument:'after'}).lean();
}
export async function cancelPaperOrder(id:string) {
  const result=await PaperOrderModel.updateOne({_id:id,status:{$in:['pending','confirmation']}},{$set:{status:'cancelled'}});
  invariant(result.modifiedCount,'Only unfilled paper orders can be cancelled');
}
export async function pauseEntries(id:string, entriesPaused:boolean) {
  await mongoose.connection.transaction(async transaction=>{
    invariant(await PaperSessionModel.exists({_id:id,active:true}).session(transaction),'Active session required');
    await PaperSessionModel.updateOne({_id:id},{$set:{entriesPaused},$inc:{revision:1}},{session:transaction});
    if(entriesPaused) await PaperOrderModel.updateMany({sessionId:id,side:'BUY',source:'signal',status:{$in:['pending','confirmation']}},{$set:{status:'cancelled',message:'Automatic entries paused'}},{session:transaction});
  });
}
export async function stopPaperSession(id:string) {
  await mongoose.connection.transaction(async transaction=>{
    invariant(await PaperSessionModel.exists({_id:id,active:true}).session(transaction),'Active session required');
    invariant(!await PaperPositionModel.exists({sessionId:id}).session(transaction),'Close held paper positions before stopping this session so their exits remain protected');
    await PaperOrderModel.updateMany({sessionId:id,status:{$in:['pending','confirmation']}},{$set:{status:'cancelled',message:'Paper monitoring stopped'}},{session:transaction});
    await PaperSessionModel.updateOne({_id:id},{$set:{active:false,entriesPaused:true,message:'Stopped. You can start a new session with the latest saved strategy.'},$inc:{revision:1}},{session:transaction});
  });
}
export async function sessionInstruments() {
  const universe=await MonthlyUniverseModel.findById(currentMonth()).lean(), held=await PaperPositionModel.distinct('instrumentId');
  const ids=[...new Set([...(universe?.members.map(x=>x.instrumentId)??[]),...held])];
  return instruments.find({_id:{$in:ids}}).lean();
}
