import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/shared/database.js';
import { jobs, redis } from '../src/shared/redis.js';
after(async () => { if (process.env.RUN_DB_TESTS !== '1') { await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit(); } });
import { InstrumentModel } from '../src/modules/market-data/models/market-data.model.js';
import { MonthlyUniverseModel, UniverseSnapshotModel } from '../src/modules/qualification/models/qualification.model.js';
import { currentMonth } from '../src/modules/qualification/services/universe.service.js';
import { backtestUniverseOptions } from '../src/modules/backtesting/services/universe.service.js';
import { queueBacktest } from '../src/modules/backtesting/services/backtest.service.js';
import { BacktestRunModel } from '../src/modules/backtesting/models/backtest.model.js';
import { StrategyModel, StrategyRevisionModel } from '../src/modules/strategies/models/strategy.model.js';
import { strategyHistory } from '../src/modules/strategies/services/strategy-history.service.js';
import { researchPresets } from '../src/modules/strategies/config/research-presets.js';
import { createPaperSession } from '../src/modules/paper-trading/services/paper.service.js';
import { PaperSessionModel } from '../src/modules/paper-trading/models/paper.model.js';
import { saveStrategy, archiveStrategy, restoreStrategy } from '../src/modules/strategies/services/strategy.service.js';
import { riskSchema } from '../src/modules/strategies/validations/strategy.validation.js';

test('stock scopes match current/manual/historical eligibility, and stale strategy handoffs cannot start work', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = '/' + name; env.MONGODB_URI = uri.toString();
  try {
    await connectDatabase(); assert.equal(mongoose.connection.name, name);
    await InstrumentModel.create([1, 2, 3].map(n => ({ _id: `NSE:${n}`, exchange: 'NSE' as const, securityId: String(n), isin: `INE000A0100${n}`, symbol: `TEST${n}` })));
    const member = (id: number, source: 'scan' | 'manual' = 'scan') => ({ instrumentId: `NSE:${id}`, source, isin: `INE000A0100${id}`, addedAt: '2025-01-01T00:00:00.000Z' });
    await MonthlyUniverseModel.create({ _id: currentMonth(), month: currentMonth(), members: [member(1), member(2, 'manual')], publishedAt: '2026-09-01T00:00:00.000Z' });
    await UniverseSnapshotModel.create([
      { _id: 'old', month: '2025-01', members: [member(3)], publishedAt: '2025-01-02T00:00:00.000Z' },
      { _id: 'later', month: '2025-01', members: [member(2)], publishedAt: '2025-01-25T00:00:00.000Z' },
    ]);
    assert.deepEqual((await backtestUniverseOptions({ universe: 'current', includeManual: 'false' })).stocks.map(s => s._id), ['NSE:1']);
    const manual = await backtestUniverseOptions({ universe: 'current', includeManual: 'true' });
    assert.deepEqual(manual.stocks.map(s => [s._id, s.source]), [['NSE:1', 'scan'], ['NSE:2', 'manual']]);
    assert.deepEqual((await backtestUniverseOptions({ universe: 'historical', includeManual: 'false', from: '2025-01-01', to: '2025-01-20' })).stocks.map(s => s._id), ['NSE:3']);
    assert.equal((await backtestUniverseOptions({ universe: 'historical', includeManual: 'true', from: '2024-01-01', to: '2024-01-20' })).stocks.length, 0);
    await assert.rejects(backtestUniverseOptions({ universe: 'historical', includeManual: 'false' }));
    const id = randomUUID(), draft = researchPresets.find(p => p.draft.entry.horizon === 'swing')!.draft;
    await StrategyModel.create({ ...draft, _id: id, revision: 2, savedAt: new Date().toISOString() });
    const input = { strategyId: id, expectedRevision: 1, from: '2025-01-01', to: '2025-01-20', universe: 'current', includeManual: false, acknowledgeSelectionBias: true, ids: ['NSE:1'] };
    await assert.rejects(queueBacktest(input), /strategy changed/i);
    await assert.rejects(queueBacktest({ ...input, expectedRevision: 2, ids: ['NSE:2'] }), /requested qualified universe/i);
    await assert.rejects(createPaperSession({ strategyId: id, expectedRevision: 1, ids: ['NSE:1'], mode: 'confirmation' }), /strategy changed/i);
    assert.equal(await BacktestRunModel.countDocuments(), 0);
    assert.equal(await PaperSessionModel.countDocuments(), 0);
    const incompleteId=randomUUID();
    await BacktestRunModel.create({_id:incompleteId,strategy:{...draft,_id:id,revision:2},status:'completed',config:{ids:['NSE:1']},result:{historyQuality:{missingMinutes:1}}});
    await assert.rejects(createPaperSession({strategyId:id,expectedRevision:2,ids:['NSE:1'],mode:'confirmation',sourceBacktestId:incompleteId}),/unresolved data gaps/);
    assert.equal(await PaperSessionModel.countDocuments(),0,'Incomplete report cannot start paper monitoring');
    await BacktestRunModel.deleteOne({_id:incompleteId});
    const protectedDraft={...draft,exit:{...draft.exit,enabled:false,groups:[]},risk:riskSchema.parse({...draft.risk,stopMode:'candleLow',breakevenAfterTarget1:false,stopManagement:undefined,exitTargets:[
      {basis:'risk',value:2,closePercent:40,moveStopTo:0},
      {basis:'risk',value:5,closePercent:30,moveStopTo:1},
      {basis:'risk',value:8,closePercent:30},
    ]})};
    const saved=await saveStrategy(id,protectedDraft,2);
    assert.equal(saved.revision,3);
    const history=await strategyHistory(id);
    assert.deepEqual(history.revisions.map(r=>r.strategy.revision),[3,2]);
    assert.deepEqual(history.missingRanges,['1']);
    assert.deepEqual(history.revisions[1].strategy.risk,draft.risk,'Saving preserves the original legacy definition before updating');
    await assert.rejects(saveStrategy(id,protectedDraft,2),/changed elsewhere/);
    assert.equal(await StrategyRevisionModel.countDocuments(),2,'Stale saves cannot add or replace history');
    const loaded=await StrategyModel.findById(id).lean();
    assert.equal(loaded?.exit.enabled,false);
    assert.deepEqual(loaded?.exit.groups,[]);
    assert.deepEqual(loaded?.risk.exitTargets,protectedDraft.risk.exitTargets);
    await assert.rejects(saveStrategy(id,{...protectedDraft,entry:{...draft.entry,enabled:false}},3),/Buy conditions cannot be disabled/);
    const contradictory={...protectedDraft,entry:{...draft.entry,groups:[{logic:'AND',conditions:[70,30].map((value,index)=>({left:'rsi',leftFrame:'1d',operator:index===0?'gt':'lt',rightType:'value',right:'ema20',rightFrame:'1d',value,multiplier:1,tolerance:2}))}]}};
    await assert.rejects(saveStrategy(id,contradictory,3),/Buy rules cannot match/);
    assert.equal((await StrategyModel.findById(id).lean())?.revision,3,'Contradictory saves do not alter the saved revision');
    assert.equal(await PaperSessionModel.countDocuments(),0,'Saving does not start paper execution');
    await assert.rejects(saveStrategy(randomUUID(),protectedDraft,0),/already exists for this holding period/);
    const monitoringId=randomUUID();
    await PaperSessionModel.create({_id:monitoringId,strategyId:id,strategy:(await StrategyModel.findById(id).lean())!,active:true,revision:1});
    await assert.rejects(archiveStrategy(id,3),/Stop monitoring/);
    await PaperSessionModel.updateOne({_id:monitoringId},{$set:{active:false}});
    const archived=await archiveStrategy(id,3);assert.ok(archived.archivedAt);
    assert.equal((await strategyHistory(id)).revisions.find(r=>r.strategy.revision===3)?.inconsistent,false,'Lifecycle metadata must not change the recorded rule definition');
    assert.equal((await StrategyRevisionModel.findById(`${id}:3`))?.archivedAt,undefined);
    await assert.rejects(saveStrategy(id,protectedDraft,3),/read-only/);
    await assert.rejects(createPaperSession({strategyId:id,expectedRevision:3,ids:['NSE:1'],mode:'signals'}),/Archived strategies/);
    const replacement=await saveStrategy(randomUUID(),protectedDraft,0);assert.equal(replacement.revision,1);
    assert.equal(await StrategyModel.countDocuments({'entry.horizon':protectedDraft.entry.horizon,archivedAt:{$exists:false}}),1);
    assert.ok(await StrategyModel.findById(id),'Archived plan remains available to historical reports');
    await assert.rejects(restoreStrategy(id, 3, archived.archivedAt), /already occupies/);
    await archiveStrategy(replacement._id, 1);
    await assert.rejects(restoreStrategy(id, 2, archived.archivedAt), /changed or was already restored/);
    await assert.rejects(restoreStrategy(id, 3, '2000-01-01T00:00:00.000Z'), /changed or was already restored/);
    const revisionsBefore = await StrategyRevisionModel.countDocuments();
    const attempts = await Promise.allSettled([
      restoreStrategy(id, 3, archived.archivedAt),
      saveStrategy(randomUUID(), protectedDraft, 0),
    ]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1, 'Concurrent restore/create can only occupy one slot');
    if (attempts[0].status === 'rejected') {
      const winner = await StrategyModel.findOne({ 'entry.horizon': protectedDraft.entry.horizon, archivedAt: { $exists: false } }).lean();
      await archiveStrategy(winner!._id, winner!.revision);
      await restoreStrategy(id, 3, archived.archivedAt);
    }
    const restored = await StrategyModel.findById(id).lean();
    assert.equal(restored?.archivedAt, undefined);
    assert.equal(restored?.revision, 3);
    assert.equal(restored?.savedAt, saved.savedAt);
    assert.deepEqual(restored?.entry, loaded?.entry);
    assert.deepEqual(restored?.risk, loaded?.risk);
    assert.equal(await StrategyRevisionModel.countDocuments(), revisionsBefore + (attempts[1].status === 'fulfilled' ? 1 : 0), 'Restore does not create rule revisions');
    assert.equal((await PaperSessionModel.findById(monitoringId).lean())?.active, false, 'Restore never restarts monitoring');
    assert.equal(await PaperSessionModel.countDocuments(), 1, 'Restore creates no new session');
    assert.equal((await strategyHistory(id)).revisions.find(r => r.strategy.revision === 3)?.inconsistent, false);
    await assert.rejects(restoreStrategy(id, 3, archived.archivedAt), /changed or was already restored/);


  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await disconnectDatabase(); await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit();
  }
});
