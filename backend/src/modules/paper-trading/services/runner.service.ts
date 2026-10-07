import { paperReentryBlock } from './reentry.service.js';
import {executionOpen,squareOffMinute} from './execution-session.js';
import { entryAfterExit, entryCutoffMinute } from './entry-safety.js';
import { refreshDailyLossLimits, PaperSafetyModel, dailyRiskBlocked } from './execution-safety.js';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/errors.js';
import { engineClient, engineInstruments, type EvaluationResult } from '../../engine/services/engine.service.js';
import { feedStatus } from '../../market-feed/services/feed.service.js';
import { MonthlyUniverseModel } from '../../qualification/models/qualification.model.js';
import { currentMonth } from '../../qualification/services/universe.service.js';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel, PaperSignalModel, PaperEvaluationModel, PaperObservationModel, PaperEntryEventModel } from '../models/paper.model.js';
import { freshEntry } from './entry-events.js';
import { evaluationWindow, signalOrderExpiry } from './evaluation-window.js';
import { strategyHistoryPlan } from '../../backtesting/services/history-plan.js';
import { fillPaperOrder } from './fill.service.js';
import { sessionTime } from './paper.service.js';
import { monitoringIds } from './scope.service.js';
import {redis} from '../../../shared/redis.js';
import {currentQuote} from '../../market-feed/services/shared-feed.js';
import type {LiveBook} from '../../market-feed/types/feed.types.js';
import type {LiveQuote} from '../../market-feed/types/feed.types.js';
import {protectiveTrigger} from './protection.js';
import { queueIntradaySquareOff } from './square-off.service.js';
interface Decision {id:string;entry:EvaluationResult;exit:EvaluationResult;barEnd:string|null;atr:number|null;signalLow?:number|null;referencePrice?:number|null}
let lastTickId:string|undefined;
async function recentTicks(){
  // Restart from current time. Missed ticks must never become retrospective fills.
  lastTickId??=`${Date.now()}-0`;
  const records=await redis.xrange('quantforge:market:ticks',`(${lastTickId}`,'+','COUNT',5000);
  return {ticks:records.map(([,fields])=>JSON.parse(fields[1]) as LiveQuote),cursor:records.at(-1)?.[0]??lastTickId};
}
export async function processPaperOrders(canContinue = () => true){
  if(!canContinue())return;
  const now=new Date().toISOString();
  await PaperOrderModel.updateMany({status:'pending',side:'SELL',source:'protection',targetIndex:{$exists:false},expiresAt:{$lte:now}},{$set:{expiresAt:new Date(Date.now()+60000).toISOString(),message:'Protective exit re-armed: waiting for fresh executable liquidity. Position remains open.'}});
  await PaperOrderModel.updateMany({status:{$in:['pending','confirmation']},expiresAt:{$lte:now}},{$set:{status:'expired',message:'Order expired before an eligible fill'}});
  await queueIntradaySquareOff(Date.now(),canContinue);
  const feed=await feedStatus();
  if(sessionTime().open&&feed.workerRunning&&feed.enabled){
    for(const order of await PaperOrderModel.find({status:'pending',side:'SELL',source:'protection',targetIndex:{$exists:false}}).lean()){
      if(!canContinue())return;
      const raw=await redis.get(`quantforge:execution:book:${order.instrumentId}`);if(!raw)continue;
      const book=JSON.parse(raw) as LiveBook,stock=feed.instruments?.find(s=>s.id===order.instrumentId);if(!stock)continue;
      // A quiet stock's cached trade may have expired; book execution needs instrument
      // metadata and an active stream, not a fabricated new last-trade price.
      const quote:LiveQuote=feed.quotes.find(q=>q.instrumentId===order.instrumentId&&q.session===book.session)??{instrumentId:stock.id,symbol:stock.symbol,exchange:stock.exchange,source:book.source,session:book.session,price:0,cumulativeVolume:null,at:'',receivedAt:book.receivedAt};
      if(currentQuote(feed,quote))await fillPaperOrder(order._id,quote,Date.now(),book);
    }
  }
  if(!sessionTime().open || feed.state!=='live'){lastTickId=`${Date.now()}-0`;return;}
  await refreshDailyLossLimits(feed.quotes);
  const {ticks,cursor}=await recentTicks(),current=feed.quotes.filter(x=>x.fresh);
  const quotes=ticks.filter(q=>current.some(c=>c.instrumentId===q.instrumentId && c.session===q.session) && Date.now()-Date.parse(q.at)<=15000 && Date.parse(q.at)<=Date.now()+1000);
  const sessions=await PaperSessionModel.find({active:true}).lean();
  const ids=sessions.map(s=>s._id);
  const [positions,orders]=await Promise.all([
    PaperPositionModel.find({sessionId:{$in:ids}}).select('sessionId instrumentId').lean(),
    PaperOrderModel.find({sessionId:{$in:ids},status:{$in:['pending','confirmation']}}).select('sessionId instrumentId').lean(),
  ]);
  const interested=new Map<string,Set<string>>();
  for(const item of [...positions,...orders]){
    const set=interested.get(item.instrumentId)??new Set<string>();set.add(item.sessionId);interested.set(item.instrumentId,set);
  }
  // Consume ticks in order: a target fill changes the size and stop before the
  // next tick is inspected, including when several ticks arrive in one batch.
  for(const quote of quotes){
    if(!canContinue())return;
    const relevant=interested.get(quote.instrumentId);
    if(relevant)await processPaperQuote(quote,[...relevant],Date.now(),canContinue);
  }
  lastTickId=cursor;
}

/** Internal only: caller verifies the feed session. Never accepts user prices. */
export async function processPaperQuote(quote:LiveQuote,sessionIds:string[],now=Date.now(),canContinue=()=>true){
  if(!canContinue() || !executionOpen(quote.instrumentId,now) || !Number.isFinite(quote.price) || quote.price<=0 || !Number.isFinite(Date.parse(quote.at)) || now-Date.parse(quote.at)>15000 || Date.parse(quote.at)>now+1000)return;
  const protect=async()=>{
    for(const sessionId of sessionIds){
      if(!canContinue())return;
      await mongoose.connection.transaction(async transaction=>{
        const session=await PaperSessionModel.findById(sessionId).session(transaction).lean();
        if(!session?.active || !canContinue())return;
        const position=await PaperPositionModel.findOne({sessionId,instrumentId:quote.instrumentId}).session(transaction).lean();
        if(!position||position.corporateActionPending)return;
        const risk=session.strategy.risk;
        const trigger=protectiveTrigger(position,risk,[quote],!risk.overnight && (sessionTime(now).minute>=squareOffMinute(quote.instrumentId,now) || position.openedAt.slice(0,10)<new Date(now).toISOString().slice(0,10)));
        const {highWaterPaise,breakevenActivated,trailingActivated,lastProtectionAt}=trigger.state;
        await PaperPositionModel.updateOne({_id:position._id},{$max:{stopPaise:trigger.stop},$set:{highWaterPaise,breakevenActivated,trailingActivated,lastProtectionAt}},{session:transaction});
        if(!trigger.reason)return;
        const active=await PaperOrderModel.findOne({sessionId,instrumentId:quote.instrumentId,status:{$in:['pending','confirmation']}}).session(transaction).lean();
        // A confirmed sell rule/manual exit should finish, not be replaced by
        // a smaller profit-taking leg. Stops still have priority.
        if(trigger.targetIndex!==undefined && active?.status==='pending' && active.side==='SELL' && active.source!=='protection')return;
        // Stops / session exits override an outstanding partial target. An
        // already queued protection order is otherwise kept, never retriggered.
        if(active?.source==='protection' && !(active.targetIndex!==undefined && trigger.targetIndex===undefined))return;
        if(active)await PaperOrderModel.updateOne({_id:active._id},{$set:{status:'cancelled',message:'Replaced by protective exit'}},{session:transaction});
        const index=trigger.targetIndex;
        const quantity=index===undefined?0:index===position.targets!.length-1?position.quantity:Math.min(position.quantity,position.targets![index].quantity);
        await PaperOrderModel.create([{_id:randomUUID(),sessionId,instrumentId:position.instrumentId,side:'SELL',quantity,source:'protection',status:'pending',createdAt:new Date(now).toISOString(),eligibleAfter:quote.at,expiresAt:new Date(now+60000).toISOString(),reason:trigger.reason,targetIndex:index,positionOpenedAt:position.openedAt}],{session:transaction});
      });
    }
  };
  await protect();
  for(const order of await PaperOrderModel.find({sessionId:{$in:sessionIds},instrumentId:quote.instrumentId,status:'pending',eligibleAfter:{$lt:quote.at}}).lean()){
    if(!canContinue())return;
    await fillPaperOrder(order._id,quote,now);
  }
  // A gap can cross another target. Queue it after this fill and wait for a
  // later tick; a single quote must never fill two target legs retrospectively.
  await protect();
}
export async function evaluatePaperStrategies(now = Date.now(), canContinue = () => true){
  const startedAt=Date.now();
  const sessions=await PaperSessionModel.find({active:true}).lean();if(!sessions.length)return;
  const universe=await MonthlyUniverseModel.findById(currentMonth()).lean();
  for(const session of sessions){
    if(!canContinue())return;
    const held=await PaperPositionModel.find({sessionId:session._id}).lean();
    const ids=monitoringIds(universe?.members.map(x=>x.instrumentId)??[],session.ids,held.map(x=>x.instrumentId),session.entriesPaused);
    const update=async(message:string)=>{await PaperSessionModel.updateOne({_id:session._id},{$set:{checkedAt:new Date().toISOString(),message}});};
    if(!ids.length){await update(session.entriesPaused?'New entries are paused. Pending manual orders still wait for fresh quotes; resume new buys to check entry rules again.':'No qualified stocks in this selection. Publish a list or update the monitored selection.');continue;}
    if(ids.length>200){await update('This worker supports up to 200 qualified and held stocks per session.');continue;}
    const cadence=String(session.strategy.entry.cadence), window=evaluationWindow(cadence,session.createdAt,now);
    if(!window){await update(sessionTime(now).knownYear?'Waiting for the next completed candle. Fills require fresh live ticks during market hours.':'Trading calendar needs updating before monitoring can resume.');continue;}
    try{
      const cutoff=window.barEnd,data:{results:Decision[]}={results:[]};
      const sideFor=(id:string)=>held.some(p=>p.instrumentId===id)?'SELL':'BUY';
      const evaluationId=(id:string)=>`${session._id}:${id}:${session.mode==='signals'?'WATCH':sideFor(id)}:${window.barEnd}`;
      const completed=new Set((await PaperEvaluationModel.find({_id:{$in:ids.map(evaluationId)}}).select('_id').lean()).map(row=>row._id));
      const pendingIds=ids.filter(id=>!completed.has(evaluationId(id)));if(!pendingIds.length)continue;
      const today=sessionTime(now).date, plan=strategyHistoryPlan(session.strategy,today,today);
      for(let index=0;index<pendingIds.length;index+=5){
        if(!canContinue())return;
        const instruments=await engineInstruments(pendingIds.slice(index,index+5),cutoff,false,plan);
        const response=await engineClient.post<{results:Decision[]}>('/decisions',{strategy:session.strategy,cutoff,instruments});
        data.results.push(...response.data.results);
      }
      const priorEvents = await PaperEntryEventModel.find({sessionId:session._id,instrumentId:{$in:pendingIds}}).lean();
      const observedEntry = (result:Decision) => freshEntry(session.strategy.entry,result.entry,new Set(priorEvents.filter(row=>row.instrumentId===result.id).map(row=>row.eventKey!))).evaluation;
      if(data.results.length)await PaperObservationModel.bulkWrite(data.results.map(result=>({updateOne:{filter:{_id:`${session._id}:${result.id}`},update:{$set:{sessionId:session._id,instrumentId:result.id,barEnd:result.barEnd,checkedAt:new Date(now).toISOString(),current:!!result.barEnd&&Date.parse(result.barEnd)===Date.parse(window.barEnd),entry:observedEntry(result),exit:result.exit,referencePrice:result.referencePrice??null}},upsert:true}})));
      let unavailable=0,signals=0;
      for(const result of data.results.sort((a,b)=>a.id.localeCompare(b.id))){
        const decisionTime=now+Date.now()-startedAt;
        if(!canContinue())return;
        if(decisionTime>=Date.parse(window.expiresAt)){unavailable++;continue;}
        if(!result.barEnd || Date.parse(result.barEnd)!==Date.parse(window.barEnd)){unavailable++;continue;}
        if(session.mode==='signals'){
          await mongoose.connection.transaction(async transaction=>{
            const current=await PaperSessionModel.findById(session._id).session(transaction).lean();
            if(!current?.active||current.mode!=='signals'||current.entriesPaused||!canContinue())return;
            if(current.ids&&!current.ids.includes(result.id))return;
            if(!await MonthlyUniverseModel.exists({_id:currentMonth(),'members.instrumentId':result.id}).session(transaction))return;
            let allDecided=true;
            for(const side of ['BUY','SELL'] as const){
              if(side==='BUY'&&!current.strategy.risk.overnight&&sessionTime(decisionTime).minute>=entryCutoffMinute(current.strategy.risk,result.id,decisionTime))continue;
              const consumed = side === 'BUY' ? await PaperEntryEventModel.find({sessionId:session._id,instrumentId:result.id}).session(transaction).lean() : [];
              const fresh = freshEntry(session.strategy.entry,result.entry,new Set(consumed.map(x=>x.eventKey!)));
              const evaluation=side==='BUY'?fresh.evaluation:result.exit;
              if(evaluation.matched===null){unavailable++;allDecided=false;continue;}
              if(!evaluation.matched)continue;
              const signalId=`${session._id}:${result.id}:${side}:${window.barEnd}`;
              if(await PaperSignalModel.exists({_id:signalId}).session(transaction))continue;
              await PaperSignalModel.create([{_id:signalId,sessionId:session._id,instrumentId:result.id,side,barEnd:window.barEnd,createdAt:new Date(decisionTime).toISOString(),expiresAt:window.expiresAt,referencePrice:result.referencePrice??undefined,checks:evaluation.checks,message:side==='SELL'?'Sell conditions met. For existing holdings only; this is not a short-sale instruction.':'Buy conditions met. Signals-only monitoring does not create orders.'}],{session:transaction});
              if(side==='BUY' && fresh.eventKeys.length) await PaperEntryEventModel.insertMany(fresh.eventKeys.map(eventKey=>({_id:`${session._id}:${result.id}:${eventKey}`,sessionId:session._id,instrumentId:result.id,eventKey,createdAt:new Date(now).toISOString()})),{session:transaction});
              signals++;
            }
            if(allDecided&&!await PaperEvaluationModel.exists({_id:evaluationId(result.id)}).session(transaction))await PaperEvaluationModel.create([{_id:evaluationId(result.id),processedAt:new Date(now)}],{session:transaction});
          });
          continue;
        }
        const selling=held.some(p=>p.instrumentId===result.id),side=selling?'SELL':'BUY',evaluation=selling?result.exit:result.entry;
        if(selling && Date.parse(result.barEnd)<=Date.parse(held.find(p=>p.instrumentId===result.id)!.openedAt))continue;
        if(evaluation.matched===null){unavailable++;continue;}
        const signalId=`${session._id}:${result.id}:${side}:${window.barEnd}`;
        await mongoose.connection.transaction(async transaction=>{
          if(!canContinue())return;
          if(await PaperEvaluationModel.exists({_id:signalId}).session(transaction))return;
          const current=await PaperSessionModel.findById(session._id).session(transaction).lean();
          if(!current?.active||current.mode==='signals')return;
          if(!selling && current.ids&&!current.ids.includes(result.id))return;
          const currentlyHeld=await PaperPositionModel.findOne({sessionId:session._id,instrumentId:result.id}).select('openedAt').session(transaction).lean();
          if(!!currentlyHeld!==selling)return;
          // History evaluation can overlap a manual/protective exit and re-entry.
          // A result for the old holding must never create an exit for its replacement.
          if(selling && (currentlyHeld!.openedAt!==held.find(p=>p.instrumentId===result.id)!.openedAt || Date.parse(result.barEnd!)<=Date.parse(currentlyHeld!.openedAt)))return;
          if(!selling && (current.entriesPaused || !await MonthlyUniverseModel.exists({_id:currentMonth(),'members.instrumentId':result.id}).session(transaction)))return;
          if(!selling && (dailyRiskBlocked(current,now)||(await PaperSafetyModel.findById('global').session(transaction).lean())?.halted))return;
          if(!selling){
            const lastExit=await PaperOrderModel.findOne({sessionId:session._id,instrumentId:result.id,side:'SELL',status:'filled'}).sort({filledAt:-1}).select('filledAt').session(transaction).lean();
            if(!entryAfterExit(result.barEnd!,lastExit?.filledAt)||(!current.strategy.risk.overnight&&sessionTime(decisionTime).minute>=entryCutoffMinute(current.strategy.risk,result.id,decisionTime))){
              await PaperEvaluationModel.create([{_id:signalId,processedAt:new Date(now)}],{session:transaction});return;
            }
          }
          if(!selling){
            const blocked=await paperReentryBlock(session._id,result.id,current.strategy.risk,result.barEnd!,transaction);
            if(blocked){
              await PaperObservationModel.updateOne({_id:`${session._id}:${result.id}`},{$set:{'entry.matched':false},$push:{'entry.checks':{field:'Entry safeguards',matched:false,reason:blocked}}},{session:transaction});
              await PaperEvaluationModel.create([{_id:signalId,processedAt:new Date(now)}],{session:transaction});return;
            }
          }
          const consumed = selling ? [] : await PaperEntryEventModel.find({sessionId:session._id,instrumentId:result.id}).session(transaction).lean();
          const fresh = freshEntry(session.strategy.entry,result.entry,new Set(consumed.map(x=>x.eventKey!)));
          if(!selling && fresh.evaluation.matched===null){unavailable++;return;}
          if(!selling && !fresh.evaluation.matched || selling && !evaluation.matched){await PaperEvaluationModel.create([{_id:signalId,processedAt:new Date(now)}],{session:transaction});return;}
          const active=await PaperOrderModel.exists({sessionId:session._id,instrumentId:result.id,status:{$in:['pending','confirmation']}}).session(transaction);
          const atrMissing=!selling && (session.strategy.risk.stopMode==='ATR' && !result.atr || session.strategy.risk.stopMode==='candleLow' && !(result.signalLow && result.signalLow>0));
          // Missing stop data can arrive during a later refresh: do not consume this candle yet.
          if(atrMissing){unavailable++;return;}
          if(await PaperSignalModel.exists({_id:signalId}).session(transaction)){await PaperEvaluationModel.create([{_id:signalId,processedAt:new Date(now)}],{session:transaction});return;}
          // Reserve capacity for already queued buys; do not flood the ledger
          // with orders that can only fail once the first few quotes arrive.
          const occupied = selling ? 0 : await PaperPositionModel.countDocuments({sessionId:session._id}).session(transaction);
          const reserved = selling ? 0 : await PaperOrderModel.countDocuments({sessionId:session._id,side:'BUY',status:{$in:['pending','confirmation']}}).session(transaction);
          const capacityBlocked=!selling && occupied+reserved>=current.strategy.risk.maxPositions;
          const orderId=active||atrMissing||capacityBlocked?undefined:randomUUID();
          if(orderId&&!selling)await PaperSessionModel.updateOne({_id:session._id},{$inc:{revision:1}},{session:transaction});
          const createdAt=new Date(decisionTime).toISOString();
          const dayLimit=!selling && session.strategy.risk.entryOrderType==='limit';
          const expiresAt=signalOrderExpiry(window.expiresAt,dayLimit,session.strategy.risk.overnight,result.id);
          if(Date.parse(expiresAt)<=decisionTime)return;
          await PaperSignalModel.create([{_id:signalId,sessionId:session._id,instrumentId:result.id,side,barEnd:window.barEnd,createdAt,expiresAt,referencePrice:result.referencePrice??undefined,checks:(selling?evaluation:fresh.evaluation).checks,orderId,message:active?'An order already awaits action':capacityBlocked?'Buy conditions met; all position slots are held or reserved by pending buys. No order created.':undefined}],{session:transaction});
          if(orderId)await PaperOrderModel.create([{_id:orderId,sessionId:session._id,instrumentId:result.id,side,quantity:0,source:'signal',status:current.mode==='automatic'?'pending':'confirmation',createdAt,eligibleAfter:createdAt,expiresAt,referencePrice:result.referencePrice??undefined,reason:selling?'Sell rule on completed candle':'Buy rule on completed candle',positionOpenedAt:selling?currentlyHeld!.openedAt:undefined,atr:result.atr??undefined,signalLow:result.signalLow??undefined,limitPaise:dayLimit?Math.round(session.strategy.risk.entryLimitPrice!*100):undefined}],{session:transaction});
          if(!selling && fresh.eventKeys.length) await PaperEntryEventModel.insertMany(fresh.eventKeys.map(eventKey=>({_id:`${session._id}:${result.id}:${eventKey}`,sessionId:session._id,instrumentId:result.id,eventKey,createdAt})),{session:transaction});
          await PaperEvaluationModel.create([{_id:signalId,processedAt:new Date(now)}],{session:transaction});
          signals++;
        });
      }
      await update(`Checked ${ids.length} stocks · ${signals} new signals · ${unavailable} missing or stale observations.`);
    }catch(e){await update(e instanceof AppError?e.message:'Rule evaluation unavailable; existing protective exits remain active.');}
  }
}
