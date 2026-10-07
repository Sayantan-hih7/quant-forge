import test from 'node:test';
import assert from 'node:assert/strict';
import { intradaySessions } from '../src/modules/market-data/services/intraday-quality.js';
const start=Date.parse('2026-09-25T09:15:00+05:30');
const rows=Array.from({length:375},(_,i)=>({time:new Date(start+i*60000).toISOString(),volume:100}));
const from='2026-09-25T00:00:00+05:30',to='2026-09-26T00:00:00+05:30';
test('distinguishes opening, internal and closing omissions',()=>{
 const [day]=intradaySessions(rows.filter((_,i)=>i>1&&i!==100&&i<374),from,to);
 assert.equal(day.leading,2);assert.equal(day.internal,1);assert.equal(day.trailing,1);assert.equal(day.missing,4);
});
test('reports entirely absent known sessions but excludes weekends',()=>{
 const days=intradaySessions([],from,'2026-09-28T00:00:00+05:30');
 assert.equal(days.length,1);assert.equal(days[0].missing,375);assert.equal(days[0].noCandles,true);
});
test('zero-volume closing bars cannot establish exit liquidity',()=>{
 const [day]=intradaySessions(rows.map((r,i)=>({...r,volume:i>=360?0:100})),from,to);
 assert.equal(day.missing,0);assert.equal(day.zeroVolumeMinutes,15);assert.equal(day.hasExitTrade,false);
});
