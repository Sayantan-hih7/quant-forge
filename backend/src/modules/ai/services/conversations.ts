import {sourceReportSchema} from './report-tables.js';
import mongoose,{Schema} from 'mongoose';
import {z} from 'zod';
import {Router} from 'express';
import {isDeepStrictEqual} from 'node:util';
import {AppError} from '../../../shared/errors.js';
import {aiQuestionsSchema} from '../validations/ai.validation.js';
export const conversationSnapshotSchema=z.object({
 messages:z.array(z.object({role:z.enum(['user','assistant']),text:z.string().max(4000),questions:aiQuestionsSchema.optional(),activity:z.array(z.object({tool:z.enum(['backtests','paper','qualification','connections']),status:z.enum(['completed','unavailable']),checkedAt:z.string(),summary:z.string().max(600),report:sourceReportSchema.optional()})).max(4).optional()}).strict()).min(1).max(1000),
 task:z.object({scope:z.enum(['strategy','monthly']),id:z.string().max(80),revision:z.number().int().min(0)}).strict().optional(),
 resume:z.object({reply:z.record(z.unknown()).optional(),reviewOpen:z.boolean(),prompt:z.string().max(1200),questionState:z.object({active:z.string().max(5),answers:z.record(z.string().max(250)),custom:z.record(z.boolean())}).optional()}).optional(),
 currentDraft:z.record(z.unknown()).optional()
}).strict().refine(value=>JSON.stringify(value).length<=1000000,'Conversation is too large. Start a new chat.');
const schema=new Schema({_id:{type:String,required:true},title:{type:String,required:true},snapshot:{type:Schema.Types.Mixed,required:true},revision:{type:Number,required:true},memory:{type:Schema.Types.Mixed},updatedAt:{type:String,required:true}},{versionKey:false});
schema.index({updatedAt:-1});
export const ConversationModel=mongoose.model('AssistantConversation',schema);
export const CHAT_LIMITS={bytes:100*1024*1024,count:500,warningPercent:90};
const storageSchema=new Schema({_id:String,serial:Number,lastCleanupAt:String,lastRemovedCount:Number,totalRemoved:Number},{versionKey:false});
const ChatStorageModel=mongoose.model('AssistantChatStorage',storageSchema);
export interface StorageRow {_id:string;updatedAt:string;bytes:number}
export function cleanupCandidates(rows:StorageRow[],protectedId:string,limits=CHAT_LIMITS){
 let bytes=rows.reduce((sum,row)=>sum+row.bytes,0),count=rows.length;
 if(bytes<limits.bytes&&count<limits.count)return [];
 const targetBytes=Math.floor(limits.bytes*0.85),targetCount=Math.floor(limits.count*0.85),remove:string[]=[];
 for(const row of [...rows].sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)||a._id.localeCompare(b._id))){if(bytes<=targetBytes&&count<=targetCount)break;if(row._id===protectedId)continue;remove.push(row._id);bytes-=row.bytes;count--;}
 return remove;
}
export const conversationRouter=Router();
conversationRouter.get('/storage',async(_req,res)=>{const [rows,cleanup]=await Promise.all([ConversationModel.aggregate<{bytes:number;count:number}>([{$group:{_id:null,bytes:{$sum:{$bsonSize:'$$ROOT'}},count:{$sum:1}}}]),ChatStorageModel.findById('workspace').lean()]);const usedBytes=rows[0]?.bytes??0,count=rows[0]?.count??0;res.json({usedBytes,count,maxBytes:CHAT_LIMITS.bytes,maxCount:CHAT_LIMITS.count,percent:Math.min(100,Math.max(usedBytes/CHAT_LIMITS.bytes,count/CHAT_LIMITS.count)*100),warningPercent:CHAT_LIMITS.warningPercent,lastCleanupAt:cleanup?.lastCleanupAt,lastRemovedCount:cleanup?.lastRemovedCount??0});});
const idSchema=z.string().uuid();
conversationRouter.get('/',async(req,res)=>{const {before}=z.object({before:z.string().datetime().optional()}).parse(req.query);res.json(await ConversationModel.find(before?{updatedAt:{$lt:before}}:{}).select('_id title revision updatedAt').sort({updatedAt:-1}).limit(100).lean());});
conversationRouter.get('/:id',async(req,res)=>{const row=await ConversationModel.findById(idSchema.parse(req.params.id)).lean();if(!row)throw new AppError(404,'CHAT_NOT_FOUND','This conversation was deleted.');res.json(row);});
conversationRouter.put('/:id',async(req,res)=>{const id=idSchema.parse(req.params.id);const input=z.object({snapshot:conversationSnapshotSchema,expectedRevision:z.number().int().min(0)}).strict().parse(req.body);
 await ConversationModel.init();await ChatStorageModel.updateOne({_id:'workspace'},{$setOnInsert:{serial:0}},{upsert:true});
 const result=await mongoose.connection.transaction(async session=>{
  await ChatStorageModel.updateOne({_id:'workspace'},{$inc:{serial:1}},{session});
  const existing=await ConversationModel.findById(id).session(session).lean();
  if(existing&&existing.revision!==input.expectedRevision){if(isDeepStrictEqual(existing.snapshot,input.snapshot))return {revision:existing.revision};throw new AppError(409,'CHAT_CHANGED','This chat changed elsewhere. Reopen it before continuing.');}
  if(!existing&&input.expectedRevision!==0)throw new AppError(409,'CHAT_CHANGED','This chat changed elsewhere or was deleted. Reopen it before continuing.');
  const revision=(existing?.revision??0)+1;
  await ConversationModel.updateOne({_id:id},{$set:{snapshot:input.snapshot,revision,updatedAt:new Date().toISOString()},$setOnInsert:{title:(input.snapshot.messages.find(m=>m.role==='user')?.text??'Conversation').replace(/\s+/g,' ').slice(0,80)}},{session,upsert:true});
  const rows=await ConversationModel.aggregate<StorageRow>([{$project:{updatedAt:1,bytes:{$bsonSize:'$$ROOT'}}},{$sort:{updatedAt:1,_id:1}}]).session(session);
  const remove=cleanupCandidates(rows,id);
  if(remove.length){await ConversationModel.deleteMany({_id:{$in:remove}},{session});await ChatStorageModel.updateOne({_id:'workspace'},{$set:{lastCleanupAt:new Date().toISOString(),lastRemovedCount:remove.length},$inc:{totalRemoved:remove.length}},{session});}
  return {revision,removedCount:remove.length};
 });res.json(result);
});
conversationRouter.patch('/:id',async(req,res)=>{const {title}=z.object({title:z.string().trim().min(1).max(80)}).strict().parse(req.body);const row=await ConversationModel.findByIdAndUpdate(idSchema.parse(req.params.id),{$set:{title}},{returnDocument:'after'});if(!row)throw new AppError(404,'CHAT_NOT_FOUND','This conversation was deleted.');res.json({ok:true});});
conversationRouter.delete('/:id',async(req,res)=>{await ConversationModel.deleteOne({_id:idSchema.parse(req.params.id)});res.json({ok:true});});
