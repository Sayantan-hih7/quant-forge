import {Schema,model} from 'mongoose';
import {marketTime,calendarExpiryWarning} from '../../../shared/market-calendar.js';
import {PaperPositionModel} from '../models/paper.model.js';
import {feedStatus} from '../../market-feed/services/feed.service.js';
const AlertModel=model('PaperProtectionAlert',new Schema({_id:String,at:String,message:String,positions:Number,delivery:String},{versionKey:false}),'paper_protection_alerts');
let previous='',lastSent=0;
/** Runs even when clock safety blocks execution. Optional external delivery is opt-in. */
export async function checkProtectionAlerts(clockSafe:boolean,now=Date.now()){
 const positions=await PaperPositionModel.find().select('instrumentId').lean();
 const messages:string[]=[];
 const calendar=calendarExpiryWarning(now);if(calendar)messages.push(calendar);
 if(positions.length&&(marketTime(now).open||!clockSafe)){
  if(!clockSafe)messages.push('Clock unverified: signal evaluation and paper fills are paused, including protective exits.');
  const feed=await feedStatus();
  const stale=positions.filter(p=>!feed.quotes.some(q=>q.instrumentId===p.instrumentId&&q.fresh));
  if(stale.length)messages.push(`${stale.length} held paper positions lack fresh trade quotes. Exits may be delayed; a fresh eligible bid may still execute an already-triggered protective exit.`);
 }
 const message=messages.join(' ');if(!message){previous='';return;}
 if(message===previous&&now-lastSent<300000)return;
 previous=message;lastSent=now;
 const id=`protection:${now}`;await AlertModel.create({_id:id,at:new Date(now).toISOString(),message,positions:positions.length,delivery:'local'});
 console.warn('Paper protection alert: '+message);
 const target=process.env.PAPER_ALERT_WEBHOOK;if(!target)return;
 try{
  const url=new URL(target);if(url.protocol!=='https:')throw new Error('HTTPS required');
  const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'paper-protection',at:new Date(now).toISOString(),message,positions:positions.length}),signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw new Error('Delivery failed');
  await AlertModel.updateOne({_id:id},{$set:{delivery:'webhook'}});
 }catch{await AlertModel.updateOne({_id:id},{$set:{delivery:'failed'}});console.warn('Paper protection webhook unavailable; alert retained in database.');}
}
