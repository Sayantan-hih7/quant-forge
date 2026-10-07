import type { ClientSession } from 'mongoose';
import type { Risk } from '../../strategies/validations/strategy.validation.js';
import { PaperOrderModel } from '../models/paper.model.js';
import { reentryBlock } from './entry-safety.js';
export async function paperReentryBlock(sessionId:string,instrumentId:string,risk:Risk,at:string,transaction:ClientSession){
 if(!risk.reentryCooldownMinutes&&!risk.maxEntriesPerStockPerDay)return undefined;
 const lastExit=await PaperOrderModel.findOne({sessionId,instrumentId,side:'SELL',status:'filled'}).sort({filledAt:-1}).select('filledAt').session(transaction).lean();
 const day=new Date(Date.parse(at)+19800000).toISOString().slice(0,10);
 const start=new Date(`${day}T00:00:00+05:30`).toISOString();
 const buys=await PaperOrderModel.find({sessionId,instrumentId,side:'BUY',status:'filled',filledAt:{$gte:start,$lte:at}}).select('filledAt').session(transaction).lean();
 // Called only when no position is held: the last sell is the final exit.
 return reentryBlock(risk,at,lastExit?.filledAt,buys.flatMap(x=>x.filledAt?[x.filledAt]:[]));
}
