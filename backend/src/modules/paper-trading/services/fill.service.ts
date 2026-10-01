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
export async function fillPaperOrder(id:string, quote:LiveQuote, now=Date.now()) {
  if(!sessionTime(now).open || now-Date.parse(quote.at)>15000 || Date.parse(quote.at)>now+1000 || !Number.isFinite(quote.price) || quote.price<=0)return;
  await mongoose.connection.transaction(async transaction=>{
    const order=await PaperOrderModel.findById(id).session(transaction).lean();
    if(!order || order.status!=='pending' || order.instrumentId!==quote.instrumentId || quote.at<=order.eligibleAfter)return;
    const reject=async(message:string,status='rejected')=>{await PaperOrderModel.updateOne({_id:id,status:'pending'},{$set:{status,message}},{session:transaction});};
    if(Date.parse(order.expiresAt)<=now){await reject('No eligible fill before expiry','expired');return;}
    const session=await PaperSessionModel.findById(order.sessionId).session(transaction).lean();
    if(!session?.active || session.mode==='signals'){await reject('Paper session is not active');return;}
    const positionId=`${session._id}:${quote.instrumentId}`, manual=session.mode==='manual';
    const positions=await PaperPositionModel.find({sessionId:session._id}).session(transaction).lean(), held=positions.find(x=>x._id===positionId);
    // Manual trades carry their own plan; exits keep the plan the position was opened with.
    const risk=(order.side==='BUY'?order.plan:held?.plan)??session.strategy.risk;
    const limit=order.orderType==='market'?undefined:order.limitPaise??(order.side==='BUY'&&risk.entryOrderType==='limit'?Math.round(risk.entryLimitPrice!*100):undefined);
    if(limit!==undefined && (order.side==='BUY'?Math.round(quote.price*100)>limit:Math.round(quote.price*100)<limit))return;
    // Stop (trigger) orders wait until the price reaches the trigger: buy at or above it, sell at or below it.
    if(order.triggerPaise!==undefined && (order.side==='BUY'?Math.round(quote.price*100)<order.triggerPaise:Math.round(quote.price*100)>order.triggerPaise))return;
    const slipped=Math.round(quote.price*100*(1+(order.side==='BUY'?1:-1)*risk.slippagePercent/100));
    const fill=order.side==='BUY'?Math.min(limit??Infinity,slipped):Math.max(limit??0,slipped);
    let quantity=order.quantity;
    let change:number,fee:number;
    let accounting:ExitAccounting|undefined;
    if(order.side==='BUY'){
      if(!manual && session.ids && !session.ids.includes(quote.instrumentId)){await reject('Stock is outside this paper session scope');return;}
      if(session.entriesPaused && order.source==='signal' && !order.amendments?.length){await reject('Automatic entries are paused');return;}
      if(!risk.overnight && sessionTime(now).minute>=915){await reject('No new intraday entries after 15:15 IST');return;}
      if(!manual && !await MonthlyUniverseModel.exists({_id:currentMonth(),'members.instrumentId':quote.instrumentId}).session(transaction)){await reject('Stock is no longer in the monthly qualified list');return;}
      if(held || positions.length>=risk.maxPositions){await reject('An existing position or the position limit blocks this entry');return;}
      const distance=initialRiskDistance(risk,fill,order.atr,order.signalLow);
      if(!Number.isFinite(distance) || distance<=0 || distance>=fill){await reject('Initial stop must be below the filled entry price, with a positive risk distance');return;}
      if(exceedsStopLimit(risk,fill,distance)){await reject(stopLimitMessage(risk,fill,distance));return;}
      const {maxRisk,maxCash}=buySize(session,positions,fill,distance,risk);
      if(quantity===0)quantity=Math.min(maxRisk,maxCash);
      // A manual trader chooses the quantity; only cash limits it (the plan's stop still bounds the loss).
      if(quantity<1 || (!manual && quantity>maxRisk) || quantity>maxCash){await reject(manual?'Not enough paper cash for this quantity at the fill price':'Quantity exceeds available paper cash or per-trade risk');return;}
      fee=Math.round(fill*quantity*risk.feePercent/100);change=-(fill*quantity+fee);
      if(session.cashPaise+change<0){await reject('Insufficient paper cash');return;}
      let targets:ReturnType<typeof positionTargets>;
      try { targets=positionTargets(risk,fill,quantity,distance); }
      catch(error) {
        if(!(error instanceof InvalidTargetPriceError))throw error;
        await reject(error.message);return;
      }
      // "No target" positions exit only by stop, trailing stop, sell rule or a manual sell.
      const noTarget=!!order.plan?.noTarget;
      await PaperPositionModel.create([{_id:positionId,sessionId:session._id,instrumentId:quote.instrumentId,symbol:quote.symbol,quantity,initialQuantity:quantity,entryPaise:fill,initialRiskPaise:distance,costPaise:-change,stopPaise:fill-distance,
        targetPaise:noTarget?Number.MAX_SAFE_INTEGER:targets?.find(t=>!t.completed)?.pricePaise??Math.round(fill+distance*risk.targetR),targets,openedAt:new Date(now).toISOString(),...(order.plan?{plan:order.plan}:{})}],{session:transaction});
    } else {
      if(!held){await reject('No held shares to sell');return;}
      if(order.positionOpenedAt && order.positionOpenedAt!==held.openedAt){await reject('This exit belongs to an earlier position');return;}
      const targetIndex=order.targetIndex;
      if(targetIndex!==undefined){
        if(order.source!=='protection' || targetIndex<0 || targetIndex!==nextTarget(held)){await reject('This target is no longer pending');return;}
        quantity=targetIndex===held.targets!.length-1?held.quantity:Math.min(held.quantity,held.targets![targetIndex].quantity);
      }
      if(quantity===0)quantity=held.quantity;
      if(quantity>held.quantity){await reject('Sell quantity exceeds held shares');return;}
      fee=Math.round(fill*quantity*risk.feePercent/100);change=fill*quantity-fee;
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
    await PaperOrderModel.updateOne({_id:id,status:'pending'},{$set:{status:'filled',quantity,fillPaise:fill,feePaise:fee,filledAt:new Date(now).toISOString(),quoteAt:quote.at,...accounting}},{session:transaction});
  });
}
