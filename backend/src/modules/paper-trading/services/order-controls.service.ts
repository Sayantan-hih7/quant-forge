import mongoose from 'mongoose';
import { invariant } from '../../../shared/errors.js';
import { announce, redis } from '../../../shared/redis.js';
import { marketTime } from '../../../shared/market-calendar.js';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel } from '../models/paper.model.js';
import { amendOrderSchema, exitPositionSchema } from '../validations/paper.validation.js';

export async function amendPaperOrder(id:string,raw:unknown,now=Date.now()){
  const input=amendOrderSchema.parse(raw),at=new Date(now).toISOString();
  const result=await mongoose.connection.transaction(async transaction=>{
    const order=await PaperOrderModel.findById(id).session(transaction).lean();
    invariant(order&&['pending','confirmation'].includes(order.status),'Only unfilled orders can be modified. A filled price cannot be changed.');
    invariant(order.source!=='protection','Automatic stop-loss, target and square-off orders cannot be repriced.');
    invariant(order.eligibleAfter===input.expectedEligibleAfter,'This order changed. Refresh it before editing again.');
    invariant(Date.parse(order.expiresAt)>now,'This order has expired.');
    invariant((order.amendments?.length??0)<100,'This order has reached its modification limit. Cancel it and place a new order.');
    const session=await PaperSessionModel.findById(order.sessionId).session(transaction).lean();
    invariant(session?.active&&session.mode!=='signals','This paper account is no longer active.');
    invariant(order.side!=='BUY'||session.strategy.risk.overnight||marketTime(now).minute<915,'Intraday entries close at 3:15 PM IST.');
    // Keep the original expiry and confirmation requirement. A changed price may
    // only use ticks received after this edit, never a previously observed price.
    const eligibleAfter=new Date(Math.max(now,Date.parse(order.eligibleAfter)+1)).toISOString();
    const limitPaise=input.orderType==='limit'?Math.round(input.limitPrice!*100):undefined;
    await PaperSessionModel.updateOne({_id:session._id},{$set:{entriesPaused:true},$inc:{revision:1}},{session:transaction});
    return PaperOrderModel.findOneAndUpdate({_id:id,status:order.status,eligibleAfter:order.eligibleAfter},
      {$set:{orderType:input.orderType,eligibleAfter,message:'Order updated. Waiting for a new eligible quote.',...(limitPaise!==undefined?{limitPaise}:{})},
        ...(limitPaise===undefined?{$unset:{limitPaise:1}}:{}),$push:{amendments:{at,orderType:input.orderType,limitPaise}}},{session:transaction,returnDocument:'after'}).lean();
  });
  await announce('paper.orders');return result;
}

/** Submit a direct position exit, independent of entry rules/history downloads. */
export async function exitPaperPosition(positionId:string,raw:unknown,now=Date.now()){
  const input=exitPositionSchema.parse(raw);
  const existing=await PaperOrderModel.findById(input.id).lean();
  if(existing){invariant(`${existing.sessionId}:${existing.instrumentId}`===positionId&&existing.source==='manual'&&existing.side==='SELL'&&existing.positionOpenedAt===input.expectedOpenedAt&&existing.quantity===(input.quantity??existing.quantity),'Order ID already used');return existing;}
  invariant(marketTime(now).open,'Paper exits fill during the regular cash-market session.');
  invariant(await redis.exists('quantforge:paper:heartbeat'),'The paper worker must be running to process exits.');
  const result=await mongoose.connection.transaction(async transaction=>{
    const position=await PaperPositionModel.findById(positionId).session(transaction).lean();
    invariant(position&&position.openedAt===input.expectedOpenedAt,'This position changed or is already closed. Refresh your positions.');
    invariant(!input.quantity||input.quantity<=position.quantity,'The sell quantity exceeds shares still held.');
    const session=await PaperSessionModel.findById(position.sessionId).session(transaction).lean();
    invariant(session?.active&&session.mode!=='signals','This paper account is no longer active.');
    const active=await PaperOrderModel.findOne({sessionId:session._id,instrumentId:position.instrumentId,status:{$in:['pending','confirmation']}}).session(transaction).lean();
    await PaperSessionModel.updateOne({_id:session._id},{$set:{entriesPaused:true},$inc:{revision:1}},{session:transaction});
    // Never weaken a pending full protective exit into a smaller manual sale.
    if(active?.source==='protection'&&active.targetIndex===undefined)return active;
    if(active)await PaperOrderModel.updateOne({_id:active._id},{$set:{status:'cancelled',message:'Replaced by your manual position exit'}},{session:transaction});
    const at=new Date(now).toISOString();
    return (await PaperOrderModel.create([{_id:input.id,sessionId:session._id,instrumentId:position.instrumentId,side:'SELL',quantity:input.quantity??0,source:'manual',status:'pending',orderType:'market',createdAt:at,eligibleAfter:at,expiresAt:new Date(now+60000).toISOString(),positionOpenedAt:position.openedAt,reason:input.quantity?'Manual partial exit':'Manual exit all'}],{session:transaction}))[0].toObject();
  });
  await announce('paper.orders');return result;
}
