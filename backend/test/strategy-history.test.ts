import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleStrategyHistory } from '../src/modules/strategies/services/strategy-history.service.js';
import { researchPresets } from '../src/modules/strategies/config/research-presets.js';
import type { Strategy } from '../src/modules/strategies/models/strategy.model.js';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const revision=(n:number):Strategy=>({...structuredClone(researchPresets[0].draft),_id:id,revision:n,savedAt:`2026-09-${String(n).padStart(2,'0')}T00:00:00.000Z`});

test('all ten revisions stay available, sorted, with precise backtest and session references',()=>{
 const archive=Array.from({length:10},(_,i)=>({...revision(i+1),_id:`${id}:${i+1}`}));
 const history=assembleStrategyHistory(id,revision(10),archive,[
  {strategy:revision(2),use:{id:'run2',kind:'backtest',status:'completed'}},
  {strategy:revision(4),use:{id:'session4',kind:'paper',status:'Active'}},
 ]);
 assert.deepEqual(history.revisions.map(r=>r.strategy.revision),[10,9,8,7,6,5,4,3,2,1]);
 assert.equal(history.currentRevision,10);assert.deepEqual(history.missingRanges,[]);
 assert.equal(history.revisions.find(r=>r.strategy.revision===2)?.uses[0].id,'run2');
 assert.ok(history.revisions.every(r=>r.strategy._id===id&&!r.inconsistent));
 assert.equal(archive[0]._id,`${id}:1`,'Archive inputs remain immutable');
});
test('legacy snapshots are recovered from actual usage and missing revisions are explicit',()=>{
 const history=assembleStrategyHistory(id,revision(10),[revision(2)],[{strategy:revision(7),use:{id:'old',kind:'signals',status:'Stopped'}}]);
 assert.deepEqual(history.missingRanges,['1','3–6','8–9']);
 assert.equal(history.revisions.find(r=>r.strategy.revision===7)?.source,'session');
 assert.equal(assembleStrategyHistory(id,null,[],[]).currentRevision,null);
});
test('conflicting definitions are flagged without replacing the archived rules with current rules',()=>{
 const archived=revision(1),embedded=revision(1);embedded.risk.riskPercent=0.25;
 const history=assembleStrategyHistory(id,revision(2),[archived],[{strategy:embedded,use:{id:'run',kind:'backtest',status:'completed'}}]);
 const row=history.revisions.find(r=>r.strategy.revision===1)!;
 assert.equal(row.inconsistent,true);assert.equal(row.strategy.risk.riskPercent,archived.risk.riskPercent);
 assert.equal(embedded.risk.riskPercent,0.25);
});
test('metadata and object key ordering do not invent conflicting definitions',()=>{
 const a=revision(1),b={...a,savedAt:'legacy-date',entry:{...a.entry},risk:Object.fromEntries(Object.entries(a.risk).reverse())} as Strategy;
 const history=assembleStrategyHistory(id,a,[b],[]);assert.equal(history.revisions[0].inconsistent,false);
});
