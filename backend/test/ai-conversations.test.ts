import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {once} from 'node:events';
import {conversationRouter,conversationSnapshotSchema,cleanupCandidates,ConversationModel} from '../src/modules/ai/services/conversations.js';
import {env} from '../src/config/env.js';
test('conversation snapshots reject unknown top-level instructions and oversized messages',()=>{
 const snapshot={messages:[{role:'user',text:'Explain strategy'}]};assert.equal(conversationSnapshotSchema.safeParse(snapshot).success,true);
 assert.equal(conversationSnapshotSchema.safeParse({...snapshot,attachments:[]}).success,false);assert.equal(conversationSnapshotSchema.safeParse({...snapshot,workflow:{kind:'paper'}}).success,false);
 assert.equal(conversationSnapshotSchema.safeParse({messages:[{role:'user',text:'a'.repeat(4001)}]}).success,false);
});
test('conversations persist, tolerate response retries, reject stale writes, rename and delete',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const name=`quantforge_test_${randomUUID().replaceAll('-','')}`,uri=new URL(env.MONGODB_URI);uri.pathname='/'+name;
 const app=express();app.use(express.json());app.use('/chats',conversationRouter);app.use((e:Error&{status?:number},_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(e.status??500).json({message:e.message});});
 const server=app.listen(0,'127.0.0.1');
 try{await mongoose.connect(uri.toString());if(!server.listening)await once(server,'listening');
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/chats`,id=randomUUID(),snapshot={messages:[{role:'user',text:'My test chat'}]};
 const put=(revision:number,value:unknown=snapshot)=>fetch(base+'/'+id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:revision,snapshot:value})});
 assert.equal((await put(0,{messages:[],resume:{prompt:'hello',reviewOpen:false}})).status,400);assert.equal(await ConversationModel.countDocuments(),0);
 assert.equal((await put(0)).status,200);assert.equal((await put(0)).status,200);
 const changed={messages:[...snapshot.messages,{role:'assistant',text:'Answer'}]};assert.equal((await put(1,changed)).status,200);assert.equal((await put(1,changed)).status,200);assert.equal((await put(1)).status,409);
 const loaded=await(await fetch(base+'/'+id)).json() as {snapshot:unknown;revision:number};assert.deepEqual(loaded.snapshot,changed);assert.equal(loaded.revision,2);
 assert.equal((await fetch(base+'/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Renamed'})})).status,200);
 const list=await(await fetch(base)).json() as {title:string;snapshot?:unknown}[];assert.equal(list[0].title,'Renamed');assert.equal(list[0].snapshot,undefined);
 const draftId=randomUUID();await ConversationModel.create({_id:draftId,title:'Unsent legacy draft',snapshot:{messages:[],resume:{prompt:'hello',reviewOpen:false}},revision:1,updatedAt:new Date().toISOString()});
 const visible=await(await fetch(base)).json() as {_id:string}[];assert.equal(visible.some(row=>row._id===draftId),false);await ConversationModel.deleteOne({_id:draftId});
 const usage=await(await fetch(base+'/storage')).json() as {count:number;maxCount:number;usedBytes:number};assert.equal(usage.count,1);assert.equal(usage.maxCount,500);assert.ok(usage.usedBytes>0);
 // Exercise the real cleanup transaction in this isolated test database.
 await ConversationModel.insertMany(Array.from({length:498},(_,i)=>({_id:randomUUID(),title:`Old ${i}`,snapshot,revision:1,updatedAt:`2020-01-01T00:00:${String(i%60).padStart(2,'0')}.000Z`}))); 
 const newest=randomUUID();const saved=await fetch(base+'/'+newest,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({snapshot,expectedRevision:0})});assert.equal(saved.status,200);
 assert.equal(await ConversationModel.countDocuments(),425);assert.ok(await ConversationModel.exists({_id:newest}));assert.ok(await ConversationModel.exists({_id:id}));
 const cleaned=await(await fetch(base+'/storage')).json() as {lastRemovedCount:number};assert.equal(cleaned.lastRemovedCount,75);
 await fetch(base+'/'+id,{method:'DELETE'});assert.equal((await fetch(base+'/'+id)).status,404);assert.equal((await put(2)).status,409);
 }finally{server.close();if(mongoose.connection.name===name&&/^quantforge_test_[a-f0-9]{32}$/.test(name))await mongoose.connection.dropDatabase();await mongoose.disconnect();}
});


test('cleanup is oldest first at either cap, protects the current chat, and ignores under-limit data',()=>{
 const rows=[{_id:'current',updatedAt:'2020-01-01',bytes:30},{_id:'old',updatedAt:'2020-01-02',bytes:30},{_id:'new',updatedAt:'2020-01-03',bytes:40}];
 assert.deepEqual(cleanupCandidates(rows,'current',{bytes:101,count:4,warningPercent:90}),[]);
 assert.deepEqual(cleanupCandidates(rows,'current',{bytes:100,count:4,warningPercent:90}),['old']);
 assert.deepEqual(cleanupCandidates(rows,'current',{bytes:1000,count:3,warningPercent:90}),['old']);
 assert.deepEqual(cleanupCandidates([...rows].reverse(),'current',{bytes:40,count:3,warningPercent:90}),['old','new']);
});


test('history retains presentation, bounded files, pending controls and unsent drafts',()=>{
 const files=[{kind:'text',name:'rules.md',text:'- Completed candles only'}];
 const value={messages:[{role:'assistant',text:'Review this',presentation:{proposal:{name:'Draft'},review:{blocked:false,issues:[]}}}],resume:{reviewOpen:true,prompt:'Next question',attachments:files,workflow:{kind:'backtest',revision:7,strategyId:'abc'},backtestState:{from:'2026-09-01',to:'2026-09-30',exchange:'NSE',universe:'current',ack:true,ids:['stock'],reportId:'report',mode:'signals',started:false}}};
 assert.deepEqual(conversationSnapshotSchema.parse(value),value);
 assert.equal(conversationSnapshotSchema.safeParse({messages:[],resume:{prompt:'Unsent message',reviewOpen:false}}).success,true);
 assert.equal(conversationSnapshotSchema.safeParse({...value,resume:{...value.resume,backtestState:{...value.resume.backtestState,mode:'live'}}}).success,false);
 assert.equal(conversationSnapshotSchema.safeParse({...value,resume:{...value.resume,attachments:[{kind:'text',name:'huge.txt',text:'a'.repeat(20001)}]}}).success,false);
});


test('message timestamps, failure state and execution timing survive validation',()=>{
 const id=randomUUID();const snapshot={messages:[{id,role:'user',text:'Check records',createdAt:'2026-10-09T04:00:00.000Z',status:'failed'},{role:'assistant',text:'Provider unavailable',replyTo:id,createdAt:'2026-10-09T04:00:01.000Z',status:'failed',durationMs:1000,activity:[{tool:'connections',status:'completed',checkedAt:'2026-10-09T04:00:00.500Z',durationMs:123,summary:'Checked feed'}]}]};
 assert.deepEqual(conversationSnapshotSchema.parse(snapshot),snapshot);
 assert.equal(conversationSnapshotSchema.safeParse({messages:[{role:'assistant',text:'Invalid timer',durationMs:-1}]}).success,false);
});
