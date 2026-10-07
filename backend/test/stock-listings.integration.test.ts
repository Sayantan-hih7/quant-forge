import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { jobs, maintenance, redis } from '../src/shared/redis.js';
import { FactModel, InstrumentModel } from '../src/modules/market-data/models/market-data.model.js';
import { stockListings } from '../src/modules/stock-details/services/listings.service.js';
import { stockDetail } from '../src/modules/stock-details/services/details.service.js';
import { currentMonth } from '../src/modules/qualification/services/universe.service.js';
import { MonthlyUniverseModel, QualificationResultModel, QualificationRunModel } from '../src/modules/qualification/models/qualification.model.js';
after(async () => { await jobs.waitUntilReady(); await maintenance.waitUntilReady(); await jobs.close(); await maintenance.close(); redis.disconnect(); });

test('exchange lookup matches securities by ISIN and preserves the original qualification evidence', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  try {
    await mongoose.connect(uri.toString());
    const stock = (id: string, isin: string, symbol: string, active = true, primary = false) => ({ _id: id, securityId: id.split(':')[1], exchange: id.split(':')[0], isin, symbol, name: symbol, active, primary, series: 'EQ' });
    await InstrumentModel.insertMany([
      stock('NSE:1', 'INE000000001', 'ONE', true, true), stock('BSE:2', 'INE000000001', 'OTHER-SYMBOL'),
      stock('BSE:3', 'INE000000099', 'ONE'), // Same symbol, different security.
      stock('BSE:4', 'INE000000001', 'OLD', false),
      stock('NSE:5', 'INE000000002', 'SINGLE', true, true), stock('BSE:6', 'INE000000002', 'DELISTED', false),
      { ...stock('NSE:7', 'INE000000001', 'OTHER-SERIES'), series: 'BE' },
    ]);
    assert.deepEqual((await stockListings('NSE:1')).listings.map(row => row._id), ['NSE:1', 'BSE:2']);
    assert.deepEqual((await stockListings('BSE:2')).listings.map(row => row._id), ['NSE:1', 'BSE:2']);
    assert.equal((await stockListings('NSE:7')).listings[0]._id, 'NSE:7', 'Keep the currently viewed series');
    assert.deepEqual((await stockListings('NSE:5')).listings.map(row => row._id), ['NSE:5']);
    assert.equal((await stockListings('BSE:6')).instrument.active, false, 'An old listing remains identifiable');
    await assert.rejects(stockListings('NSE:999'), /Stock not found/);

    const at = new Date().toISOString(), month = currentMonth();
    await FactModel.insertMany(['NSE:1', 'BSE:2'].flatMap(id => ['marketCap', 'pe', 'sector', 'roe', 'roce'].map(field => ({
      _id: `${id}:${field}`, instrumentId: id, field, value: field === 'sector' ? 'Industrials' : 20,
      knownAt: at, observedAt: at, validUntil: '2099-01-01T00:00:00.000Z', source: 'test',
    })))); // Complete cached facts keep this test independent of broker requests.
    await QualificationRunModel.create({ _id: 'scan', month, status: 'completed', cutoff: at, rule: { conditions: ['saved NSE rule'] } });
    const checks = [{ field: 'ema', matched: true, left: 110, right: 100 }];
    await QualificationResultModel.create({ _id: 'result', runId: 'scan', instrumentId: 'NSE:1', checks });
    await MonthlyUniverseModel.create({ _id: month, month, runId: 'scan', members: [{ instrumentId: 'NSE:1', isin: 'INE000000001', source: 'scan', addedAt: at }] });
    const before = JSON.stringify(await MonthlyUniverseModel.findById(month).lean());
    const detail = await stockDetail('BSE:2');
    assert.equal(detail.instrument._id, 'BSE:2');
    assert.equal(detail.qualification?.instrumentId, 'NSE:1');
    assert.equal(detail.qualification?.exchange, 'NSE');
    assert.equal(detail.qualification?.source, 'scan');
    assert.deepEqual(detail.qualification?.checks, checks, 'Show saved NSE evidence, never imply a separate BSE scan');
    assert.equal(JSON.stringify(await MonthlyUniverseModel.findById(month).lean()), before, 'Viewing cannot change qualification');
    await MonthlyUniverseModel.updateOne({ _id: month }, { $set: { 'members.0.source': 'manual', 'members.0.note': 'Independent research' } });
    const manual = await stockDetail('BSE:2');
    assert.equal(manual.qualification?.source, 'manual');
    assert.equal(manual.qualification?.note, 'Independent research');
    assert.equal(manual.qualification?.rule, null);
    assert.deepEqual(manual.qualification?.checks, []);
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
