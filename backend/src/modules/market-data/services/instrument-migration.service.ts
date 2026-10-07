import type { ClientSession } from 'mongoose';
import { Schema, model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { Instrument } from '../types.js';
import { invariant } from '../../../shared/errors.js';
import { MonthlyUniverseModel, UniverseSnapshotModel } from '../../qualification/models/qualification.model.js';
import { PaperSessionModel, PaperPositionModel, PaperOrderModel, PaperObservationModel, PaperEntryEventModel } from '../../paper-trading/models/paper.model.js';
import { WatchlistModel } from '../../watchlists/models/watchlist.model.js';
export const InstrumentMigrationModel=model('InstrumentMigration',new Schema({_id:String,from:String,to:String,isin:String,exchange:String,at:String},{versionKey:false}),'instrument_migrations');
type Identity=Pick<Instrument,'_id'|'exchange'|'isin'|'active'|'symbol'>;
export function instrumentReplacements(previous:Identity[],next:Identity[]){
 const active=new Set(next.filter(x=>x.active).map(x=>x._id));
 return previous.flatMap(old=>{
  if(active.has(old._id)||!old.isin)return [];
  const matches=next.filter(x=>x.active&&x.isin===old.isin&&x.exchange===old.exchange);
  return matches.length===1?[{from:old._id,to:matches[0]._id,isin:old.isin,exchange:old.exchange,symbol:matches[0].symbol}]:[];
 });
}
/** Same ISIN AND exchange only. Archived reports and original fill records stay immutable. */
export async function migrateInstrumentReferences(previous:Identity[],next:Identity[],session:ClientSession){
 const mappings=instrumentReplacements(previous,next),at=new Date().toISOString(),month=new Date(Date.now()+19800000).toISOString().slice(0,7);
 for(const m of mappings){
  const recorded=await InstrumentMigrationModel.exists({from:m.from,to:m.to}).session(session);
  for(const pool of await MonthlyUniverseModel.find({month:{$gte:month},'members.instrumentId':m.from}).session(session).lean()){
   const members=pool.members.map(x=>x.instrumentId===m.from?{...x,instrumentId:m.to}:x);
   invariant(new Set(members.map(x=>x.instrumentId)).size===members.length,`Duplicate qualification mapping for ${m.symbol}; manual review required`);
   const updated={...pool,members,revision:pool.revision+1,publishedAt:at};
   await MonthlyUniverseModel.updateOne({_id:pool._id},{$set:{members,revision:updated.revision,publishedAt:at}},{session});
   await UniverseSnapshotModel.create([{...updated,_id:`${pool.month}:${updated.revision}`}],{session});
  }
  for(const held of await PaperPositionModel.find({instrumentId:m.from}).session(session).lean()){
   const id=`${held.sessionId}:${m.to}`;
   invariant(!await PaperPositionModel.exists({_id:id}).session(session),`Two held positions map to ${m.symbol}; manual reconciliation required`);
   await PaperPositionModel.create([{...held,_id:id,instrumentId:m.to,symbol:m.symbol}],{session});
   await PaperPositionModel.deleteOne({_id:held._id},{session});
  }
  for(const paper of await PaperSessionModel.find({active:true,ids:m.from}).session(session).lean())await PaperSessionModel.updateOne({_id:paper._id},{$set:{ids:[...new Set(paper.ids!.map(id=>id===m.from?m.to:id))]},$inc:{revision:1}},{session});
  await PaperOrderModel.updateMany({instrumentId:m.from,status:{$in:['pending','confirmation']}},{$set:{instrumentId:m.to,message:`Broker identifier updated from ${m.from}; same ISIN and exchange`}},{session});
  // Preserve crossover consumption so identifier changes cannot trigger a duplicate buy.
  await PaperEntryEventModel.updateMany({instrumentId:m.from},{$set:{instrumentId:m.to}},{session});
  await PaperObservationModel.deleteMany({instrumentId:m.from},{session});
  for(const list of await WatchlistModel.find({ids:m.from}).session(session).lean())await WatchlistModel.updateOne({_id:list._id},{$set:{ids:[...new Set(list.ids.map(id=>id===m.from?m.to:id))],updatedAt:at}},{session});
  if(!recorded)await InstrumentMigrationModel.create([{_id:randomUUID(),...m,at}],{session});
 }
 return mappings;
}
