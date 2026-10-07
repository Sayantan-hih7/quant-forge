import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyClock} from '../src/shared/clock-health.js';
import {instrumentReplacements} from '../src/modules/market-data/services/instrument-migration.service.js';
import {tradeFeePaise,affordableShares} from '../src/modules/paper-trading/services/trading-costs.js';
import {entryDeviation,dailyRiskBlocked} from '../src/modules/paper-trading/services/execution-safety.js';
import {jobs,redis,maintenance} from '../src/shared/redis.js';
after(async()=>{await maintenance.close();await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();});
test('clock requires independent agreeing samples and rejects drift or uncertainty',()=>{
 assert.equal(classifyClock([-15070,-15020],40).state,'blocked');
 assert.equal(classifyClock([50,80],40).state,'ok');
 assert.equal(classifyClock([50],40).state,'unknown');
 assert.equal(classifyClock([50,5000],40).state,'unknown');
 assert.equal(classifyClock([50,80],1400).state,'unknown');
 assert.equal(classifyClock([2800,2850],200).state,'blocked');
});
test('broker ID migration uses unique same-exchange ISIN, never symbol or other exchange',()=>{
 const old={_id:'NSE:1805',exchange:'NSE' as const,isin:'INE900B01029',active:false,symbol:'KABRAEXTRU'};
 const next={...old,_id:'NSE:8784',active:true};
 assert.deepEqual(instrumentReplacements([old],[next]).map(x=>x.to),['NSE:8784']);
 assert.equal(instrumentReplacements([old],[{...next,exchange:'BSE'}]).length,0);
 assert.equal(instrumentReplacements([old],[next,{...next,_id:'NSE:2'}]).length,0);
 assert.equal(instrumentReplacements([old],[{...next,isin:'different'}]).length,0);
});
test('Indian cash fees match independent 30,000 rupee hand calculations',()=>{
 const base={costModel:'indian-cash' as const,overnight:false,feePercent:0};
 assert.equal(tradeFeePaise(3000000,'BUY',base),1274);
 assert.equal(tradeFeePaise(3000000,'SELL',base),1974);
 assert.equal(tradeFeePaise(3000000,'BUY',{...base,overnight:true}),3612);
 assert.equal(tradeFeePaise(3000000,'SELL',{...base,overnight:true}),4587);
 const q=affordableShares(3000000,10000,base);assert.ok(q*10000+tradeFeePaise(q*10000,'BUY',base)<=3000000);
 assert.ok((q+1)*10000+tradeFeePaise((q+1)*10000,'BUY',base)>3000000);
});
test('entry chase checks reject excessive moves and missing reference',()=>{
 assert.equal(entryDeviation(100,101.5,2),undefined);
 assert.ok(entryDeviation(100,103,2));assert.ok(entryDeviation(undefined,100));
 assert.equal(dailyRiskBlocked({lossLimitDate:'2026-10-05'} as never,Date.parse('2026-10-05T05:00:00Z')),true);
});
