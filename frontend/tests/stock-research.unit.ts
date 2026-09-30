import { test } from 'node:test';
import assert from 'node:assert/strict';
import { technicalSummary,observedRange } from '../src/modules/stock-details/utils/technicalSummary.ts';
const now=Date.parse('2026-09-30T06:00:00Z');
const bars=Array.from({length:250},(_,i)=>({time:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),open:100+i,high:103+i,low:99+i,close:102+i,volume:10000}));
test('new listings do not receive a false neutral rating from missing indicators',()=>{
 const result=technicalSummary(bars.slice(0,5),now);assert.equal(result.available,0);assert.equal(result.neutral,0);assert.equal(result.verdict,'unavailable');
});
test('the daily snapshot excludes the forming session and preserves deterministic readings',()=>{
 const expected=technicalSummary(bars,now);
 const actual=technicalSummary([...bars,{time:'2026-09-30',open:900,high:999,low:800,close:900,volume:5}],now);
 assert.deepEqual(actual,expected);assert.equal(actual.available,6);assert.equal(actual.verdict,'bullish');assert.equal(actual.rows.filter(x=>x.directional).length,6);assert.equal(actual.pivots?.length,7);
});
test('available history ranges exclude a forming extreme and return no fabricated values',()=>{
 assert.equal(observedRange([],now),undefined);
 assert.deepEqual(observedRange([...bars,{time:'2026-09-30',open:900,high:99999,low:1,close:900,volume:5}],now),observedRange(bars,now));
});
