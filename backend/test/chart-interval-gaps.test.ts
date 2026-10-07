import {test} from 'node:test';
import assert from 'node:assert/strict';
import {missingIntradayIntervals,intradayGapDetails} from '../src/modules/stock-details/utils/chart-bars.js';
const at=(minute:number)=>Date.parse('2026-10-06T03:45:00Z')+minute*60000;
const bar=(minute:number)=>({time:new Date(at(minute)).toISOString(),open:100,high:101,low:99,close:100,volume:20});
test('closed missing minutes are gaps; current forming minute is not',()=>{
 assert.deepEqual(missingIntradayIntervals([bar(0),bar(2),bar(3)],'1m',at(3)+30000),[bar(1).time]);
 assert.deepEqual(missingIntradayIntervals([bar(0),bar(1)],'5m',at(3)+30000),[]);
});
test('partial and wholly absent closed buckets are both reported',()=>{
 assert.deepEqual(missingIntradayIntervals([bar(0),bar(1),bar(2),bar(3),bar(5)],'5m',at(15)+30000),[bar(0).time,bar(5).time,bar(10).time]);
});

test('diagnostics name exact missing minutes, deduplicate observations and exclude forming intervals',()=>{
 const rows=[bar(0),bar(0),bar(2),bar(4),bar(5)];
 assert.deepEqual(intradayGapDetails(rows,'5m',at(6)),[{time:bar(0).time,end:bar(5).time,missingMinutes:[bar(1).time,bar(3).time]}]);
});
