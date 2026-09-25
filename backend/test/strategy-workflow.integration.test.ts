import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/shared/database.js';
import { jobs, redis } from '../src/shared/redis.js';
import { InstrumentModel } from '../src/modules/market-data/models/market-data.model.js';
import { MonthlyUniverseModel, UniverseSnapshotModel } from '../src/modules/qualification/models/qualification.model.js';
import { currentMonth } from '../src/modules/qualification/services/universe.service.js';
import { backtestUniverseOptions } from '../src/modules/backtesting/services/universe.service.js';
import { queueBacktest } from '../src/modules/backtesting/services/backtest.service.js';
import { BacktestRunModel } from '../src/modules/backtesting/models/backtest.model.js';
import { StrategyModel } from '../src/modules/strategies/models/strategy.model.js';
import { researchPresets } from '../src/modules/strategies/config/research-presets.js';
import { createPaperSession } from '../src/modules/paper-trading/services/paper.service.js';
import { PaperSessionModel } from '../src/modules/paper-trading/models/paper.model.js';

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
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await disconnectDatabase(); await jobs.close(); if (redis.status !== 'end') await redis.quit();
  }
});
