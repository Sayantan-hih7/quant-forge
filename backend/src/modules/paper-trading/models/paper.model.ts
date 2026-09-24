import { Schema, model } from 'mongoose';
import type { Strategy } from '../../strategies/models/strategy.model.js';
const options = {strict:'throw' as const,versionKey:false as const};
export interface PaperSession { _id:string; strategyId:string; strategy:Strategy; ids?:string[]; mode:'automatic'|'confirmation'; cashPaise:number; initialPaise:number; entriesPaused:boolean; active:boolean; createdAt:string; checkedAt?:string; message?:string; revision:number }
export interface PaperPosition { _id:string; sessionId:string; instrumentId:string; symbol:string; quantity:number; entryPaise:number; costPaise:number; stopPaise:number; targetPaise:number; openedAt:string }
export interface PaperOrder { _id:string; sessionId:string; instrumentId:string; side:'BUY'|'SELL'; quantity:number; source:'manual'|'signal'|'protection'; status:'confirmation'|'pending'|'filled'|'cancelled'|'rejected'|'expired'; createdAt:string; eligibleAfter:string; expiresAt:string; reason:string; atr?:number; message?:string; fillPaise?:number; feePaise?:number; filledAt?:string; quoteAt?:string }
export interface PaperSignal { _id:string; sessionId:string; instrumentId:string; side:'BUY'|'SELL'; barEnd:string; createdAt:string; checks:unknown[]; orderId?:string; message?:string }
const sessionSchema = new Schema<PaperSession>({_id:String,strategyId:String,strategy:Schema.Types.Mixed,ids:{type:[String],default:undefined},mode:String,cashPaise:Number,initialPaise:Number,entriesPaused:Boolean,active:Boolean,createdAt:String,checkedAt:String,message:String,revision:Number},options);
sessionSchema.index({strategyId:1},{unique:true,partialFilterExpression:{active:true}});
export const PaperSessionModel = model<PaperSession>('PaperSession',sessionSchema,'paper_sessions');
export const PaperPositionModel = model<PaperPosition>('PaperPosition',new Schema<PaperPosition>({_id:String,sessionId:String,instrumentId:String,symbol:String,quantity:Number,entryPaise:Number,costPaise:Number,stopPaise:Number,targetPaise:Number,openedAt:String},options),'paper_positions');
const orderSchema = new Schema<PaperOrder>({_id:String,sessionId:String,instrumentId:String,side:String,quantity:Number,source:String,status:String,createdAt:String,eligibleAfter:String,expiresAt:String,reason:String,atr:Number,message:String,fillPaise:Number,feePaise:Number,filledAt:String,quoteAt:String},options);
orderSchema.index({sessionId:1,instrumentId:1},{unique:true,partialFilterExpression:{status:{$in:['pending','confirmation']}}});
export const PaperOrderModel = model<PaperOrder>('PaperOrder',orderSchema,'paper_orders');
export const PaperSignalModel = model<PaperSignal>('PaperSignal',new Schema<PaperSignal>({_id:String,sessionId:String,instrumentId:String,side:String,barEnd:String,createdAt:String,checks:[Schema.Types.Mixed],orderId:String,message:String},options),'paper_signals');
