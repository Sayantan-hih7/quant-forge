import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactMessages} from '../src/modules/ai/services/conversation-memory.js';
const messages=Array.from({length:20},(_,i)=>({role:i%2?'assistant' as const:'user' as const,text:i===0?'Capital 100000, paper only':`Message ${i}`}));
test('long conversations retain compacted early decisions and all recent messages',async()=>{
 let calls=0;const generate=async(_system:string,input:string)=>{calls++;assert.match(input,/Capital 100000/);return {summary:'Goal: paper only. Capital: 100000. No execution authorized.'};};
 const result=await compactMessages(messages,undefined,generate);assert.equal(calls,1);assert.equal(result.messages.length,11);assert.match(result.messages[0].text,/100000/);assert.deepEqual(result.messages.slice(1),messages.slice(-10));assert.equal(result.memory?.count,10);
 const cached=await compactMessages(messages,result.memory,async()=>{throw new Error('Must reuse cache');});assert.deepEqual(cached,result);
 const next=await compactMessages([...messages,{role:'user',text:'Next'}],result.memory,async(_system,input)=>{const value=JSON.parse(input);assert.match(value.previousSummary,/100000/);assert.equal(value.olderMessages.length,1);return {summary:'Paper only. Capital 100000. Pending next question.'};});assert.equal(next.memory?.count,11);
});
test('changed history invalidates memory; failed compaction does not silently drop context',async()=>{
 const first=await compactMessages(messages,undefined,async()=>({summary:'Old memory'}));const changed=messages.map((m,i)=>i===0?{...m,text:'Capital corrected to 50000'}:m);
 await compactMessages(changed,first.memory,async(_system,input)=>{const value=JSON.parse(input);assert.equal(value.previousSummary,null);assert.match(input,/50000/);return {summary:'Capital 50000'};});
 await assert.rejects(compactMessages(messages,undefined,async()=>{throw new Error('provider secret');}),/full chat is saved/);
 const short=await compactMessages(messages.slice(0,4),undefined,async()=>{throw new Error('No summary needed');});assert.equal(short.memory,undefined);assert.equal(short.messages.length,4);
});
