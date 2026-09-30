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
import { ensureIntradayHistory } from '../src/modules/market-data/services/intraday-history.service.js';
import { DatasetReceiptModel } from '../src/modules/market-data/models/dataset-receipt.model.js';

after(async () => { await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit(); });

test('intraday history uses bounded windows and downloads only uncovered ranges after a lookback change', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  const stock: Instrument = { _id: `NSE:${name}`, securityId: '1', exchange: 'NSE', isin: 'INE000A01001', symbol: 'TEST', name: 'Test', series: 'EQ', active: true, primary: true, lotSize: 1, observedAt: new Date().toISOString() };
  const calls: { fromDate: string; toDate: string }[] = [];
  const request = async (_path: string, payload: unknown) => { calls.push(payload as typeof calls[number]); return { timestamp: [], open: [], high: [], low: [], close: [], volume: [] }; };
  try {
    await mongoose.connect(uri.toString());
    await ensureIntradayHistory(stock,'2026-03-01','2026-06-01',{},request);
    assert.ok(calls.length >= 3 && calls.length <= 4, 'Closed weekend-only windows can be skipped');
    assert.ok(calls[0].fromDate > calls.at(-1)!.fromDate, 'Download newest history first for recent listings');
    assert.ok(calls.every(c => Date.parse(c.toDate) - Date.parse(c.fromDate) <= 30 * 86400000));
    calls.length = 0;
    await ensureIntradayHistory(stock,'2026-02-23','2026-06-01',{},request);
    assert.equal(calls.length,1); assert.match(calls[0].toDate,/2026-03-01/);
    calls.length = 0;
    assert.equal(await ensureIntradayHistory(stock,'2026-02-25','2026-05-25',{},request),false);
    assert.equal(calls.length,0);
    await assert.rejects(ensureIntradayHistory(stock,'2026-02-01','2026-02-23',{},async()=>{ throw new Error('provider offline'); }),/provider offline/);
    assert.equal(await DatasetReceiptModel.countDocuments({instrumentId:stock._id,from:'2026-02-01'}),0);
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

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

test('chart aggregation omits incomplete provider buckets rather than displaying them as full candles', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  const stock: Instrument = { _id: `NSE:${name}`, securityId: '1', exchange: 'NSE', isin: 'INE000A01001', symbol: 'TEST', name: 'Test', series: 'EQ', active: true, primary: true, lotSize: 1, observedAt: new Date().toISOString() };
  const day = indianDate(Date.now() - 3 * 86400000), start = Date.parse(`${day}T03:45:00Z`);
  try {
    await mongoose.connect(uri.toString());
    const times = Array.from({length:10},(_,i)=>i).filter(i=>i!==2).map(i=>(start+i*60_000)/1000);
    const result = await stockHistory(stock,'5m',{daily:async()=>{throw new Error('Unexpected daily download');},intraday:async()=>({timestamp:times,open:times.map(()=>100),high:times.map(()=>110),low:times.map(()=>99),close:times.map(()=>105),volume:times.map(()=>10)})});
    assert.equal(result.bars.length,1);assert.equal(result.bars[0].time,new Date(start+5*60000).toISOString());
    assert.equal(result.bars[0].volume,50);assert.equal(result.incompleteBuckets,1);assert.equal(result.baseBars.length,9);
    assert.match(result.message!,/omitted/);
    await redis.del(`quantforge:research:history:${stock._id}:1m:${indianDate(Date.now())}:${result.requestedFrom}`);
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
