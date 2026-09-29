import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { marketTime } from '../../../shared/market-calendar.js';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel } from '../models/paper.model.js';

export const INTRADAY_SQUARE_OFF_MINUTE=915;
/** Queue by the clock, even if a held stock has not just ticked. Fills still need
 * a subsequent fresh quote. Expired exits are retried by the worker. */
export async function queueIntradaySquareOff(now=Date.now(),canContinue=()=>true){
  const clock=marketTime(now);if(!clock.open||!canContinue())return;
  const sessions=await PaperSessionModel.find({active:true,mode:{$ne:'signals'},'strategy.risk.overnight':false}).select('_id').lean();
  for(const session of sessions){
    if(!canContinue())return;
    await mongoose.connection.transaction(async transaction=>{
      const current=await PaperSessionModel.findById(session._id).session(transaction).lean();
      if(!current?.active||current.mode==='signals'||current.strategy.risk.overnight)return;
      if(clock.minute>=INTRADAY_SQUARE_OFF_MINUTE)await PaperOrderModel.updateMany({sessionId:session._id,side:'BUY',status:{$in:['pending','confirmation']}},{$set:{status:'cancelled',message:'Intraday square-off: entries close at 3:15 PM IST'}},{session:transaction});
      const positions=await PaperPositionModel.find({sessionId:session._id}).session(transaction).lean();
      for(const position of positions){
        if(clock.minute<INTRADAY_SQUARE_OFF_MINUTE&&marketTime(Date.parse(position.openedAt)).date===clock.date)continue;
        const active=await PaperOrderModel.findOne({sessionId:session._id,instrumentId:position.instrumentId,status:{$in:['pending','confirmation']}}).session(transaction).lean();
        if(active?.source==='protection'&&active.targetIndex===undefined&&active.reason==='Session close')continue;
        if(active)await PaperOrderModel.updateOne({_id:active._id},{$set:{status:'cancelled',message:'Replaced by intraday square-off'}},{session:transaction});
        const at=new Date(now).toISOString();
        await PaperOrderModel.create([{_id:randomUUID(),sessionId:session._id,instrumentId:position.instrumentId,side:'SELL',quantity:0,source:'protection',status:'pending',orderType:'market',createdAt:at,eligibleAfter:at,expiresAt:new Date(now+60000).toISOString(),reason:'Session close',positionOpenedAt:position.openedAt}],{session:transaction});
      }
    });
  }
}
