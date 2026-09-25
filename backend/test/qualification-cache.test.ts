import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { jobs, redis } from '../src/shared/redis.js';
import { missingHistoryRanges } from '../src/modules/market-data/services/history-coverage.js';
import { ensureMonthlyHistory, reuseCompanySnapshot } from '../src/modules/market-data/services/dhan-cache.service.js';
import { DatasetReceiptModel } from '../src/modules/market-data/models/dataset-receipt.model.js';
import { storedCandles } from '../src/modules/market-data/repository.js';
import type { Instrument } from '../src/modules/market-data/types.js';

after(async () => { await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit(); });

test('history coverage merges adjacent/overlapping imports and fetches only missing dates', () => {
  const from = '2021-06-01', to = '2026-10-01';
  assert.deepEqual(missingHistoryRanges(from, to, [
    { from: '2021-01-01', to: '2024-01-01' }, { from: '2024-01-01', to: '2026-09-01' },
  ]), [{ from: '2026-09-01', to }]);
  assert.deepEqual(missingHistoryRanges(from, to, [
    { from: '2022-01-01', to: '2023-01-01' }, { from: '2022-06-01', to: '2024-01-01' },
    { from: '2025-01-01', to: '2027-01-01' },
  ]), [{ from, to: '2022-01-01' }, { from: '2024-01-01', to: '2025-01-01' }]);
  assert.deepEqual(missingHistoryRanges(from, to, [{ from, to }]), []);
});

test('successful snapshots suppress repeated missing-metric requests but refresh expired facts', () => {
  const now = Date.parse('2026-09-25'), receipt = { checkedAt: '2026-09-23', fields: ['marketCap', 'roce'] };
  assert.equal(reuseCompanySnapshot(receipt, ['marketCap', 'roe'], ['marketCap'], now), true);
  assert.equal(reuseCompanySnapshot(receipt, ['marketCap', 'roe'], [], now), false);
  assert.equal(reuseCompanySnapshot({ ...receipt, checkedAt: '2026-09-17' }, ['roe'], [], now), false);
  assert.equal(reuseCompanySnapshot(null, ['roe'], [], now), false);
  assert.equal(reuseCompanySnapshot(null, ['marketCap'], ['marketCap'], now), true);
});

test('incremental downloads persist successful gaps, resume after failure and do not invent IPO history', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`;
  const uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  const stock: Instrument = { _id: 'NSE:1', securityId: '1', exchange: 'NSE', isin: 'INE000A01001', symbol: 'IPO', name: 'Fixture IPO', series: 'EQ', active: true, primary: true, lotSize: 1, observedAt: '2026-09-01' };
  const payload = { timestamp: [Date.parse('2026-08-31T03:45Z') / 1000], open: [100], high: [110], low: [90], close: [105], volume: [1000] };
  try {
    await mongoose.connect(uri.toString()); assert.equal(mongoose.connection.name, name);
    await DatasetReceiptModel.create({ _id: 'middle', instrumentId: stock._id, kind: 'daily', from: '2024-01-01', to: '2026-01-01', checkedAt: '2026-09-01', records: 0 });
    const requests: { fromDate: string; toDate: string }[] = [];
    let fail = true;
    const request = async (_path: string, body?: unknown) => {
      const range = body as { fromDate: string; toDate: string }; requests.push(range);
      if (range.fromDate === '2026-01-01' && fail) throw new Error('Provider unavailable');
      return range.fromDate === '2021-06-01' ? { timestamp: [], open: [], high: [], low: [], close: [], volume: [] } : payload;
    };
    await assert.rejects(ensureMonthlyHistory(stock, '2021-06-01', '2026-09-01', {}, request), /Provider unavailable/);
    assert.equal(await DatasetReceiptModel.countDocuments(), 2);
    fail = false;
    assert.equal(await ensureMonthlyHistory(stock, '2021-06-01', '2026-09-01', {}, request), true);
    assert.deepEqual(requests.map(x => x.fromDate), ['2021-06-01', '2026-01-01', '2026-01-01']);
    assert.equal(await storedCandles.countDocuments(), 1);
    assert.equal(await ensureMonthlyHistory(stock, '2021-06-01', '2026-09-01', {}, request), false);
    assert.equal(requests.length, 3);

    // A chart can ask for years before this listing's first available candle.
    // Its prefix request must overlap verified history, not retry an empty
    // pre-listing interval forever or overwrite the saved overlap candle.
    const prefixRequests: { fromDate: string; toDate: string }[] = [];
    const prefixRequest = async (_path: string, body?: unknown) => {
      const range = body as { fromDate: string; toDate: string }; prefixRequests.push(range);
      assert.equal(range.toDate, '2026-09-01');
      return payload;
    };
    assert.equal(await ensureMonthlyHistory(stock, '2020-01-01', '2026-09-01', {}, prefixRequest), true);
    assert.deepEqual(prefixRequests, [{ securityId: '1', exchangeSegment: 'NSE_EQ', instrument: 'EQUITY', oi: false, expiryCode: 0, fromDate: '2020-01-01', toDate: '2026-09-01' }]);
    const prefix = await DatasetReceiptModel.findOne({ instrumentId: stock._id, from: '2020-01-01' }).lean();
    assert.equal(prefix?.to, '2021-06-01'); assert.equal(prefix?.records, 0);
    assert.equal(await storedCandles.countDocuments(), 1);
    assert.equal(await ensureMonthlyHistory(stock, '2020-01-01', '2026-09-01', {}, prefixRequest), false);
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
