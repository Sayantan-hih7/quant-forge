import { after } from 'node:test';
import { maintenance } from '../src/shared/redis.js';
import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import {env} from '../src/config/env.js';
import {jobs,redis} from '../src/shared/redis.js';
import {PaperSessionModel,PaperOrderModel,PaperPositionModel} from '../src/modules/paper-trading/models/paper.model.js';
import {MonthlyUniverseModel} from '../src/modules/qualification/models/qualification.model.js';
import {currentMonth} from '../src/modules/qualification/services/universe.service.js';
import {fillPaperOrder} from '../src/modules/paper-trading/services/fill.service.js';
import {paperOrderHistory} from '../src/modules/paper-trading/services/order-history.service.js';
import {amendPaperOrder,exitPaperPosition} from '../src/modules/paper-trading/services/order-controls.service.js';
import {queueIntradaySquareOff} from '../src/modules/paper-trading/services/square-off.service.js';
import {processPaperQuote} from '../src/modules/paper-trading/services/runner.service.js';
import type {Risk} from '../src/modules/strategies/validations/strategy.validation.js';
import type {LiveQuote} from '../src/modules/market-feed/types/feed.types.js';

test('history accounting, price edits, direct exits and clock-based square-off keep the paper ledger consistent',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const name=`quantforge_test_${randomUUID().replaceAll('-','')}`,uri=new URL(env.MONGODB_URI);uri.pathname=`/${name}`;
 const base=Date.parse('2026-09-28T05:00:00.000Z'),stamp=(seconds:number)=>new Date(base+seconds*1000).toISOString();
 const risk:Risk={initialCapital:100000,riskPercent:1,maxPositions:4,timeframe:'5m',stopMode:'fixed',stopPercent:10,atrPeriod:14,atrMultiplier:2,targetR:5,overnight:true,slippagePercent:0,feePercent:0.1};
 const quote=(price:number,seconds:number):LiveQuote=>({instrumentId:'NSE:1',symbol:'TEST',exchange:'NSE',price,cumulativeVolume:1000,at:stamp(seconds),receivedAt:stamp(seconds),source:'dhan',session:'isolated-test'});
 async function session(settings:Risk=risk,mode:'automatic'|'confirmation'='automatic'){
  const id=randomUUID();await PaperSessionModel.create({_id:id,strategyId:id,strategy:{risk:settings},mode,cashPaise:10000000,initialPaise:10000000,entriesPaused:false,active:true,revision:1,createdAt:stamp(-100)});return id;
 }
 async function order(sessionId:string,side:'BUY'|'SELL',quantity:number,seconds:number,extra:Record<string,unknown>={}){
  return PaperOrderModel.create({_id:randomUUID(),sessionId,instrumentId:'NSE:1',side,quantity,source:'manual',status:'pending',createdAt:stamp(seconds),eligibleAfter:stamp(seconds),expiresAt:stamp(seconds+600),reason:'Isolated fixture',...extra});
 }
 const held=(id:string)=>PaperPositionModel.findOne({sessionId:id}).lean();
 async function fill(id:string,price:number,second:number){await fillPaperOrder(id,quote(price,second),base+second*1000);}
 try{
  await mongoose.connect(uri.toString());await PaperOrderModel.init();await PaperSessionModel.init();
  // No shared feed keys or real workspace orders are changed by this test.
  mock.method(redis,'exists',async()=>1);mock.method(redis,'publish',async()=>0);
  await MonthlyUniverseModel.create({_id:currentMonth(),month:currentMonth(),members:[{instrumentId:'NSE:1',isin:'TEST',source:'scan',addedAt:stamp(-100)}]});
  const id=await session(),buy=await order(id,'BUY',11,0);
  await fillPaperOrder(buy._id,{...quote(100,1),at:'not-a-date'},base+1000);
  assert.equal(await held(id),null,'Invalid quote timestamps must never fill an order');
  await fillPaperOrder(buy._id,{...quote(100,1),at:stamp(0).replace('Z','+00:00')},base+1000);
  assert.equal(await held(id),null,'Equivalent timestamps cannot count as a subsequent tick');
  await fill(buy._id,100,1);
  const sell=await order(id,'SELL',3,2);await fill(sell._id,110,3);
  const first=await PaperOrderModel.findById(sell._id).lean();
  assert.equal(first?.realizedPnlPaise,2937);assert.equal(first?.entryFeePaise,30);assert.equal(first?.allocatedCostPaise,30030);
  assert.equal((await held(id))?.costPaise,80080);
  let history=await paperOrderHistory({sessionId:id,exitsOnly:true});
  assert.equal(history.items.length,1);assert.equal(history.summary.realizedPnlPaise,2937);assert.equal(history.summary.feesPaise,143);
  await PaperOrderModel.updateOne({_id:sell._id},{$unset:{realizedPnlPaise:1,entryFeePaise:1,allocatedCostPaise:1,entryPaise:1,positionOpenedAt:1}});
  history=await paperOrderHistory({sessionId:id,exitsOnly:true});assert.equal(history.items[0].realizedPnlPaise,2937,'Old fills get the same accounting without modifying cash');
  const last=await order(id,'SELL',8,4);await fill(last._id,90,5);
  history=await paperOrderHistory({sessionId:id,exitsOnly:true});assert.equal(history.summary.realizedPnlPaise,-5215);
  assert.equal((await PaperSessionModel.findById(id))!.cashPaise-10000000,history.summary.realizedPnlPaise);
  assert.equal(history.summary.missing,0);

  const roundingSession=await session({...risk,feePercent:0.005});
  const roundingBuy=await order(roundingSession,'BUY',1,0);await fill(roundingBuy._id,100,1);
  const roundingSell=await order(roundingSession,'SELL',1,2);await fill(roundingSell._id,100,3);
  assert.equal((await PaperOrderModel.findById(roundingBuy._id))?.feePaise,1);
  assert.equal((await PaperOrderModel.findById(roundingSell._id))?.feePaise,1);
  assert.equal((await PaperSessionModel.findById(roundingSession))?.cashPaise,9999998,'Half-paise fees match the historical engine');

  const archived=await session();
  for(let i=0;i<21;i++){
   await order(archived,'BUY',1,10+i*2,{status:'filled',fillPaise:10000,feePaise:10,filledAt:stamp(10+i*2)});
   await order(archived,'SELL',1,11+i*2,{status:'filled',fillPaise:11000,feePaise:11,filledAt:stamp(11+i*2)});
  }
  const page=await paperOrderHistory({sessionId:archived,exitsOnly:true});assert.equal(page.items.length,20);assert.equal(page.hasMore,true);assert.equal(page.summary.realizedPnlPaise,21*979);
  const older=await paperOrderHistory({sessionId:archived,exitsOnly:true,...page.next});assert.equal(older.items.length,1);assert.equal(older.items[0].realizedPnlPaise,979);assert.equal(older.summary.realizedPnlPaise,page.summary.realizedPnlPaise);
  await order(archived,'SELL',1,60,{status:'filled',fillPaise:11000,feePaise:11,filledAt:stamp(60)});
  assert.equal((await paperOrderHistory({sessionId:archived})).summary.realizedPnlPaise,null,'Missing entry history never invents profit');

  const limitSession=await session({...risk,entryOrderType:'limit',entryLimitPrice:100});
  const limit=await order(limitSession,'BUY',10,0,{limitPaise:10000});await fill(limit._id,105,1);
  assert.equal((await PaperOrderModel.findById(limit._id))?.status,'pending');
  const changed=await amendPaperOrder(limit._id,{orderType:'market',expectedEligibleAfter:stamp(0)},base+2000);
  assert.equal(changed?.limitPaise,undefined);assert.equal(changed?.expiresAt,stamp(600));
  await assert.rejects(amendPaperOrder(limit._id,{orderType:'limit',limitPrice:99,expectedEligibleAfter:stamp(0)},base+3000),/changed/);
  await fill(limit._id,105,2);assert.equal(await held(limitSession),null,'An edit cannot fill at its own or an earlier timestamp');
  await fill(limit._id,105,3);assert.equal((await held(limitSession))?.entryPaise,10500,'Market edit overrides the saved strategy buy limit');
  await assert.rejects(amendPaperOrder(limit._id,{orderType:'limit',limitPrice:99,expectedEligibleAfter:changed!.eligibleAfter},base+4000),/unfilled/);
  const sellLimit=await order(limitSession,'SELL',2,4,{orderType:'limit',limitPaise:11000});
  await fill(sellLimit._id,109,5);assert.equal((await PaperOrderModel.findById(sellLimit._id))?.status,'pending');
  await fill(sellLimit._id,111,6);assert.equal((await held(limitSession))?.quantity,8);
  const waiting=await order(limitSession,'SELL',3,7,{orderType:'limit',limitPaise:12000});
  const position=(await held(limitSession))!,exitId=randomUUID();
  const exit=await exitPaperPosition(position._id,{id:exitId,expectedOpenedAt:position.openedAt},base+8000);
  assert.equal((await PaperOrderModel.findById(waiting._id))?.status,'cancelled');assert.equal(exit.quantity,0);assert.equal(exit.orderType,'market');
  assert.equal((await exitPaperPosition(position._id,{id:exitId,expectedOpenedAt:position.openedAt},base+8500))._id,exitId);
  await fill(exitId,106,9);assert.equal(await held(limitSession),null);assert.equal((await PaperOrderModel.findById(exitId))?.quantity,8);
  await assert.rejects(exitPaperPosition(position._id,{id:randomUUID(),expectedOpenedAt:position.openedAt},base+10000),/already closed/);

  const editedSignalSession=await session(),signalBuy=await order(editedSignalSession,'BUY',1,0,{source:'signal'});
  await amendPaperOrder(signalBuy._id,{orderType:'limit',limitPrice:100,expectedEligibleAfter:stamp(0)},base+1000);
  await fill(signalBuy._id,99,2);assert.equal((await held(editedSignalSession))?.quantity,1,'A user-edited buy is an explicit instruction even though future automatic entries are paused');
  const raceSession=await session(),racing=await order(raceSession,'BUY',1,0);
  await Promise.allSettled([amendPaperOrder(racing._id,{orderType:'limit',limitPrice:90,expectedEligibleAfter:stamp(0)},base+1000),fill(racing._id,100,2)]);
  const raced=await PaperOrderModel.findById(racing._id).lean();
  if(raced?.status==='filled'){assert.equal(raced.fillPaise,10000);assert.equal(raced.amendments?.length??0,0,'A concurrent edit cannot rewrite a completed fill');}
  else{assert.equal(raced?.limitPaise,9000);assert.equal(await held(raceSession),null);await fill(racing._id,90,3);}
  assert.equal((await held(raceSession))?.quantity,1);assert.equal(await PaperOrderModel.countDocuments({sessionId:raceSession,status:'filled'}),1);

  const intraday=await session({...risk,overnight:false},'confirmation'),swing=await session();
  for(const sid of [intraday,swing]){const b=await order(sid,'BUY',10,0);await fill(b._id,100,1);}
  await PaperSessionModel.updateOne({_id:intraday},{$set:{entriesPaused:true}});
  const partial=await order(intraday,'SELL',2,5,{status:'confirmation',limitPaise:15000,expiresAt:'2026-09-28T10:00:00.000Z'});
  const cutoff=Date.parse('2026-09-28T09:40:00.000Z');
  await queueIntradaySquareOff(cutoff-1000);assert.equal((await PaperOrderModel.findById(partial._id))?.status,'confirmation');
  await queueIntradaySquareOff(cutoff);await queueIntradaySquareOff(cutoff+100);
  const square=(await PaperOrderModel.findOne({sessionId:intraday,reason:'Session close'}).lean())!;
  assert.ok(square);assert.equal(square.status,'pending');assert.equal(square.quantity,0);assert.equal((await PaperOrderModel.findById(partial._id))?.status,'cancelled');
  assert.equal(await PaperOrderModel.countDocuments({sessionId:intraday,reason:'Session close'}),1);
  assert.equal(await PaperOrderModel.countDocuments({sessionId:swing,reason:'Session close'}),0);
  await assert.rejects(amendPaperOrder(square._id,{orderType:'limit',limitPrice:150,expectedEligibleAfter:square.eligibleAfter},cutoff+100),/cannot be repriced/);
  await fillPaperOrder(square._id,{...quote(101,1),at:new Date(cutoff-16000).toISOString()},cutoff);assert.ok(await held(intraday));
  await processPaperQuote({...quote(101,1),at:new Date(cutoff+1000).toISOString()},[intraday],cutoff+1000);
  assert.equal(await held(intraday),null,'Square-off fills without confirmation and while buys are paused');
  const intradayBuy=await order(intraday,'BUY',1,0,{expiresAt:'2026-09-28T10:00:00.000Z'});
  await fillPaperOrder(intradayBuy._id,{...quote(100,1),at:new Date(cutoff+2000).toISOString()},cutoff+2000);
  assert.equal((await PaperOrderModel.findById(intradayBuy._id))?.status,'rejected');
  const retrySession=await session({...risk,overnight:false});const retryBuy=await order(retrySession,'BUY',10,0);await fill(retryBuy._id,100,1);
  await queueIntradaySquareOff(cutoff);
  await PaperOrderModel.updateMany({sessionId:retrySession,status:'pending'},{$set:{status:'expired'}});
  await queueIntradaySquareOff(cutoff+61000);assert.equal(await PaperOrderModel.countDocuments({sessionId:retrySession,status:'pending',reason:'Session close'}),1,'Square-off retries expired exits');
  await PaperOrderModel.updateMany({sessionId:retrySession,status:'pending'},{$set:{status:'expired'}});
  await queueIntradaySquareOff(Date.parse('2026-09-29T03:45:00.000Z'));
  assert.equal(await PaperOrderModel.countDocuments({sessionId:retrySession,status:'pending',reason:'Session close'}),1,'A missed intraday exit is requeued at the next regular open');
  const partialSession=await session(),partialBuy=await order(partialSession,'BUY',10,0);await fill(partialBuy._id,100,1);
  const partialPosition=(await held(partialSession))!;
  const manualPartial=await exitPaperPosition(partialPosition._id,{id:randomUUID(),expectedOpenedAt:partialPosition.openedAt,quantity:4},base+2000);
  await fill(manualPartial._id,110,3);assert.equal((await held(partialSession))?.quantity,6);assert.equal((await PaperOrderModel.findById(manualPartial._id))?.realizedPnlPaise,3916);
 }finally{
  mock.restoreAll();
  if(mongoose.connection.readyState===1&&mongoose.connection.name===name&&/^quantforge_test_[a-f0-9]{32}$/.test(name))await mongoose.connection.dropDatabase();
  await mongoose.disconnect();await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();
 }
});

after(async()=>{if(process.env.RUN_DB_TESTS!=='1'){await jobs.waitUntilReady();await maintenance.waitUntilReady();await jobs.close();await maintenance.close();redis.disconnect();}});
