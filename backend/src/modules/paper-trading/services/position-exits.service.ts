import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {invariant} from '../../../shared/errors.js';
import {announce,redis} from '../../../shared/redis.js';
import {PaperPositionModel,PaperSessionModel,PaperOrderModel,PaperExitAmendmentModel} from '../models/paper.model.js';
import {feedStatus} from '../../market-feed/services/feed.service.js';
const price=z.number().positive().max(10000000).multipleOf(0.01);
const editSchema=z.object({expectedOpenedAt:z.string().datetime(),expectedRevision:z.number().int().min(0),expectedQuantity:z.number().int().positive(),expectedStopPaise:z.number().int().positive(),expectedStrategyStopPaise:z.number().int().positive().optional(),action:z.enum(['edit','restore']),stop:price.optional(),targets:z.array(price).max(20).optional(),acknowledgeRisk:z.boolean().default(false)}).strict();
export async function positionExitDetails(id:string){
 const position=await PaperPositionModel.findById(id).lean();invariant(position,'Position already closed');
 const history=await PaperExitAmendmentModel.find({positionId:id,openedAt:position.openedAt}).sort({at:-1}).limit(20).lean();
 return {position,history};
}
export async function modifyPositionExits(id:string,raw:unknown,now=Date.now()){
 const input=editSchema.parse(raw);invariant(await redis.get('quantforge:paper:exit-controls')==='1','Restart the paper worker to enable position exit controls');
 const at=new Date(now).toISOString();
 const result=await mongoose.connection.transaction(async transaction=>{
  const p=await PaperPositionModel.findById(id).session(transaction).lean();
  invariant(p&&p.openedAt===input.expectedOpenedAt,'Position closed or replaced; refresh before editing');
  invariant(p.quantity===input.expectedQuantity&&p.stopPaise===input.expectedStopPaise&&(p.exitControl?.revision??0)===input.expectedRevision,'Position or stop changed; refresh and review the latest levels');
  invariant(!p.corporateActionPending,'Resolve the pending corporate action before editing exit levels');
  const session=await PaperSessionModel.findById(p.sessionId).session(transaction).lean();invariant(session?.active&&session.mode!=='signals','Active paper account required');
  invariant(!await PaperOrderModel.exists({sessionId:p.sessionId,instrumentId:p.instrumentId,status:{$in:['pending','confirmation']}}).session(transaction),'An order is already waiting for this stock. Let it finish or cancel a manual order before editing exits');
  const actual=p.targets?.map(t=>t.pricePaise)??[p.targetPaise];
  const control=p.exitControl??{strategyStopPaise:p.stopPaise,strategyTargetPrices:actual,stopOverridden:false,targetOverrides:actual.map(()=>false),revision:0,changedAt:at};
  invariant(control.revision<100,'This position has reached its exit edit limit');
  invariant(input.action==='restore'||input.stop!==undefined||input.targets!==undefined,'Choose a stop or target to change');
  const restoring=input.action==='restore';
  invariant(!restoring||input.expectedStrategyStopPaise===control.strategyStopPaise,'The strategy stop advanced; refresh before restoring its levels');
  const stop=restoring?control.strategyStopPaise:input.stop===undefined?p.stopPaise:Math.round(input.stop*100);
  const targets=restoring?actual.map((v,i)=>p.targets?.[i]?.completed?v:control.strategyTargetPrices[i]):input.targets?.map(v=>Math.round(v*100))??actual;
  invariant(targets.length===actual.length,'Keep the existing number of targets; completed exits and quantities cannot be changed');
  for(let i=0;i<targets.length;i++){
   invariant(!p.targets?.[i]?.completed||targets[i]===actual[i],'A completed target cannot be changed');
   invariant(Number.isInteger(targets[i])&&targets[i]>p.entryPaise,'Profit targets must be above the entry price');
   if(!p.targets?.[i]?.completed){invariant(targets[i]>stop,'Pending targets must be above the stop');if(i>0)invariant(targets[i]>targets[i-1],'Targets must be in increasing price order');}
  }
  const quote=(await feedStatus()).quotes.find(q=>q.instrumentId===p.instrumentId&&q.fresh);
  const fresh=quote&&now-Date.parse(quote.at)>=0&&now-Date.parse(quote.at)<=15000;
  const immediate=fresh&&(stop>=Math.round(quote.price*100)||targets.some((v,i)=>!p.targets?.[i]?.completed&&v<=Math.round(quote.price*100)));
  invariant(input.acknowledgeRisk||(!(stop<p.stopPaise)&&!immediate&&fresh),'Review and acknowledge increased risk, immediate triggering or unavailable fresh prices before applying');
  const nextControl={...control,strategyTargetPrices:[...control.strategyTargetPrices],stopOverridden:restoring?false:input.stop===undefined?control.stopOverridden:stop!==control.strategyStopPaise,targetOverrides:restoring?actual.map(()=>false):targets.map((v,i)=>v!==control.strategyTargetPrices[i]),revision:control.revision+1,changedAt:at};
  const nextTargets=p.targets?.map((t,i)=>({...t,pricePaise:targets[i]}));
  const targetPaise=nextTargets?.find(t=>!t.completed)?.pricePaise??targets[0];
  const changes={stopPaise:stop,targetPaise,...(nextTargets?{targets:nextTargets}:{}),exitControl:nextControl};
  await PaperPositionModel.updateOne({_id:id},{$set:changes},{session:transaction});
  await PaperSessionModel.updateOne({_id:p.sessionId},{$set:{entriesPaused:true},$inc:{revision:1}},{session:transaction});
  await PaperExitAmendmentModel.create([{_id:randomUUID(),positionId:id,openedAt:p.openedAt,at,action:input.action,before:{stopPaise:p.stopPaise,targets:actual},after:{stopPaise:stop,targets,control:nextControl}}],{session:transaction});
  return {...p,...changes};
 });
 await announce('paper.orders');return result;
}
