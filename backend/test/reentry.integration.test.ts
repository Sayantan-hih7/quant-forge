import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import {env} from '../src/config/env.js';
import {connectDatabase,disconnectDatabase} from '../src/shared/database.js';
import {jobs,redis} from '../src/shared/redis.js';
import {PaperSessionModel,PaperOrderModel,PaperPositionModel} from '../src/modules/paper-trading/models/paper.model.js';
import {MonthlyUniverseModel} from '../src/modules/qualification/models/qualification.model.js';
import {currentMonth} from '../src/modules/qualification/services/universe.service.js';
import {fillPaperOrder} from '../src/modules/paper-trading/services/fill.service.js';
import type {LiveQuote} from '../src/modules/market-feed/types/feed.types.js';
after(async()=>{if(process.env.RUN_DB_TESTS!=='1'){await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();}});
test('persisted fills enforce cooldown and daily buy limits while partial and full sells remain available',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const name=`quantforge_test_${randomUUID().replaceAll('-','')}`,uri=new URL(env.MONGODB_URI);uri.pathname=`/${name}`;env.MONGODB_URI=uri.toString();
 const base=Date.parse('2026-10-07T05:00:00Z');
 try{
  await connectDatabase();assert.equal(mongoose.connection.name,name);
  await MonthlyUniverseModel.create({_id:currentMonth(),month:currentMonth(),members:[{instrumentId:'NSE:1',isin:'TEST',source:'scan',addedAt:new Date(base).toISOString()}]});
  await PaperSessionModel.create({_id:'test',strategyId:'test',active:true,mode:'automatic',entriesPaused:false,cashPaise:10000000,initialPaise:10000000,revision:1,createdAt:new Date(base).toISOString(),strategy:{risk:{initialCapital:100000,riskPercent:1,maxPositions:2,stopMode:'fixed',stopPercent:5,targetR:2,overnight:false,feePercent:0,slippagePercent:0,reentryCooldownMinutes:15,maxEntriesPerStockPerDay:2}}});
  async function fill(side:'BUY'|'SELL',quantity:number,minutes:number){
   const now=base+minutes*60000,at=new Date(now).toISOString(),id=randomUUID();
   await PaperOrderModel.create({_id:id,sessionId:'test',instrumentId:'NSE:1',side,quantity,source:'signal',status:'pending',createdAt:new Date(now-2000).toISOString(),eligibleAfter:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString(),reason:'test',referencePrice:100});
   const q:LiveQuote={instrumentId:'NSE:1',symbol:'TEST',exchange:'NSE',price:100,at,receivedAt:at,cumulativeVolume:1000,source:'dhan',session:'fixture'};
   await fillPaperOrder(id,q,now);return (await PaperOrderModel.findById(id).lean())!;
  }
  assert.equal((await fill('BUY',10,0)).status,'filled');
  assert.equal((await fill('SELL',4,1)).status,'filled');
  assert.equal((await PaperPositionModel.findOne())?.quantity,6);
  assert.equal((await fill('SELL',6,2)).status,'filled');
  assert.match((await fill('BUY',10,16)).message!,/cooldown/);
  assert.equal((await fill('BUY',10,17)).status,'filled');
  assert.equal((await fill('SELL',10,18)).status,'filled');
  assert.match((await fill('BUY',10,33)).message!,/Daily entry limit/);
  assert.equal((await fill('BUY',10,315)).status,'pending'); // 15:15 IST: never fill an auction quote
  assert.equal(await PaperPositionModel.countDocuments(),0);
  assert.equal((await PaperSessionModel.findById('test'))?.cashPaise,10000000);
 }finally{
  if(mongoose.connection.name===name)await mongoose.connection.dropDatabase();
  await disconnectDatabase();await jobs.close();await redis.quit();
 }
});
