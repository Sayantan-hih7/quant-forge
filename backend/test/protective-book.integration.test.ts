import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import {env} from '../src/config/env.js';
import {connectDatabase,disconnectDatabase} from '../src/shared/database.js';
import {jobs,redis,maintenance} from '../src/shared/redis.js';
import {PaperSessionModel,PaperPositionModel,PaperOrderModel} from '../src/modules/paper-trading/models/paper.model.js';
import {fillPaperOrder} from '../src/modules/paper-trading/services/fill.service.js';
import type {LiveQuote,LiveBook} from '../src/modules/market-feed/types/feed.types.js';
after(async()=>{await maintenance.close();await jobs.close();if(redis.status!=='end')await redis.quit();});
test('protective book fill reconciles ledger and rejects insufficient liquidity',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const name='quantforge_test_'+randomUUID().replaceAll('-',''),uri=new URL(env.MONGODB_URI);uri.pathname='/'+name;env.MONGODB_URI=uri.toString();
 const now=Date.parse('2026-10-06T08:54:20Z'),at=new Date(now).toISOString(),openedAt='2026-10-06T08:00:00.000Z';
 try{
  await connectDatabase();
  await PaperSessionModel.create({_id:'s',strategyId:'strategy',strategy:{risk:{overnight:false,slippagePercent:0.05,feePercent:0,maxPositions:3}},mode:'automatic',cashPaise:9900000,initialPaise:10000000,entriesPaused:false,active:true,createdAt:openedAt,revision:0});
  await PaperPositionModel.create({_id:'s:NSE:1',sessionId:'s',instrumentId:'NSE:1',symbol:'TEST',quantity:10,entryPaise:10000,costPaise:100000,stopPaise:9600,targetPaise:12000,openedAt});
  await PaperOrderModel.create({_id:'exit',sessionId:'s',instrumentId:'NSE:1',side:'SELL',quantity:0,source:'protection',status:'pending',createdAt:new Date(now-6000).toISOString(),eligibleAfter:new Date(now-6000).toISOString(),expiresAt:new Date(now+60000).toISOString(),reason:'Stop loss',positionOpenedAt:openedAt});
  const quote:LiveQuote={instrumentId:'NSE:1',symbol:'TEST',exchange:'NSE',price:95,cumulativeVolume:20,at:new Date(now-60000).toISOString(),receivedAt:new Date(now-60000).toISOString(),source:'motilal',session:'feed'};
  const book:LiveBook={instrumentId:'NSE:1',source:'motilal',session:'feed',receivedAt:at,bestBidAt:new Date(now-1000).toISOString(),bids:[{price:95,quantity:9,orders:1}],lowerCircuit:80};
  await fillPaperOrder('exit',quote,now,book);
  assert.equal((await PaperOrderModel.findById('exit'))?.status,'pending');
  assert.equal((await PaperSessionModel.findById('s'))?.cashPaise,9900000);
  book.bids![0].quantity=10;await fillPaperOrder('exit',quote,now,book);
  const order=await PaperOrderModel.findById('exit');
  assert.equal(order?.status,'filled');assert.equal(order?.fillSource,'book');assert.equal(order?.fillPaise,9495);
  assert.equal(order?.realizedPnlPaise,-5050);
  assert.equal((await PaperSessionModel.findById('s'))?.cashPaise,9994950);
  assert.equal(await PaperPositionModel.countDocuments(),0);
  await fillPaperOrder('exit',quote,now,book);
  assert.equal((await PaperSessionModel.findById('s'))?.cashPaise,9994950);
 }finally{if(mongoose.connection.name===name)await mongoose.connection.dropDatabase();await disconnectDatabase();}
});
