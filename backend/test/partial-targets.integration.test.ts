import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/shared/database.js';
import { jobs, redis } from '../src/shared/redis.js';
import { PaperSessionModel, PaperPositionModel, PaperOrderModel } from '../src/modules/paper-trading/models/paper.model.js';
import { MonthlyUniverseModel } from '../src/modules/qualification/models/qualification.model.js';
import { currentMonth } from '../src/modules/qualification/services/universe.service.js';
import { processPaperQuote } from '../src/modules/paper-trading/services/runner.service.js';
import { fillPaperOrder } from '../src/modules/paper-trading/services/fill.service.js';
import type { Risk } from '../src/modules/strategies/validations/strategy.validation.js';
import type { LiveQuote } from '../src/modules/market-feed/types/feed.types.js';

after(async()=>{if(process.env.RUN_DB_TESTS!=='1'){await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();}});

test('partial paper targets persist, fill once, protect the balance and reconcile cash', {skip:process.env.RUN_DB_TESTS!=='1'}, async()=>{
  const name=`quantforge_test_${randomUUID().replaceAll('-','')}`, uri=new URL(env.MONGODB_URI);uri.pathname=`/${name}`;env.MONGODB_URI=uri.toString();
  const base=Date.parse('2026-09-25T05:00:00.000Z');
  const risk:Risk={initialCapital:100000,riskPercent:1,maxPositions:4,timeframe:'1d',stopMode:'fixed',stopPercent:10,atrPeriod:14,atrMultiplier:2,targetR:2,overnight:true,slippagePercent:0,feePercent:0,exitTargets:[{profitPercent:2,closePercent:50},{profitPercent:4,closePercent:50}],breakevenAfterTarget1:true};
  const quote=(price:number,second:number):LiveQuote=>({instrumentId:'NSE:1',symbol:'FIXTURE',exchange:'NSE',price,at:new Date(base+second*1000).toISOString(),receivedAt:new Date(base+second*1000).toISOString(),cumulativeVolume:1000,source:'dhan',session:'test'});
  async function setup(mode:'automatic'|'confirmation'='automatic',quantity=11,settings=risk){
    const id=randomUUID();
    await PaperSessionModel.create({_id:id,strategyId:id,strategy:{risk:settings},mode,cashPaise:10000000,initialPaise:10000000,entriesPaused:false,active:true,revision:1,createdAt:new Date(base).toISOString()});
    const buy=await order(id,'BUY',quantity,0);
    await Promise.all([fillPaperOrder(buy._id,quote(100,0),base),fillPaperOrder(buy._id,quote(100,0),base)]);
    assert.equal((await position(id))?.quantity,quantity);
    return id;
  }
  async function order(sessionId:string,side:'BUY'|'SELL',quantity:number,second:number,source:'manual'|'signal'='manual'){
    return PaperOrderModel.create({_id:randomUUID(),sessionId,instrumentId:'NSE:1',side,quantity,source,status:'pending',createdAt:new Date(base+(second-2)*1000).toISOString(),eligibleAfter:new Date(base+(second-1)*1000).toISOString(),expiresAt:new Date(base+120000).toISOString(),reason:'Fixture'});
  }
  const position=(sessionId:string)=>PaperPositionModel.findOne({sessionId}).lean();
  const tick=(id:string,price:number,second:number)=>processPaperQuote(quote(price,second),[id],base+second*1000);
  async function reconcile(id:string){
    const fills=await PaperOrderModel.find({sessionId:id,status:'filled'}).lean();
    const expected=10000000+fills.reduce((sum,o)=>sum+(o.side==='BUY'?-1:1)*o.quantity*o.fillPaise!-o.feePaise!,0);
    assert.equal((await PaperSessionModel.findById(id))?.cashPaise,expected);
  }
  try{
    await connectDatabase();assert.equal(mongoose.connection.name,name);
    await MonthlyUniverseModel.create({_id:currentMonth(),month:currentMonth(),members:[{instrumentId:'NSE:1',isin:'FIXTURE',source:'scan',addedAt:new Date(base).toISOString()}]});
    for(const mode of ['automatic','confirmation'] as const){
      const id=await setup(mode);
      await tick(id,102,1);
      assert.equal((await position(id))?.quantity,11,'Touch is not an instant fill');
      assert.equal((await position(id))?.stopPaise,9000,'Stop cannot move before fill');
      const target=(await PaperOrderModel.findOne({sessionId:id,source:'protection'}).lean())!;
      assert.equal(target.status,'pending');assert.equal(target.quantity,5);
      await tick(id,102.1,2);await tick(id,102.1,2);
      const remaining=(await position(id))!;
      assert.equal(remaining.quantity,6);assert.equal(remaining.initialQuantity,11);
      assert.equal(remaining.stopPaise,10000);assert.equal(remaining.breakevenActivated,true);
      assert.equal(remaining.targets![0].filledQuantity,5);assert.equal(remaining.targets![0].completed,true);
      assert.equal(await PaperOrderModel.countDocuments({sessionId:id,targetIndex:0,status:'filled'}),1);
      await fillPaperOrder(target._id,quote(106,3),base+3000);
      assert.equal((await position(id))?.quantity,6,'A restart/replayed order cannot sell the target twice');
      await tick(id,99.8,4);await tick(id,99.7,5);
      assert.equal(await position(id),null);
      const stop=await PaperOrderModel.findOne({sessionId:id,reason:'Stop loss'});
      assert.equal(stop?.quantity,6);assert.equal(stop?.status,'filled');await reconcile(id);
    }
    const gap=await setup();
    await tick(gap,105,1);await tick(gap,105.1,2);
    assert.equal((await position(gap))?.quantity,6);
    assert.equal((await PaperOrderModel.findOne({sessionId:gap,targetIndex:1}))?.status,'pending');
    await tick(gap,105.2,3);
    assert.equal(await position(gap),null);await reconcile(gap);

    for(const basis of ['amount','price'] as const){
      const currencyRisk={...risk,exitTargets:(basis==='amount'?[2,4]:[102,104]).map(value=>({basis,value,closePercent:50}))};
      const id=await setup('automatic',11,currencyRisk);
      assert.deepEqual((await position(id))?.targets?.map(t=>t.pricePaise),[10200,10400]);
      await tick(id,102,1);await tick(id,102.1,2);
      assert.equal((await position(id))?.quantity,6);
      assert.equal((await position(id))?.stopPaise,10000);
      await tick(id,104,3);await tick(id,104.1,4);
      assert.equal(await position(id),null);await reconcile(id);
    }
    const invalidId=randomUUID();
    await PaperSessionModel.create({_id:invalidId,strategyId:invalidId,strategy:{risk:{...risk,exitTargets:[{basis:'price',value:100,closePercent:50},{basis:'price',value:104,closePercent:50}]}},mode:'automatic',cashPaise:10000000,initialPaise:10000000,entriesPaused:false,active:true,revision:1,createdAt:new Date(base).toISOString()});
    const invalidBuy=await order(invalidId,'BUY',11,0);
    await fillPaperOrder(invalidBuy._id,quote(100,0),base);
    assert.equal((await PaperOrderModel.findById(invalidBuy._id))?.status,'rejected');
    assert.match((await PaperOrderModel.findById(invalidBuy._id))?.message??'',/above the filled entry/);
    assert.equal(await position(invalidId),null);
    assert.equal((await PaperSessionModel.findById(invalidId))?.cashPaise,10000000);

    const stopFirst=await setup();
    await tick(stopFirst,102,1);await tick(stopFirst,89,2);
    assert.equal((await PaperOrderModel.findOne({sessionId:stopFirst,targetIndex:0}))?.status,'cancelled');
    await tick(stopFirst,88,3);
    assert.equal((await PaperOrderModel.findOne({sessionId:stopFirst,reason:'Stop loss'}))?.quantity,11);
    await reconcile(stopFirst);

    const rRisk:Risk={...risk,stopMode:'price',stopValue:96,breakevenAfterTarget1:false,exitTargets:[{basis:'risk',value:2,closePercent:30},{basis:'risk',value:4,closePercent:30},{basis:'risk',value:5,closePercent:40}],stopManagement:{breakeven:{trigger:'risk',at:1},trailing:{trigger:'target',at:1,distanceR:1}}};
    const rId=await setup('automatic',11,rRisk);
    assert.equal((await position(rId))?.initialRiskPaise,400);
    assert.deepEqual((await position(rId))?.targets?.map(t=>[t.pricePaise,t.quantity]),[[10800,3],[11600,3],[12000,5]]);
    await tick(rId,104,1);
    assert.equal((await position(rId))?.quantity,11);assert.equal((await position(rId))?.stopPaise,10000);
    await tick(rId,108,2);
    assert.equal((await position(rId))?.trailingActivated,undefined,'A touch is not a target fill');
    await tick(rId,109,3);
    assert.equal((await position(rId))?.quantity,8);assert.equal((await position(rId))?.stopPaise,10500);
    assert.equal((await position(rId))?.trailingActivated,true);
    await tick(rId,112,4);await tick(rId,110,5);
    assert.equal((await position(rId))?.stopPaise,10800,'The trailing stop never decreases');
    assert.equal((await position(rId))?.initialRiskPaise,400,'Original risk is durable after stop changes');
    await tick(rId,107,6);await tick(rId,106,7);
    assert.equal(await position(rId),null);
    assert.equal((await PaperOrderModel.findOne({sessionId:rId,reason:'Stop loss'}))?.quantity,8);
    await reconcile(rId);

    const limitId=randomUUID();
    await PaperSessionModel.create({_id:limitId,strategyId:limitId,strategy:{risk:{...rRisk,entryOrderType:'limit',entryLimitPrice:100,slippagePercent:1}},mode:'automatic',cashPaise:10000000,initialPaise:10000000,entriesPaused:false,active:true,revision:1,createdAt:new Date(base).toISOString()});
    const limitBuy=await order(limitId,'BUY',11,0);
    await fillPaperOrder(limitBuy._id,quote(105,0),base);
    assert.equal((await PaperOrderModel.findById(limitBuy._id))?.status,'pending');assert.equal(await position(limitId),null);
    assert.equal((await PaperSessionModel.findById(limitId))?.cashPaise,10000000);
    await fillPaperOrder(limitBuy._id,quote(100,1),base+1000);
    assert.equal((await position(limitId))?.entryPaise,10000,'Slippage cannot breach a buy limit');
    assert.equal((await position(limitId))?.initialRiskPaise,400);
    await reconcile(limitId);

    const candleRisk:Risk={...risk,stopMode:'candleLow',breakevenAfterTarget1:false,exitTargets:[{basis:'risk',value:2,closePercent:40,moveStopTo:0},{basis:'risk',value:5,closePercent:30,moveStopTo:1},{basis:'risk',value:8,closePercent:30}]};
    for(const mode of ['automatic','confirmation'] as const){
      const id=randomUUID();
      await PaperSessionModel.create({_id:id,strategyId:id,strategy:{risk:candleRisk},mode,cashPaise:10000000,initialPaise:10000000,entriesPaused:false,active:true,revision:1,createdAt:new Date(base).toISOString()});
      const buy=await order(id,'BUY',100,0);
      await PaperOrderModel.updateOne({_id:buy._id},{$set:{signalLow:96}});
      await fillPaperOrder(buy._id,quote(100,0),base);
      assert.equal((await position(id))?.stopPaise,9600);
      await tick(id,108,1);assert.equal((await position(id))?.stopPaise,9600);
      await tick(id,108,2);
      assert.equal((await position(id))?.quantity,60);assert.equal((await position(id))?.stopPaise,10000);
      await tick(id,120,3);assert.equal((await position(id))?.stopPaise,10000);
      await tick(id,120,4);
      assert.equal((await position(id))?.quantity,30);assert.equal((await position(id))?.stopPaise,10800);
      assert.equal((await position(id))?.initialRiskPaise,400);
      await tick(id,107,5);await tick(id,107,6);
      assert.equal(await position(id),null);await reconcile(id);
      assert.deepEqual((await PaperOrderModel.find({sessionId:id,side:'SELL',status:'filled'}).sort({createdAt:1}).lean()).map(o=>o.quantity),[40,30,30]);
    }
    for(const signalLow of [undefined,101]){
      const id=randomUUID();
      await PaperSessionModel.create({_id:id,strategyId:id,strategy:{risk:candleRisk},mode:'automatic',cashPaise:10000000,initialPaise:10000000,entriesPaused:false,active:true,revision:1,createdAt:new Date(base).toISOString()});
      const buy=await order(id,'BUY',100,0);
      if(signalLow)await PaperOrderModel.updateOne({_id:buy._id},{$set:{signalLow}});
      await fillPaperOrder(buy._id,quote(100,0),base);
      assert.equal((await PaperOrderModel.findById(buy._id))?.status,'rejected');
      assert.equal(await position(id),null);assert.equal((await PaperSessionModel.findById(id))?.cashPaise,10000000);
    }

    const manual=await setup('automatic',11,{...risk,feePercent:0.1});
    const sell=await order(manual,'SELL',3,1);
    await fillPaperOrder(sell._id,quote(101,1),base+1000);
    await tick(manual,102,2);await tick(manual,102.1,3);
    assert.equal((await position(manual))?.quantity,3,'Target uses original shares, capped at shares still held');
    const signal=await order(manual,'SELL',0,4,'signal');
    await tick(manual,105,4);
    assert.equal((await PaperOrderModel.findById(signal._id))?.quantity,3,'Sell rule closes remaining shares even above another target');
    assert.equal(await position(manual),null);await reconcile(manual);

    const tiny=await setup('automatic',1);
    await tick(tiny,102,1);
    assert.equal((await position(tiny))?.breakevenActivated,undefined,'Zero-share first target never moves the stop');
    await tick(tiny,104,2);await tick(tiny,104,3);
    assert.equal(await position(tiny),null);await reconcile(tiny);
  }finally{
    if(mongoose.connection.readyState===1 && mongoose.connection.name===name && /^quantforge_test_[a-f0-9]{32}$/.test(name))await mongoose.connection.dropDatabase();
    await disconnectDatabase();await jobs.waitUntilReady();await jobs.close();if(redis.status!=='end')await redis.quit();
  }
});
