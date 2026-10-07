import { after, test, mock } from 'node:test';
import { engineClient } from '../src/modules/engine/services/engine.service.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/shared/database.js';
import { redis, jobs } from '../src/shared/redis.js';
after(async () => { if (process.env.RUN_DB_TESTS !== '1') { await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit(); } });
import { storedCandles } from '../src/modules/market-data/repository.js';
import { PaperSessionModel, PaperOrderModel, PaperPositionModel, PaperSignalModel, PaperEvaluationModel, PaperEntryEventModel, PaperObservationModel } from '../src/modules/paper-trading/models/paper.model.js';
import { MonthlyUniverseModel } from '../src/modules/qualification/models/qualification.model.js';
import { currentMonth } from '../src/modules/qualification/services/universe.service.js';
import { evaluatePaperStrategies } from '../src/modules/paper-trading/services/runner.service.js';
import { fillPaperOrder } from '../src/modules/paper-trading/services/fill.service.js';
import type { LiveQuote } from '../src/modules/market-feed/types/feed.types.js';
import type { Strategy } from '../src/modules/strategies/models/strategy.model.js';

test('real engine decisions: late daily history, durable deduplication, next-session paper fills and sell rules after removal', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`; env.MONGODB_URI = uri.toString();
  const at = (day: string, time: string) => Date.parse(`${day}T${time}+05:30`);
  const rule = (side: string, value: number) => ({ tier: 'tactical', side, cadence: 'daily', logic: 'AND', groups: [{ logic: 'AND', conditions: [{ left: 'close', leftFrame: '1d', operator: 'gt', rightType: 'value', value }] }] });
  const strategy: Strategy = { _id: randomUUID(), revision: 1, savedAt: new Date().toISOString(), name: 'Isolated deployment fixture', entry: rule('BUY', 50), exit: rule('SELL', 110), risk: { initialCapital: 100000, riskPercent: 1, maxPositions: 4, timeframe: '1d', stopMode: 'fixed', stopPercent: 10, atrPeriod: 14, atrMultiplier: 2, targetR: 5, overnight: true, slippagePercent: 0, feePercent: 0 } };
  const candle = (id: string, day: string, price: number) => ({ instrumentId: id, interval: '1d', time: `${day}T03:45:00.000Z`, open: price, high: price + 1, low: price - 1, close: price, volume: 1000, source: 'test-fixture', observedAt: `${day}T10:01:00.000Z` });
  try {
    await connectDatabase(); assert.equal(mongoose.connection.name, name);
    await MonthlyUniverseModel.create({ _id: currentMonth(), month: currentMonth(), members: ['NSE:1', 'NSE:2', 'NSE:3'].map(instrumentId => ({ instrumentId, isin: instrumentId, source: 'scan', addedAt: '2026-09-01T00:00:00.000Z' })) });
    for (const [id, mode, ids] of [['auto', 'automatic', ['NSE:1', 'NSE:3']], ['confirm', 'confirmation', ['NSE:2']]] as const) {
      await PaperSessionModel.create({ _id: id, strategyId: id, strategy, ids: [...ids], mode, cashPaise: 10000000, initialPaise: 10000000, entriesPaused: false, active: true, createdAt: '2026-09-25T03:30:00.000Z', revision: 1 });
    }
    await storedCandles.insertMany([candle('NSE:1', '2026-09-25', 100), candle('NSE:2', '2026-09-25', 100)]);
    // No live-feed setup is provided: daily signals must work after market close.
    await evaluatePaperStrategies(at('2026-09-25', '16:00:00'));
    assert.equal(await PaperSignalModel.countDocuments(), 2, JSON.stringify(await PaperSessionModel.find().select('message').lean()));
    assert.equal(await PaperEvaluationModel.countDocuments({ _id: /NSE:3/ }), 0);
    assert.equal((await PaperOrderModel.findOne({ sessionId: 'confirm' }))?.status, 'confirmation');
    const buy = (await PaperOrderModel.findOne({ sessionId: 'auto' }).lean())!;
    assert.equal(buy.status, 'pending'); assert.equal(buy.expiresAt, '2026-09-28T04:15:00.000Z');
    await storedCandles.insertMany([candle('NSE:3', '2026-09-25', 100)]);
    await evaluatePaperStrategies(at('2026-09-25', '16:02:00'));
    assert.equal(await PaperSignalModel.countDocuments(), 3, 'Late data must be retried without repeating successful evaluations');
    await evaluatePaperStrategies(at('2026-09-26', '12:00:00'));
    assert.equal(await PaperOrderModel.countDocuments(), 3, 'Durable evaluations prevent restart/weekend duplicates');
    const stamp = new Date(at('2026-09-28', '09:16:00')).toISOString();
    const quote: LiveQuote = { instrumentId: 'NSE:1', symbol: 'FIXTURE', exchange: 'NSE', price: 100, cumulativeVolume: 1000, at: stamp, receivedAt: stamp, source: 'dhan', session: 'isolated-fixture' };
    await fillPaperOrder(buy._id, { ...quote, at: '2026-09-25T09:59:00.000Z' }, Date.parse(stamp));
    assert.equal((await PaperOrderModel.findById(buy._id))?.status, 'pending', 'Stale Friday price cannot fill Monday');
    await fillPaperOrder(buy._id, quote, Date.parse(stamp));
    assert.equal((await PaperPositionModel.findOne())?.quantity, 100);
    const confirm = (await PaperOrderModel.findOne({ sessionId: 'confirm' }))!;
    await fillPaperOrder(confirm._id, { ...quote, instrumentId: 'NSE:2' }, Date.parse(stamp));
    assert.equal((await PaperOrderModel.findById(confirm._id))?.status, 'confirmation');
    await MonthlyUniverseModel.updateOne({ _id: currentMonth() }, { $pull: { members: { instrumentId: 'NSE:1' } } });
    await storedCandles.insertMany([candle('NSE:1', '2026-09-28', 120)]);
    await evaluatePaperStrategies(at('2026-09-28', '16:00:00'));
    const sell = (await PaperOrderModel.findOne({ sessionId: 'auto', side: 'SELL' }))!;
    assert.equal(sell?.positionOpenedAt, (await PaperPositionModel.findOne({ sessionId: 'auto' }))?.openedAt, 'Sell signals bind to the holding they evaluated');
    assert.ok(sell, 'Held stocks keep sell rules after leaving the qualified universe');
    const next = new Date(at('2026-09-29', '09:16:00')).toISOString();
    await fillPaperOrder(sell._id, { ...quote, price: 120, at: next, receivedAt: next }, Date.parse(next));
    assert.equal(await PaperPositionModel.countDocuments(), 0);
    assert.equal((await PaperSessionModel.findById('auto'))?.cashPaise, 10200000);
    // A higher-timeframe crossing must not become a new buy every daily close.
    await PaperSessionModel.updateMany({},{$set:{active:false}});
    await MonthlyUniverseModel.updateOne({_id:currentMonth()},{$push:{members:{instrumentId:'NSE:4',isin:'NSE:4',source:'scan',addedAt:'2026-09-01T00:00:00Z'}}});
    const weekRows=[];
    for(const [start,price] of [['2026-08-31',100],['2026-09-07',90],['2026-09-14',80],['2026-09-21',110],['2026-09-28',110]] as const){
      for(let i=0;i<5;i++){
        const date=new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);
        weekRows.push(candle('NSE:4',date,price));
      }
    }
    await storedCandles.insertMany(weekRows);
    const weekly={...strategy,entry:{...rule('BUY',0),groups:[{logic:'AND',conditions:[{left:'ema',leftPeriod:2,leftFrame:'1w',operator:'crossAbove',rightType:'indicator',right:'ema',rightPeriod:3,rightFrame:'1w'}]}]},exit:{...rule('SELL',0),enabled:false,groups:[]},risk:{...strategy.risk,stopMode:'candleLow' as const}};
    for(const mode of ['automatic','confirmation','signals'] as const){
      const id='weekly-'+mode;
      await PaperSessionModel.create({_id:id,strategyId:id,strategy:weekly,ids:['NSE:4'],mode,cashPaise:10000000,initialPaise:10000000,entriesPaused:false,active:true,createdAt:'2026-09-28T03:30:00Z',revision:1});
    }
    await evaluatePaperStrategies(at('2026-09-28','16:00:00'));
    assert.equal(await PaperEntryEventModel.countDocuments({sessionId:/weekly-/}),3,JSON.stringify(await PaperSessionModel.find({active:true}).select('message').lean()));
    const frozen=await PaperOrderModel.findOne({sessionId:'weekly-automatic'}).lean();
    assert.equal(frozen?.signalLow,109);
    assert.equal(await PaperSignalModel.countDocuments({sessionId:/weekly-/}),3);
    // Cancelling/declining an entry and losing short-lived evaluation records
    // cannot make the same weekly event trade again after a worker restart.
    await PaperOrderModel.updateMany({sessionId:/weekly-/},{$set:{status:'cancelled'}});
    await PaperEvaluationModel.deleteMany({_id:/weekly-/});
    await evaluatePaperStrategies(at('2026-09-29','16:00:00'));
    assert.equal(await PaperSignalModel.countDocuments({sessionId:/weekly-/}),3);
    assert.equal(await PaperOrderModel.countDocuments({sessionId:/weekly-/}),2);
    const observation=await PaperObservationModel.findOne({sessionId:'weekly-automatic'}).lean();
    assert.equal(observation?.entry.matched,false);
    assert.match(observation?.entry.checks[0].reason??'',/already triggered/);
    assert.equal(observation?.exit.disabled,true);

    // A protective/manual round trip may complete while an engine call is pending.
    await PaperSessionModel.updateMany({},{$set:{active:false}});
    await PaperSessionModel.create({_id:'replacement-race',strategyId:'replacement-race',strategy,ids:['NSE:1'],mode:'automatic',cashPaise:9900000,initialPaise:10000000,entriesPaused:false,active:true,createdAt:'2026-09-25T03:30:00Z',revision:1});
    await PaperPositionModel.create({_id:'replacement-race:NSE:1',sessionId:'replacement-race',instrumentId:'NSE:1',symbol:'FIXTURE',quantity:10,entryPaise:10000,costPaise:100000,stopPaise:9000,targetPaise:15000,openedAt:'2026-09-25T04:00:00Z'});
    mock.method(engineClient,'post',async()=>{
      await PaperPositionModel.updateOne({_id:'replacement-race:NSE:1'},{$set:{openedAt:'2026-09-29T03:48:00Z'}});
      return {data:{results:[{id:'NSE:1',barEnd:'2026-09-28T10:00:00Z',referencePrice:120,atr:2,entry:{matched:false,checks:[]},exit:{matched:true,checks:[]}}]}};
    });
    await evaluatePaperStrategies(at('2026-09-29','09:20:00'));
    assert.equal(await PaperOrderModel.countDocuments({sessionId:'replacement-race'}),0,'A sell result from the former holding must not close its replacement');
    mock.restoreAll();
    await PaperSessionModel.updateMany({},{$set:{active:false}});
    await PaperSessionModel.create({_id:'capacity',strategyId:'capacity',strategy:{...strategy,risk:{...strategy.risk,maxPositions:1}},ids:['NSE:3','NSE:2'],mode:'automatic',cashPaise:10000000,initialPaise:10000000,entriesPaused:false,active:true,createdAt:'2026-09-25T03:30:00Z',revision:1});
    await evaluatePaperStrategies(at('2026-09-25','16:00:00'));
    assert.equal(await PaperSignalModel.countDocuments({sessionId:'capacity'}),2,'Both matching signals remain visible');
    assert.equal(await PaperOrderModel.countDocuments({sessionId:'capacity'}),1,'Pending buys reserve the available position slot');
    assert.equal((await PaperOrderModel.findOne({sessionId:'capacity'}))?.instrumentId,'NSE:2','Deterministic instrument order, independent of scope order');
    assert.match((await PaperSignalModel.findOne({sessionId:'capacity',instrumentId:'NSE:3'}))?.message??'',/position slots/);
  } finally {
    mock.restoreAll();
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await disconnectDatabase(); await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit();
  }
});
