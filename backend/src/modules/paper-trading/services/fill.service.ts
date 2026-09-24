import mongoose from 'mongoose';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel } from '../models/paper.model.js';
import { MonthlyUniverseModel } from '../../qualification/models/qualification.model.js';
import { currentMonth } from '../../qualification/services/universe.service.js';
import type { LiveQuote } from '../../market-feed/types/feed.types.js';
import { sessionTime } from './paper.service.js';

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
    if(!session?.active){await reject('Paper session is not active');return;}
    const risk=session.strategy.risk, positionId=`${session._id}:${quote.instrumentId}`;
    const positions=await PaperPositionModel.find({sessionId:session._id}).session(transaction).lean(), held=positions.find(x=>x._id===positionId);
    const fill=Math.round(quote.price*100*(1+(order.side==='BUY'?1:-1)*risk.slippagePercent/100));
    let quantity=order.quantity;
    let change:number,fee:number;
    if(order.side==='BUY'){
      if(session.ids && !session.ids.includes(quote.instrumentId)){await reject('Stock is outside this paper session scope');return;}
      if(session.entriesPaused && order.source==='signal'){await reject('Automatic entries are paused');return;}
      if(!risk.overnight && sessionTime(now).minute>=915){await reject('No new intraday entries after 15:15 IST');return;}
      if(!await MonthlyUniverseModel.exists({_id:currentMonth(),'members.instrumentId':quote.instrumentId}).session(transaction)){await reject('Stock is no longer in the monthly qualified list');return;}
      if(held || positions.length>=risk.maxPositions){await reject('An existing position or the position limit blocks this entry');return;}
      const distance=risk.stopMode==='ATR'?Math.round((order.atr??0)*risk.atrMultiplier*100):Math.round(fill*risk.stopPercent/100);
      if(distance<=0 || distance>=fill){await reject('Valid stop distance is unavailable');return;}
      // Conservative basis: cash plus the smaller of entry cost and each stop value.
      const equity=session.cashPaise+positions.reduce((sum,p)=>sum+Math.min(p.entryPaise,p.stopPaise)*p.quantity,0);
      const maxRisk=Math.floor(equity*risk.riskPercent/100/distance), maxCash=Math.floor(session.cashPaise/(fill*(1+risk.feePercent/100)));
      if(quantity===0)quantity=Math.min(maxRisk,maxCash);
      if(quantity<1 || quantity>maxRisk || quantity>maxCash){await reject('Quantity exceeds available paper cash or per-trade risk');return;}
      fee=Math.round(fill*quantity*risk.feePercent/100);change=-(fill*quantity+fee);
      if(session.cashPaise+change<0){await reject('Insufficient paper cash');return;}
      await PaperPositionModel.create([{_id:positionId,sessionId:session._id,instrumentId:quote.instrumentId,symbol:quote.symbol,quantity,entryPaise:fill,costPaise:-change,stopPaise:fill-distance,targetPaise:Math.round(fill+distance*risk.targetR),openedAt:new Date(now).toISOString()}],{session:transaction});
    } else {
      if(!held){await reject('No held shares to sell');return;}
      if(quantity===0)quantity=held.quantity;
      if(quantity>held.quantity){await reject('Sell quantity exceeds held shares');return;}
      fee=Math.round(fill*quantity*risk.feePercent/100);change=fill*quantity-fee;
      if(quantity===held.quantity)await PaperPositionModel.deleteOne({_id:positionId},{session:transaction});
      else await PaperPositionModel.updateOne({_id:positionId},{$inc:{quantity:-quantity},$set:{costPaise:Math.round(held.costPaise*(held.quantity-quantity)/held.quantity)}},{session:transaction});
    }
    // Concurrent orders write this same session record; Mongo retries conflicts.
    await PaperSessionModel.updateOne({_id:session._id},{$inc:{cashPaise:change,revision:1}},{session:transaction});
    await PaperOrderModel.updateOne({_id:id,status:'pending'},{$set:{status:'filled',quantity,fillPaise:fill,feePaise:fee,filledAt:new Date(now).toISOString(),quoteAt:quote.at}},{session:transaction});
  });
}
