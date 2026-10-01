import { Schema, model } from 'mongoose';
import type { Strategy } from '../../strategies/models/strategy.model.js';
import type { Risk } from '../../strategies/validations/strategy.validation.js';
/** Per-order protection for manual trades; strategy positions use their session's strategy risk. */
export type TradePlan = Risk & { noTarget?: boolean };
const options = {strict:'throw' as const,versionKey:false as const};
export interface PaperSession { _id:string; strategyId:string; strategy:Strategy; ids?:string[]; mode:'signals'|'automatic'|'confirmation'|'manual'; sourceBacktestId?:string; cashPaise:number; initialPaise:number; entriesPaused:boolean; active:boolean; createdAt:string; checkedAt?:string; message?:string; revision:number }
export interface PaperTarget { pricePaise:number; quantity:number; completed:boolean; filledAt?:string; filledQuantity?:number }
export interface PaperPosition { _id:string; sessionId:string; instrumentId:string; symbol:string; quantity:number; initialQuantity?:number; entryPaise:number; costPaise:number; stopPaise:number; targetPaise:number; targets?:PaperTarget[]; initialRiskPaise?:number; highWaterPaise?:number; trailingActivated?:boolean; lastProtectionAt?:string; breakevenActivated?:boolean; openedAt:string; plan?:TradePlan }
export interface PaperOrder { _id:string; sessionId:string; instrumentId:string; side:'BUY'|'SELL'; quantity:number; source:'manual'|'signal'|'protection'; status:'confirmation'|'pending'|'filled'|'cancelled'|'rejected'|'expired'; createdAt:string; eligibleAfter:string; expiresAt:string; reason:string; targetIndex?:number; positionOpenedAt?:string; atr?:number; signalLow?:number; orderType?:'market'|'limit'|'stop'; limitPaise?:number; triggerPaise?:number; plan?:TradePlan; triggerId?:string; message?:string; fillPaise?:number; feePaise?:number; filledAt?:string; quoteAt?:string; entryPaise?:number; allocatedCostPaise?:number; entryFeePaise?:number; realizedPnlPaise?:number; amendments?:{at:string;orderType:'market'|'limit';limitPaise?:number}[] }
export interface PaperSignal { _id:string; sessionId:string; instrumentId:string; side:'BUY'|'SELL'; barEnd:string; createdAt:string; checks:unknown[]; orderId?:string; message?:string; expiresAt?:string; referencePrice?:number }
const sessionSchema = new Schema<PaperSession>({_id:String,strategyId:String,strategy:Schema.Types.Mixed,ids:{type:[String],default:undefined},sourceBacktestId:String,mode:String,cashPaise:Number,initialPaise:Number,entriesPaused:Boolean,active:Boolean,createdAt:String,checkedAt:String,message:String,revision:Number},options);
sessionSchema.index({strategyId:1},{unique:true,partialFilterExpression:{active:true}});
export const PaperSessionModel = model<PaperSession>('PaperSession',sessionSchema,'paper_sessions');
export const PaperPositionModel = model<PaperPosition>('PaperPosition',new Schema<PaperPosition>({_id:String,sessionId:String,instrumentId:String,symbol:String,quantity:Number,initialQuantity:Number,entryPaise:Number,costPaise:Number,stopPaise:Number,targetPaise:Number,targets:{type:[new Schema({pricePaise:Number,quantity:Number,completed:Boolean,filledAt:String,filledQuantity:Number},{_id:false})],default:undefined},initialRiskPaise:Number,highWaterPaise:Number,trailingActivated:Boolean,lastProtectionAt:String,breakevenActivated:Boolean,openedAt:String,plan:Schema.Types.Mixed},options),'paper_positions');
const orderSchema = new Schema<PaperOrder>({_id:String,sessionId:String,instrumentId:String,side:String,quantity:Number,source:String,status:String,createdAt:String,eligibleAfter:String,expiresAt:String,reason:String,targetIndex:Number,positionOpenedAt:String,atr:Number,signalLow:Number,orderType:String,limitPaise:Number,triggerPaise:Number,plan:Schema.Types.Mixed,triggerId:String,message:String,fillPaise:Number,feePaise:Number,filledAt:String,quoteAt:String,entryPaise:Number,allocatedCostPaise:Number,entryFeePaise:Number,realizedPnlPaise:Number,amendments:{type:[new Schema({at:String,orderType:String,limitPaise:Number},{_id:false})],default:undefined}},options);
orderSchema.index({sessionId:1,createdAt:-1,_id:-1});
orderSchema.index({createdAt:-1,_id:-1});
orderSchema.index({sessionId:1,instrumentId:1},{unique:true,partialFilterExpression:{status:{$in:['pending','confirmation']}}});
export const PaperOrderModel = model<PaperOrder>('PaperOrder',orderSchema,'paper_orders');
export const PaperSignalModel = model<PaperSignal>('PaperSignal',new Schema<PaperSignal>({_id:String,sessionId:String,instrumentId:String,side:String,barEnd:String,createdAt:String,checks:[Schema.Types.Mixed],orderId:String,message:String,expiresAt:String,referencePrice:Number},options),'paper_signals');
const evaluationSchema = new Schema({ _id: String, processedAt: { type: Date, required: true } }, options);
evaluationSchema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 86400 });
export const PaperEvaluationModel = model('PaperEvaluation', evaluationSchema, 'paper_evaluations');

export interface RuleCheck { matched: boolean | null; field: string; missingField?: string; left?: number; right?: number; reason?: string }
export interface PaperObservation { _id:string; sessionId:string; instrumentId:string; barEnd:string|null; checkedAt:string; current:boolean; entry:{matched:boolean|null;checks:RuleCheck[]}; exit:{matched:boolean|null;disabled?:boolean;checks:RuleCheck[]}; referencePrice?:number|null }
export const PaperObservationModel = model<PaperObservation>('PaperObservation', new Schema<PaperObservation>({_id:String,sessionId:String,instrumentId:String,barEnd:String,checkedAt:String,current:Boolean,entry:Schema.Types.Mixed,exit:Schema.Types.Mixed,referencePrice:Number},options),'paper_observations');

// Durable beyond the daily evaluation TTL: a weekly/monthly crossover is one entry event.
const entryEventSchema = new Schema({ _id:String, sessionId:String, instrumentId:String, eventKey:String, createdAt:String },options);
entryEventSchema.index({ sessionId: 1, instrumentId: 1 });
export const PaperEntryEventModel = model('PaperEntryEvent', entryEventSchema, 'paper_entry_events');

/** A manual conditional order: one stock, one rule, executed once when the rule is met on a completed candle. */
export interface PaperTrigger {
  _id:string; sessionId:string; instrumentId:string; symbol:string; side:'BUY'|'SELL'; rule:Record<string,unknown>; cadence:'1m'|'5m'|'15m'|'daily';
  quantity:number; plan?:TradePlan; status:'active'|'triggered'|'cancelled'|'expired'|'failed'; validUntil:string; createdAt:string;
  lastBarEnd?:string; checkedAt?:string; triggeredAt?:string; orderId?:string; message?:string; summary?:string;
}
const triggerSchema = new Schema<PaperTrigger>({_id:String,sessionId:String,instrumentId:String,symbol:String,side:String,rule:Schema.Types.Mixed,cadence:String,quantity:Number,plan:Schema.Types.Mixed,
  status:String,validUntil:String,createdAt:String,lastBarEnd:String,checkedAt:String,triggeredAt:String,orderId:String,message:String,summary:String},options);
triggerSchema.index({status:1,sessionId:1});
triggerSchema.index({sessionId:1,instrumentId:1,createdAt:-1});
export const PaperTriggerModel = model<PaperTrigger>('PaperTrigger',triggerSchema,'paper_triggers');
