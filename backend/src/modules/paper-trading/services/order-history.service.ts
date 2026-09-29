import mongoose from 'mongoose';
import { PaperOrderModel, type PaperOrder } from '../models/paper.model.js';
import { instruments } from '../../market-data/repository.js';
import { legacyExitAccounting, type ExitAccounting } from './trade-pnl.js';

export async function paperOrderHistory(input:{sessionId?:string;beforeAt?:string;beforeId?:string;filledOnly?:boolean;exitsOnly?:boolean}){
  const scope=input.sessionId?{sessionId:input.sessionId}:{};
  const query={...scope,...(input.exitsOnly?{status:'filled' as const,side:'SELL' as const}:input.filledOnly?{status:'filled' as const}:{}),...(input.beforeAt&&input.beforeId?{$or:[{createdAt:{$lt:input.beforeAt}},{createdAt:input.beforeAt,_id:{$lt:input.beforeId}}]}:{})};
  return mongoose.connection.transaction(async transaction=>{
    const rows=await PaperOrderModel.find(query).sort({createdAt:-1,_id:-1}).limit(21).session(transaction).lean();
    const totals=await PaperOrderModel.aggregate<{buys:number;exits:number;feesPaise:number;realizedPnlPaise:number;missing:number}>([
      {$match:{...scope,status:'filled'}},{$group:{_id:null,
        buys:{$sum:{$cond:[{$eq:['$side','BUY']},1,0]}},exits:{$sum:{$cond:[{$eq:['$side','SELL']},1,0]}},feesPaise:{$sum:'$feePaise'},
        realizedPnlPaise:{$sum:{$cond:[{$eq:['$side','SELL']},{$ifNull:['$realizedPnlPaise',0]},0]}},
        missing:{$sum:{$cond:[{$and:[{$eq:['$side','SELL']},{$eq:[{$ifNull:['$realizedPnlPaise',null]},null]}]},1,0]}}}}
    ]).session(transaction);
    const summary=totals[0]??{buys:0,exits:0,feesPaise:0,realizedPnlPaise:0,missing:0};
    let legacy=new Map<string,ExitAccounting>();
    if(summary.missing){
      const missing=await PaperOrderModel.find({...scope,status:'filled',side:'SELL',realizedPnlPaise:{$exists:false}}).select('sessionId instrumentId').session(transaction).lean();
      const pairs=[...new Map(missing.map(row=>[`${row.sessionId}/${row.instrumentId}`,{sessionId:row.sessionId,instrumentId:row.instrumentId}])).values()];
      const fills=await PaperOrderModel.find({status:'filled',$or:pairs}).session(transaction).lean();
      legacy=legacyExitAccounting(fills);
      for(const row of fills)if(row.side==='SELL' && row.realizedPnlPaise===undefined){
        const value=legacy.get(row._id);if(value){summary.realizedPnlPaise+=value.realizedPnlPaise;summary.missing--;}
      }
    }
    const items:PaperOrder[]=rows.slice(0,20).map(row=>row.realizedPnlPaise===undefined?{...row,...legacy.get(row._id)}:row);
    const stocks=await instruments.find({_id:{$in:items.map(o=>o.instrumentId)}}).select('_id symbol').session(transaction).lean();
    return {items,summary:{...summary,realizedPnlPaise:summary.missing?null:summary.realizedPnlPaise},symbols:Object.fromEntries(stocks.map(s=>[s._id,s.symbol])),hasMore:rows.length>20,next:rows.length>20?{beforeAt:items.at(-1)!.createdAt,beforeId:items.at(-1)!._id}:null};
  },{readConcern:{level:'snapshot'}});
}
