import test from 'node:test';
import assert from 'node:assert/strict';
import { assessHorizonFit } from '../src/modules/qualification/services/horizon-fit.js';
import type { Fact } from '../src/modules/market-data/types.js';
const rows=Array.from({length:220},(_,i)=>({time:new Date(Date.UTC(2026,0,1+i)).toISOString(),open:100+i,high:104+i,low:98+i,close:101+i,volume:2_000_000}));
const date=rows.at(-1)!.time.slice(0,10),now=date+'T18:00:00Z';
const facts=[{field:'marketCap',value:3000,knownAt:'2026-01-01',source:'test'},{field:'roe',value:18,knownAt:'2026-01-01',source:'test'}] as Fact[];
test('one stock can match all three transparent research profiles',()=>{
 const result=assessHorizonFit(rows,facts,{value:95},date,now);
 assert.deepEqual(result.profiles.map(p=>p.status),['matched','matched','matched']);
 assert.ok(result.profiles.every(p=>p.checks.every(c=>c.rule&&c.source)));
});
test('short listing history and missing minute data are unknown, never a positive match',()=>{
 const result=assessHorizonFit(rows.slice(-20),facts,{value:null,reason:'Not loaded'},date,now);
 assert.deepEqual(result.profiles.map(p=>p.status),['unavailable','unavailable','unavailable']);
});
test('thinly traded stock fails intraday profile and stale daily history cannot match',()=>{
 assert.equal(assessHorizonFit(rows,facts,{value:5},date,now).profiles[0].status,'not-matched');
 assert.ok(assessHorizonFit(rows,facts,{value:95},'2026-12-01',now).profiles.every(p=>p.status==='unavailable'));
});
test('future company information cannot establish long-term fit',()=>{
 const future=facts.map(f=>({...f,knownAt:'2027-01-01'}));
 assert.equal(assessHorizonFit(rows,future,{value:95},date,now).profiles[2].status,'unavailable');
});
