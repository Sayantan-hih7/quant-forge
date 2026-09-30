import { strategyHistoryPlan } from '../../backtesting/services/history-plan.js';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { invariant } from '../../../shared/errors.js';
import { redis, announce } from '../../../shared/redis.js';
import { StrategyModel } from '../../strategies/models/strategy.model.js';
import { MonthlyUniverseModel } from '../../qualification/models/qualification.model.js';
import { currentMonth } from '../../qualification/services/universe.service.js';
import { updatePaperSubscriptions } from '../../market-feed/services/paper-subscriptions.service.js';
import { feedStatus } from '../../market-feed/services/feed.service.js';
import { instruments } from '../../market-data/repository.js';
import { engineClient, engineInstruments } from '../../engine/services/engine.service.js';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel, PaperSignalModel, PaperObservationModel, type PaperOrder } from '../models/paper.model.js';
import { orderSchema, sessionSchema, sessionConfigurationSchema } from '../validations/paper.validation.js';
import { marketTime } from '../../../shared/market-calendar.js';
import { BacktestRunModel } from '../../backtesting/models/backtest.model.js';
import { orderEstimate } from './order-estimate.js';
import { bookedPaperPnl, markPaperPosition } from './valuation.js';
import { monitoringScope } from './scope.service.js';
export const PAPER_HEARTBEAT = 'quantforge:paper:heartbeat';
export const sessionTime = marketTime;
export async function paperState() {
  const [snapshot,worker,feed] = await Promise.all([
    mongoose.connection.transaction(async transaction=>({
      sessions:await PaperSessionModel.find().sort({createdAt:-1}).session(transaction).lean(),
      positions:await PaperPositionModel.find().session(transaction).lean(),
      recentOrders:await PaperOrderModel.find().sort({createdAt:-1}).limit(200).session(transaction).lean(),
      outstanding:await PaperOrderModel.find({status:{$in:['pending','confirmation']}}).session(transaction).lean(),
      tradedSessionIds:await PaperOrderModel.distinct('sessionId',{status:'filled'}).session(transaction),
      signals:await PaperSignalModel.find().sort({createdAt:-1}).limit(200).session(transaction).lean(),
    }),{readConcern:{level:'snapshot'}}),redis.exists(PAPER_HEARTBEAT),feedStatus(),
  ]);
  const {sessions,positions,recentOrders,outstanding,signals,tradedSessionIds}=snapshot;
  const orders=[...new Map([...recentOrders,...outstanding].map(o=>[o._id,o])).values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const history = await redis.get('quantforge:paper:history');
  const universe = await MonthlyUniverseModel.findById(currentMonth()).select('members.instrumentId').lean();
  const qualified = universe?.members.map(member => member.instrumentId) ?? [];
  const scopedSessions = sessions.map(session => ({ ...session, hasTrades:tradedSessionIds.includes(session._id), bookedPnlPaise: bookedPaperPnl(session.cashPaise, session.initialPaise, positions.filter(p=>p.sessionId===session._id)), scope: monitoringScope(qualified, session.ids,
    positions.filter(position => position.sessionId === session._id).map(position => position.instrumentId), session.entriesPaused) }));
  const observations = await PaperObservationModel.find({sessionId:{$in:sessions.filter(s=>s.active).map(s=>s._id)}}).lean();
  const scopeIds = [...new Set([...scopedSessions.flatMap(session => [...session.scope.selectedIds, ...session.scope.heldIds]),...signals.map(s=>s.instrumentId),...orders.map(o=>o.instrumentId)])];
  const estimatedOrders=orders.map(order=>{const session=sessions.find(s=>s._id===order.sessionId);return {...order,estimate:session&&['pending','confirmation'].includes(order.status)?orderEstimate(order,session,positions.filter(p=>p.sessionId===session._id),feed.quotes.find(q=>q.instrumentId===order.instrumentId&&q.fresh)):undefined};});
  const stocks = await instruments.find({ _id: { $in: scopeIds } }).select('_id symbol').lean();
  const markedPositions=positions.map(p=>({...p,mark:markPaperPosition(p,feed.quotes.find(q=>q.instrumentId===p.instrumentId))}));
  return {sessions:scopedSessions,symbols:Object.fromEntries(stocks.map(stock=>[stock._id,stock.symbol])),positions:markedPositions,orders:estimatedOrders,signals,observations,workerRunning:!!worker,execution:'paper-only',feed:{state:feed.state,message:feed.message,provider:feed.provider,enabled:feed.enabled,automation:feed.automation,workerRunning:feed.workerRunning,subscribedIds:feed.instruments?.map(stock=>stock.id)??[],freshIds:feed.quotes.filter(q=>q.fresh).map(q=>q.instrumentId)},history:history?JSON.parse(history):null,marketOpen:sessionTime().open};
}
export async function createPaperSession(raw:unknown) {
  const input=sessionSchema.parse(raw), strategy=await StrategyModel.findById(input.strategyId).lean();
  invariant(strategy,'Save a strategy before starting a paper session');
  invariant(input.expectedRevision === undefined || strategy.revision === input.expectedRevision, 'The strategy changed. Reload its saved rules before starting monitoring.');
  if(input.sourceBacktestId){
    const run=await BacktestRunModel.findById(input.sourceBacktestId).lean();
    invariant(run?.status==='completed'&&run.strategy._id===strategy._id&&run.strategy.revision===strategy.revision,'Run a completed backtest of the current saved strategy before using this report.');
    invariant(input.ids.every(id=>run.config.ids.includes(id)),'This report did not test all selected stocks. Backtest the new selection or start monitoring without linking this report.');
  }
  const universe=await MonthlyUniverseModel.findById(currentMonth()).lean();
  invariant(universe?.members.length,'Publish this month’s qualified stocks first');
  const ids=[...new Set(input.ids)];
  invariant(ids.every(id=>universe.members.some(m=>m.instrumentId===id)),'Only currently qualified stocks can be selected for entries');
  invariant(!await PaperSessionModel.exists({strategyId:strategy._id,active:true}),'This strategy already has an active paper session');
  const session = await PaperSessionModel.create({_id:randomUUID(),strategyId:strategy._id,strategy,ids,sourceBacktestId:input.sourceBacktestId,mode:input.mode,cashPaise:Math.round(strategy.risk.initialCapital*100),initialPaise:Math.round(strategy.risk.initialCapital*100),entriesPaused:false,active:true,createdAt:new Date().toISOString(),revision:1,message:'Connecting live data automatically. Waiting for fresh quotes and a completed candle after session start.'});
  await updatePaperSubscriptions(true);
  return session;
}
export async function freshQuote(id:string) {
  const feed=await feedStatus(), quote=feed.quotes.find(x=>x.instrumentId===id && x.fresh);
  invariant(quote && sessionTime().open,'A fresh live-feed quote during the regular cash-market session is required');
  return quote;
}
export async function manualPaperOrder(raw:unknown) {
  const input=orderSchema.parse(raw);
  const existing=await PaperOrderModel.findById(input.id).lean();
  if(existing){invariant(existing.sessionId===input.sessionId && existing.instrumentId===input.instrumentId && existing.side===input.side && existing.quantity===input.quantity && (input.orderType===undefined||existing.orderType===input.orderType) && (input.limitPrice===undefined||existing.limitPaise===Math.round(input.limitPrice*100)),'Order ID already used for a different order');return existing;}
  invariant(await redis.exists(PAPER_HEARTBEAT),'Start the paper worker before submitting orders');
  const session=await PaperSessionModel.findById(input.sessionId).lean();invariant(session?.active && session.mode!=='signals','Enable paper trading for this strategy before submitting orders');
  const quote=await freshQuote(input.instrumentId);
  let atr:number|undefined, signalLow:number|undefined;
  if(input.side==='BUY') {
    invariant(session.strategy.risk.overnight||sessionTime().minute<915,'Intraday entries close at 3:15 PM IST.');
    invariant(!session.ids || session.ids.includes(input.instrumentId),'Choose a stock included in this paper session');
    invariant(await MonthlyUniverseModel.exists({_id:currentMonth(),'members.instrumentId':input.instrumentId}),'Buy orders must use the current qualified list');
    if(['ATR','candleLow'].includes(session.strategy.risk.stopMode)) {
      const {data}=await engineClient.post('/decisions',{strategy:session.strategy,cutoff:new Date().toISOString(),instruments:await engineInstruments([input.instrumentId],new Date().toISOString(),false,strategyHistoryPlan(session.strategy,new Date().toISOString().slice(0,10),new Date().toISOString().slice(0,10)))});
      atr=data.results[0]?.atr; signalLow=data.results[0]?.signalLow;
      if(session.strategy.risk.stopMode==='ATR') invariant(atr && atr>0,'Import enough completed history to calculate the ATR stop');
      else invariant(signalLow && signalLow>0,'A completed candle is required to set the candle-low stop');
    }
  } else invariant(await PaperPositionModel.exists({sessionId:session._id,instrumentId:input.instrumentId,quantity:{$gte:input.quantity}}),'The sell quantity exceeds held paper shares');
  const at=new Date().toISOString();
  const orderType=input.orderType??(input.side==='BUY'&&session.strategy.risk.entryOrderType==='limit'?'limit':'market');
  const limitPaise=orderType==='limit'?Math.round((input.limitPrice??session.strategy.risk.entryLimitPrice!)*100):undefined;
  const expiresAt=orderType==='limit'?new Date(`${sessionTime().date}T${session.strategy.risk.overnight?'15:30':'15:15'}:00+05:30`).toISOString():new Date(Date.now()+60000).toISOString();
  invariant(Date.parse(expiresAt)>Date.now(),'The intraday limit-order window has ended. Use a market exit.');
  let result:PaperOrder|undefined;
  await mongoose.connection.transaction(async transaction=>{
    // Manual intervention pauses automatic entries atomically with order creation.
    await PaperSessionModel.updateOne({_id:session._id},{$set:{entriesPaused:true},$inc:{revision:1}},{session:transaction});
    const held=input.side==='SELL'?await PaperPositionModel.findOne({sessionId:session._id,instrumentId:input.instrumentId}).session(transaction).lean():null;
    if(input.side==='SELL')invariant(held&&held.quantity>=input.quantity,'The held quantity changed. Refresh your positions.');
    invariant(!await PaperOrderModel.exists({sessionId:session._id,instrumentId:input.instrumentId,status:{$in:['pending','confirmation']}}).session(transaction),'This stock already has an unfilled order. Modify or cancel it, or use Exit all.');
    result=(await PaperOrderModel.create([{_id:input.id,sessionId:session._id,instrumentId:input.instrumentId,side:input.side,quantity:input.quantity,source:'manual',status:'pending',orderType,createdAt:at,eligibleAfter:at>quote.at?at:quote.at,expiresAt,reason:'Manual paper order',atr,signalLow,limitPaise,positionOpenedAt:held?.openedAt}],{session:transaction}))[0].toObject();
  });
  await announce('paper.orders');
  return result;
}
export async function confirmPaperOrder(id:string) {
  const order=await PaperOrderModel.findById(id).lean();invariant(order?.status==='confirmation','This order is not awaiting confirmation');
  invariant(Date.parse(order.expiresAt)>Date.now(),'This signal has expired');await freshQuote(order.instrumentId);
  const result=await PaperOrderModel.findOneAndUpdate({_id:id,status:'confirmation'},{$set:{status:'pending',eligibleAfter:new Date().toISOString()}},{returnDocument:'after'}).lean();
  await announce('paper.orders');return result;
}
export async function cancelPaperOrder(id:string) {
  const result=await PaperOrderModel.updateOne({_id:id,source:{$ne:'protection'},status:{$in:['pending','confirmation']}},{$set:{status:'cancelled'}});
  invariant(result.modifiedCount,'Only unfilled manual or signal orders can be cancelled. Automatic protective exits remain active.');
}
export async function pauseEntries(id:string, entriesPaused:boolean) {
  await mongoose.connection.transaction(async transaction=>{
    invariant(await PaperSessionModel.exists({_id:id,active:true}).session(transaction),'Active session required');
    await PaperSessionModel.updateOne({_id:id},{$set:{entriesPaused},$inc:{revision:1}},{session:transaction});
    if(entriesPaused) await PaperOrderModel.updateMany({sessionId:id,side:'BUY',source:'signal',status:{$in:['pending','confirmation']}},{$set:{status:'cancelled',message:'Automatic entries paused'}},{session:transaction});
  });
  await updatePaperSubscriptions(!entriesPaused);
}
export async function stopPaperSession(id:string) {
  await mongoose.connection.transaction(async transaction=>{
    invariant(await PaperSessionModel.exists({_id:id,active:true}).session(transaction),'Active session required');
    invariant(!await PaperPositionModel.exists({sessionId:id}).session(transaction),'Close held paper positions before stopping this session so their exits remain protected');
    await PaperOrderModel.updateMany({sessionId:id,status:{$in:['pending','confirmation']}},{$set:{status:'cancelled',message:'Paper monitoring stopped'}},{session:transaction});
    await PaperSessionModel.updateOne({_id:id},{$set:{active:false,entriesPaused:true,message:'Stopped. You can start a new session with the latest saved strategy.'},$inc:{revision:1}},{session:transaction});
  });
  await updatePaperSubscriptions();
}
export async function sessionInstruments() {
  const universe=await MonthlyUniverseModel.findById(currentMonth()).lean(), held=await PaperPositionModel.distinct('instrumentId');
  const ids=[...new Set([...(universe?.members.map(x=>x.instrumentId)??[]),...held])];
  return instruments.find({_id:{$in:ids}}).lean();
}

export async function configurePaperSession(id:string,raw:unknown){
  const input=sessionConfigurationSchema.parse(raw);
  await mongoose.connection.transaction(async transaction=>{
    const session=await PaperSessionModel.findById(id).session(transaction).lean();
    invariant(session?.active,'Active monitoring required');
    if(input.mode==='signals'){
      invariant(!await PaperPositionModel.exists({sessionId:id}).session(transaction),'Close held paper positions before changing to signals only. You can pause new entries instead.');
      await PaperOrderModel.updateMany({sessionId:id,status:{$in:['pending','confirmation']}},{$set:{status:'cancelled',message:'Changed to signals only'}},{session:transaction});
    }
    if(input.ids){
      const universe=await MonthlyUniverseModel.findById(currentMonth()).session(transaction).lean();
      invariant(input.ids.every(stock=>universe?.members.some(m=>m.instrumentId===stock)),'Choose currently qualified stocks. Held stocks retain exit monitoring automatically.');
      await PaperOrderModel.updateMany({sessionId:id,side:'BUY',instrumentId:{$nin:input.ids},status:{$in:['pending','confirmation']}},{$set:{status:'cancelled',message:'Removed from monitored stocks'}},{session:transaction});
    }
    await PaperSessionModel.updateOne({_id:id},{$set:{...input,...(input.ids?{ids:[...new Set(input.ids)]}:{}),message:'Settings updated. New settings apply to upcoming signals.'},$inc:{revision:1}},{session:transaction});
  });
  await updatePaperSubscriptions(true);
}

export { paperOrderHistory } from './order-history.service.js';
