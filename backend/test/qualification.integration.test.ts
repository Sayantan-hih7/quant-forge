import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/shared/database.js';
import { jobs, redis } from '../src/shared/redis.js';
import { instruments } from '../src/modules/market-data/repository.js';
import { MonthlyRuleModel, MonthlyUniverseModel, UniverseSnapshotModel, QualificationResultModel, QualificationRunModel } from '../src/modules/qualification/models/qualification.model.js';
import { publishQualification } from '../src/modules/qualification/services/qualification.service.js';
import { currentMonth, addManualStock, removeManualStocks } from '../src/modules/qualification/services/universe.service.js';

test('qualification publication, manual edits and concurrent changes are atomic and isolated', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`;
  const uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`; env.MONGODB_URI = uri.toString();
  try {
    await connectDatabase();
    assert.equal(mongoose.connection.name, name);
    const at = new Date().toISOString(), month = currentMonth(), runId = randomUUID();
    await instruments.insertMany([
      { _id: 'NSE:1', exchange: 'NSE', securityId: '1', isin: 'INE000A01001', symbol: 'SCAN', active: true, primary: true },
      { _id: 'NSE:2', exchange: 'NSE', securityId: '2', isin: 'INE000A01002', symbol: 'MANUAL', active: true, primary: true },
      { _id: 'BSE:2', exchange: 'BSE', securityId: '2', isin: 'INE000A01002', symbol: 'MANUAL', active: true, primary: false },
    ]);
    await MonthlyRuleModel.create({ _id: 'monthly', fingerprint: 'fixture', revision: 1, rule: {}, savedAt: at });
    await QualificationRunModel.create({ _id: runId, month, rule: {}, revision: 1, fingerprint: 'fixture', cutoff: at, status: 'completed', ids: ['NSE:1'], total: 1, processed: 1, qualified: 1, rejected: 0, unavailable: 0 });
    await QualificationResultModel.create({ _id: `${runId}:NSE:1`, runId, instrumentId: 'NSE:1', matched: true, status: 'qualified', checks: [] });
    await publishQualification(runId, false);
    await assert.rejects(removeManualStocks('NSE:1'), /Only manually added/);
    const concurrent = await Promise.allSettled([addManualStock('NSE:2', 'Independent research'), addManualStock('BSE:2', 'Same company, alternate listing')]);
    assert.equal(concurrent.filter(x => x.status === 'fulfilled').length, 1);
    const universe = await MonthlyUniverseModel.findById(month).lean();
    assert.equal(universe?.members.length, 2);
    assert.equal(new Set(universe?.members.map(x => x.isin)).size, 2);
    assert.equal(await UniverseSnapshotModel.countDocuments(), 2);
    await publishQualification(runId, false); // idempotent publish preserves manual edit
    assert.equal((await MonthlyUniverseModel.findById(month).lean())?.members.length, 2);
    await removeManualStocks();
    assert.equal((await MonthlyUniverseModel.findById(month).lean())?.members[0].source, 'scan');
    assert.equal(await UniverseSnapshotModel.countDocuments(), 3);
    assert.equal((await UniverseSnapshotModel.findById(`${month}:2`).lean())?.members.length, 2);
    await QualificationRunModel.create({ _id: randomUUID(), month, status: 'queued' });
    await assert.rejects(QualificationRunModel.create({ _id: randomUUID(), month, status: 'queued' }), (error: unknown) => error instanceof mongoose.mongo.MongoServerError && error.code === 11000);
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await disconnectDatabase(); await jobs.close(); await redis.quit();
  }
});

// Even skipped integration tests must release the queue connection opened by service imports.
if (process.env.RUN_DB_TESTS !== '1') { await jobs.close(); await redis.quit(); }
