import { carriedIntradayPositions } from './intraday-continuation.js';
import {executionOpen} from './execution-session.js';
import { paperReentryBlock } from './reentry.service.js';
import { protectiveBookQuote } from './book-exit.js';
import type {LiveBook} from '../../market-feed/types/feed.types.js';
import { entryCutoffMinute } from './entry-safety.js';
import { tradeFeePaise } from './trading-costs.js';
import { PaperSafetyModel, entryDeviation, dailyRiskBlocked } from './execution-safety.js';
import mongoose from 'mongoose';
import { buySize } from './order-estimate.js';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel } from '../models/paper.model.js';
import { MonthlyUniverseModel } from '../../qualification/models/qualification.model.js';
import { currentMonth } from '../../qualification/services/universe.service.js';
import type { LiveQuote } from '../../market-feed/types/feed.types.js';
import { sessionTime } from './paper.service.js';
import { InvalidTargetPriceError, nextTarget, positionTargets } from './exit-targets.js';
import { advanceStop, initialRiskDistance, exceedsStopLimit, stopLimitMessage } from './stop-management.js';
import { exitAccounting, type ExitAccounting } from './trade-pnl.js';

// Internal execution function: callers supply a verified feed-session quote;
// no API accepts a price. Integer paise and one transaction protect the ledger.
export async function fillPaperOrder(id:string, quote:LiveQuote, now=Date.now(),book?:LiveBook) {
  if(book){const order=await PaperOrderModel.findById(id).lean();if(!order)return;const bidQuote=protectiveBookQuote(order,quote,book,now);if(!bidQuote)return;quote=bidQuote;}
  const quoteTime = Date.parse(quote.at);
  if(!executionOpen(quote.instrumentId,now) || !Number.isFinite(quoteTime) || now-quoteTime>15000 || quoteTime>now+1000 || !Number.isFinite(quote.price) || Math.round(quote.price*100)<=0)return;
  await mongoose.connection.transaction(async transaction=>{
    const order=await PaperOrderModel.findById(id).session(transaction).lean();
    if(!order || order.status!=='pending' || order.instrumentId!==quote.instrumentId || !(quoteTime>Date.parse(order.eligibleAfter)))return;
    if(book&&!protectiveBookQuote(order,quote,book,now))return;
    if(quote.details?.upperCircuit&&quote.price>=quote.details.upperCircuit || quote.details?.lowerCircuit&&quote.price<=quote.details.lowerCircuit){await PaperOrderModel.updateOne({_id:id,status:'pending'},{$set:{message:'At a circuit limit. Quote-only execution cannot establish available liquidity; waiting for a tradable price.'}},{session:transaction});return;}
    const reject=async(message:string,status='rejected')=>{await PaperOrderModel.updateOne({_id:id,status:'pending'},{$set:{status,message}},{session:transaction});};
    if(!Number.isFinite(Date.parse(order.expiresAt)) || Date.parse(order.expiresAt)<=now){await reject('No eligible fill before expiry','expired');return;}
    const session=await PaperSessionModel.findById(order.sessionId).session(transaction).lean();
    if(!session?.active || session.mode==='signals'){await reject('Paper session is not active');return;}
    const risk=session.strategy.risk, positionId=`${session._id}:${quote.instrumentId}`;
    const positions=await PaperPositionModel.find({sessionId:session._id}).session(transaction).lean(), held=positions.find(x=>x._id===positionId);
    if(held?.corporateActionPending){await PaperOrderModel.updateOne({_id:id,status:'pending'},{$set:{message:held.corporateActionPending}},{session:transaction});return;}
    const limit=order.orderType==='market'?undefined:order.limitPaise??(order.side==='BUY'&&risk.entryOrderType==='limit'?Math.round(risk.entryLimitPrice!*100):undefined);
    if(limit!==undefined && (order.side==='BUY'?Math.round(quote.price*100)>limit:Math.round(quote.price*100)<limit))return;
    const slipped=Math.round(quote.price*100*(1+(order.side==='BUY'?1:-1)*risk.slippagePercent/100));
    const fill=order.side==='BUY'?Math.min(limit??Infinity,slipped):Math.max(limit??0,slipped);
    if(quote.details?.upperCircuit&&fill/100>=quote.details.upperCircuit || quote.details?.lowerCircuit&&fill/100<=quote.details.lowerCircuit){await PaperOrderModel.updateOne({_id:id,status:'pending'},{$set:{message:'Estimated fill reaches a circuit limit after slippage; waiting for a tradable price.'}},{session:transaction});return;}
    let quantity=order.quantity;
    let change:number,fee:number;
    let accounting:ExitAccounting|undefined;
    if(order.side==='BUY'){
      if(carriedIntradayPositions(risk.overnight,positions,now).length){await reject('Unresolved intraday positions from an earlier day must exit before new buys. Protective exits remain active.');return;}
      const safety=await PaperSafetyModel.findOneAndUpdate({_id:'global'},{$inc:{revision:1}},{upsert:true,returnDocument:'after',session:transaction}).lean();
      if(safety?.halted){await reject('Emergency entry halt is active. Existing exits remain enabled.');return;}
      if(dailyRiskBlocked(session,now)){await reject('Daily loss limit reached. New buys blocked for this trading day.');return;}
      if(order.referencePrice!==undefined){const drift=entryDeviation(order.referencePrice,fill/100,session.maxEntryDeviationPercent??2);if(drift){await reject(drift);return;}}

      if(session.ids && !session.ids.includes(quote.instrumentId)){await reject('Stock is outside this paper session scope');return;}
      if(session.entriesPaused && order.source==='signal' && !order.amendments?.length){await reject('Automatic entries are paused');return;}
      if(!risk.overnight && sessionTime(now).minute>=entryCutoffMinute(risk,quote.instrumentId,now)){await reject('Intraday entry cutoff reached');return;}
      if(!await MonthlyUniverseModel.exists({_id:currentMonth(),'members.instrumentId':quote.instrumentId}).session(transaction)){await reject('Stock is no longer in the monthly qualified list');return;}
      if(held || positions.length>=risk.maxPositions){await reject('An existing position or the position limit blocks this entry');return;}
      const blocked=await paperReentryBlock(session._id,quote.instrumentId,risk,new Date(now).toISOString(),transaction);
      if(blocked){await reject(blocked);return;}
      const distance=initialRiskDistance(risk,fill,order.atr,order.signalLow);
      if(!Number.isFinite(distance) || distance<=0 || distance>=fill){await reject('Initial stop must be below the filled entry price, with a positive risk distance');return;}
      if(exceedsStopLimit(risk,fill,distance)){await reject(stopLimitMessage(risk,fill,distance));return;}
      const {maxRisk,maxCash}=buySize(session,positions,fill,distance);
      if(quantity===0)quantity=Math.min(maxRisk,maxCash);
      if(quantity<1 || quantity>maxRisk || quantity>maxCash){await reject('Quantity exceeds available paper cash or per-trade risk');return;}
      fee=tradeFeePaise(fill*quantity,'BUY',risk);change=-(fill*quantity+fee);
      if(session.cashPaise+change<0){await reject('Insufficient paper cash');return;}
      let targets:ReturnType<typeof positionTargets>;
      try { targets=positionTargets(risk,fill,quantity,distance); }
      catch(error) {
        if(!(error instanceof InvalidTargetPriceError))throw error;
        await reject(error.message);return;
      }
      await PaperPositionModel.create([{_id:positionId,sessionId:session._id,instrumentId:quote.instrumentId,symbol:quote.symbol,quantity,initialQuantity:quantity,entryPaise:fill,initialRiskPaise:distance,costPaise:-change,stopPaise:fill-distance,targetPaise:targets?.find(t=>!t.completed)?.pricePaise??Math.round(fill+distance*risk.targetR),targets,openedAt:new Date(now).toISOString()}],{session:transaction});
    } else {
      if(!held){await reject('No held shares to sell');return;}
      if(order.positionOpenedAt && order.positionOpenedAt!==held.openedAt){await reject('This exit belongs to an earlier position');return;}
      const targetIndex=order.targetIndex;
      if(targetIndex!==undefined){
        if(order.source!=='protection' || targetIndex<0 || targetIndex!==nextTarget(held)){await reject('This target is no longer pending');return;}
        quantity=targetIndex===held.targets!.length-1?held.quantity:Math.min(held.quantity,held.targets![targetIndex].quantity);
      }
      if(quantity===0)quantity=held.quantity;
      if(book&&quantity>(book.bids?.[0]?.quantity??0)){await PaperOrderModel.updateOne({_id:id},{$set:{message:'Protective exit waits: fresh best bid has insufficient displayed quantity.'}},{session:transaction});return;}
      if(quantity>held.quantity){await reject('Sell quantity exceeds held shares');return;}
      fee=tradeFeePaise(fill*quantity,'SELL',risk);change=fill*quantity-fee;
      accounting=exitAccounting(held,quantity,fill,fee);
      if(quantity===held.quantity)await PaperPositionModel.deleteOne({_id:positionId},{session:transaction});
      else {
        const changes:Partial<typeof held>={costPaise:held.costPaise-accounting.allocatedCostPaise};
        if(targetIndex!==undefined){
          const targets=held.targets!.map((t,i)=>i===targetIndex?{...t,completed:true,filledAt:new Date(now).toISOString(),filledQuantity:quantity}:t);
          changes.targets=targets; changes.targetPaise=targets.find(t=>!t.completed)!.pricePaise;
          Object.assign(changes,advanceStop({...held,targets},risk,Math.round(quote.price*100)));
        }
        await PaperPositionModel.updateOne({_id:positionId},{$inc:{quantity:-quantity},$set:changes},{session:transaction});
      }
    }
    // Concurrent orders write this same session record; Mongo retries conflicts.
    await PaperSessionModel.updateOne({_id:session._id},{$inc:{cashPaise:change,revision:1}},{session:transaction});
    await PaperOrderModel.updateOne({_id:id,status:'pending'},{$set:{status:'filled',fillSource:book?'book':'trade',message:book?'Paper protective exit filled from fresh best bid; historical candle tests do not simulate depth.':undefined,quantity,fillPaise:fill,feePaise:fee,filledAt:new Date(now).toISOString(),quoteAt:quote.at,...accounting}},{session:transaction});
  });
}
