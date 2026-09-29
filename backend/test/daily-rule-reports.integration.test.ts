import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/shared/database.js';
import { jobs, redis } from '../src/shared/redis.js';
import { instruments, deliveryDays, storedCandles } from '../src/modules/market-data/repository.js';
import { SourceArtifactModel } from '../src/modules/market-data/models/market-data.model.js';
import { ensureDailyReport, ensureRuleReports } from '../src/modules/market-data/services/daily-reports.service.js';
import { AppError } from '../src/shared/errors.js';
import { engineInstruments } from '../src/modules/engine/services/engine.service.js';

after(async () => { await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit(); });
test('turnover files are shared, reused and supplied to the engine only after knownAt', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`;
  const uri = new URL(env.MONGODB_URI); uri.pathname = '/' + name; env.MONGODB_URI = uri.toString();
  try {
    await connectDatabase(); assert.equal(mongoose.connection.name, name);
    await instruments.create([1, 2].map(n => ({ _id: `NSE:${n}`, exchange: 'NSE' as const, securityId: String(n), isin: `INE000A0100${n}`, symbol: `TEST${n}`, series: 'EQ', active: true })));
    const csv = 'SYMBOL,SERIES,DATE1,TTL_TRD_QNTY,TURNOVER_LACS,DELIV_QTY\nTEST1,EQ,25-Sep-2026,1000,2000,500\nTEST2,EQ,25-Sep-2026,2000,3000,1000';
    let downloads = 0;
    const provider = { download: async () => { downloads++; return Buffer.from(csv); } };
    await Promise.all([ensureDailyReport('NSE', '2026-09-25', provider), ensureDailyReport('NSE', '2026-09-25', provider)]);
    await ensureDailyReport('NSE', '2026-09-25', provider);
    assert.equal(downloads, 1);
    assert.equal(await deliveryDays.countDocuments(), 2);
    assert.equal(await SourceArtifactModel.countDocuments(), 1);
    const report = (await deliveryDays.findOne({ instrumentId: 'NSE:1' }).lean())!;
    assert.equal(report.turnoverCr, 20);
    assert.ok(report.knownAt >= '2026-09-25T00:00:00.000Z');
    await storedCandles.create({ instrumentId: 'NSE:1', interval: '1d', time: '2026-09-25T03:45:00.000Z', open: 100, high: 105, low: 99, close: 102, volume: 1000 });
    const plan = { dailyFrom: '2026-09-01', reportsFrom: '2026-09-01' };
    const past = await engineInstruments(['NSE:1'], '2026-09-25T10:00:00.000Z', false, plan);
    assert.equal(past[0].reports.length, 0);
    const current = await engineInstruments(['NSE:1'], new Date(Date.parse(report.knownAt) + 1000).toISOString(), false, plan);
    assert.equal(current[0].reports[0].turnoverCr, 20);
    assert.equal((await engineInstruments(['NSE:1'], new Date().toISOString(), false, { dailyFrom: '2026-09-01' }))[0].reports.length, 0);
    await instruments.create({ _id: 'BSE:3', exchange: 'BSE', securityId: '3', isin: 'INE000A01003', symbol: 'TEST3', active: true });
    await storedCandles.insertMany(['NSE:1', 'BSE:3'].map(instrumentId => ({ instrumentId, interval: '1d', time: '2026-09-24T03:45:00.000Z', open: 100, high: 105, low: 99, close: 102, volume: 1000 })));
    const calls: string[] = [];
    const summary = await ensureRuleReports(['NSE:1', 'BSE:3'], '2026-09-01', '2026-09-26T00:00:00.000Z', { ensureDailyReport: async (exchange, date) => {
      calls.push(`${exchange}:${date}`);
      if (date === '2026-09-25') throw new AppError(503, 'REPORT_UNAVAILABLE', 'Fixture report unavailable');
    } });
    assert.deepEqual(calls, ['NSE:2026-09-25', 'NSE:2026-09-24', 'BSE:2026-09-24'], 'A missing file must not prevent earlier dates or the other exchange');
    assert.deepEqual(summary, { total: 3, ready: 2, unavailable: [{ exchange: 'NSE', date: '2026-09-25', message: 'Fixture report unavailable' }] });
    await assert.rejects(ensureRuleReports(['NSE:1'], '2026-09-01', '2026-09-26', { ensureDailyReport: async () => { throw new Error('Database unavailable'); } }), /Database unavailable/);
    let badDownloads = 0;
    const badProvider = { download: async () => { badDownloads++; return Buffer.from('not a valid exchange file'); } };
    await assert.rejects(ensureDailyReport('NSE', '2026-09-22', badProvider), (error: unknown) => error instanceof AppError && error.code === 'REPORT_UNAVAILABLE');
    await assert.rejects(ensureDailyReport('NSE', '2026-09-22', badProvider), (error: unknown) => error instanceof AppError && error.code === 'REPORT_NOT_READY');
    assert.equal(badDownloads, 1, 'Provider failures should wait before another request');
    assert.equal(await SourceArtifactModel.countDocuments({ date: '2026-09-22' }), 0, 'An invalid report must not be cached as successful');
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  }
});
