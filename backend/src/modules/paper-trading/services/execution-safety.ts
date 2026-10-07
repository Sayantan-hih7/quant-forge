import mongoose, { Schema, model } from 'mongoose';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel, type PaperSession } from '../models/paper.model.js';
import { announce } from '../../../shared/redis.js';
import { marketTime } from '../../../shared/market-calendar.js';
import type { LiveQuote } from '../../market-feed/types/feed.types.js';
export const PaperSafetyModel=model('PaperSafety',new Schema({_id:String,halted:Boolean,changedAt:String,revision:Number},{versionKey:false}),'paper_safety');
export async function setEmergencyHalt(halted:boolean){
 await mongoose.connection.transaction(async session=>{
  await PaperSafetyModel.updateOne({_id:'global'},{$set:{halted,changedAt:new Date().toISOString()},$inc:{revision:1}},{upsert:true,session});
  if(halted)await PaperOrderModel.updateMany({side:'BUY',status:{$in:['pending','confirmation']}},{$set:{status:'cancelled',message:'Emergency entry halt: all new buys cancelled; existing positions retain exit monitoring'}},{session});
 });
 await announce('paper.orders');
}
export function entryDeviation(reference:number|undefined,fill:number,maximum=2){
 if(reference===undefined||!Number.isFinite(reference)||reference<=0)return 'Entry reference price is missing. Generate a new signal or submit a new order.';
 return Math.abs(fill/reference-1)*100>maximum?`Entry price moved more than ${maximum}% from the signal/order reference. A new decision is required.`:undefined;
}
/** Locks only new entries. Exits must remain available after a loss or manual halt. */
export async function refreshDailyLossLimits(quotes:(LiveQuote&{fresh?:boolean})[],now=Date.now()){
 if(!marketTime(now).open)return;
 const day=marketTime(now).date;
 for(const account of await PaperSessionModel.find({active:true,mode:{$ne:'signals'}}).lean()){
  await mongoose.connection.transaction(async session=>{
   const current=await PaperSessionModel.findById(account._id).session(session).lean();if(!current?.active)return;
   const held=await PaperPositionModel.find({sessionId:account._id}).session(session).lean();
   const marks=held.map(p=>quotes.find(q=>q.instrumentId===p.instrumentId&&q.fresh));
   if(marks.some(q=>!q))return;
   const equity=current.cashPaise+held.reduce((sum,p,i)=>sum+p.quantity*Math.round(marks[i]!.price*100),0);
   const baseline=current.riskDay===day?current.dayStartEquityPaise??equity:equity;
   const hit=current.lossLimitDate===day || baseline>0&&(baseline-equity)/baseline*100 >= (current.dailyLossLimitPercent??2);
   await PaperSessionModel.updateOne({_id:account._id},{$set:{riskDay:day,dayStartEquityPaise:baseline,riskCheckedAt:new Date(now).toISOString(),...(hit?{lossLimitDate:day,message:'Daily loss limit reached. New buys blocked until the next trading day; exits remain active.'}:{})},$inc:{revision:1}},{session});
   if(hit)await PaperOrderModel.updateMany({sessionId:account._id,side:'BUY',status:{$in:['pending','confirmation']}},{$set:{status:'cancelled',message:'Daily loss limit reached; exit protection remains active'}},{session});
  });
 }
}
export function dailyRiskBlocked(session:PaperSession,now:number){
 return session.lossLimitDate===marketTime(now).date;
}
