import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { jobs, redis } from '../src/shared/redis.js';
import { AppError } from '../src/shared/errors.js';
import { CandleModel } from '../src/modules/market-data/models/market-data.model.js';
import { stockHistory } from '../src/modules/stock-details/services/history.service.js';
import { indianDate } from '../src/modules/stock-details/utils/chart-bars.js';
import type { Instrument } from '../src/modules/market-data/types.js';

after(async () => { await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit(); });

test('recent chart candles load before older history and remain available when the older extension fails', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  const stock: Instrument = { _id: `NSE:${name}`, securityId: '1', exchange: 'NSE', isin: 'INE000A01001', symbol: 'TEST', name: 'Test', series: 'EQ', active: true, primary: true, lotSize: 1, observedAt: new Date().toISOString() };
  const calls: { from: string; to: string }[] = [];
  const yesterday = indianDate(Date.now() - 86400000), time = `${yesterday}T03:45:00.000Z`;
  try {
    await mongoose.connect(uri.toString());
    const result = await stockHistory(stock, '1d', { daily: async (_stock, from, to) => {
      calls.push({ from, to });
      if (calls.length === 2) throw new AppError(502, 'DHAN_HISTORY_UNAVAILABLE', 'Older candles unavailable');
      await CandleModel.create({ instrumentId: stock._id, interval: '1d', time, open: 100, high: 110, low: 95, close: 105, volume: 1000, source: 'dhan', observedAt: new Date().toISOString() });
      return true;
    }, intraday: async () => { throw new Error('Daily charts must not use the intraday endpoint'); } });
    assert.equal(calls.length, 2);
    assert.ok(Date.parse(calls[0].to) - Date.parse(calls[0].from) <= 31 * 86400000);
    assert.ok(calls[1].from < calls[0].from);
    assert.equal(result.bars.at(-1)?.time, yesterday);
    assert.equal(result.latestCandleAt, time);
    assert.equal(result.message, 'Older candles unavailable');
    assert.equal(await redis.exists(`quantforge:research:history:${stock._id}:1d:${indianDate(Date.now())}`), 0, 'A partial refresh must remain retryable');
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
