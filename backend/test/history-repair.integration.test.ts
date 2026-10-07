import { after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { jobs,redis } from '../src/shared/redis.js';
import { storedCandles } from '../src/modules/market-data/repository.js';
import { repairIntradayHistory } from '../src/modules/market-data/services/history-repair.service.js';
import type { Instrument } from '../src/modules/market-data/types.js';
after(async()=>{await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();});
test('repair recovers real candles, caches provider gaps, preserves failures and bounds requests',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const name='quantforge_test_'+randomUUID().replaceAll('-',''),uri=new URL(env.MONGODB_URI);uri.pathname='/'+name;
 const stock={_id:'NSE:1',securityId:'1',exchange:'NSE',symbol:'TEST'} as Instrument;
 const from='2026-09-25',to='2026-09-26',now=Date.parse('2026-10-05T00:00:00Z');
 const start=Date.parse(from+'T09:15:00+05:30')/1000;
 const response={timestamp:[start+60],open:[100],high:[101],low:[99],close:[100],volume:[10]};
 let calls=0;const request=async(_path:string,body:unknown)=>{assert.equal((body as {fromDate:string}).fromDate,from+' 09:14:00');calls++;return response;};
 try{
  await mongoose.connect(uri.toString());
  const first=await repairIntradayHistory(stock,from,to,{remaining:1},request,now);
  assert.equal(first.recoveredCandles,1);assert.equal(first.providerMissingSessions,1);
  assert.equal(await storedCandles.countDocuments(),1,'Missing minutes are never manufactured');
  const second=await repairIntradayHistory(stock,from,to,{remaining:1},request,now);
  assert.equal(second.reusedChecks,1);assert.equal(calls,1);
  const forced=await repairIntradayHistory(stock,from,to,{remaining:1},request,now,true);
  assert.equal(forced.checkedSessions,1);assert.equal(calls,2,'Explicit retry bypasses a provider-gap receipt');
  await storedCandles.deleteMany({instrumentId:stock._id});
  const restored=await repairIntradayHistory(stock,from,to,{remaining:1},request,now);
  assert.equal(restored.recoveredCandles,1,'A receipt cannot hide locally lost data');
  const deferred=await repairIntradayHistory(stock,from,to,{remaining:0},request,now+8*86400000);
  assert.equal(deferred.deferredSessions,1);
  const failed=await repairIntradayHistory(stock,from,to,{remaining:1},async()=>{throw new Error('offline');},now+8*86400000);
  assert.equal(failed.failedChecks,1);assert.equal(await storedCandles.countDocuments(),1);
 }finally{
  if(mongoose.connection.readyState===1&&mongoose.connection.name===name&&/^quantforge_test_[a-f0-9]{32}$/.test(name))await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
 }
});
