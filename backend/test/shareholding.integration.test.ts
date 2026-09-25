import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { jobs, redis } from '../src/shared/redis.js';
import { ensureShareholding } from '../src/modules/market-data/services/shareholding.service.js';
import { facts, instruments } from '../src/modules/market-data/repository.js';
import { isShareholdingUrl } from '../src/modules/market-data/providers/shareholding.client.js';
import type { Instrument } from '../src/modules/market-data/types.js';

after(async () => { await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit(); });
test('filing requests restrict hosts and paths to credential-free exchange readers', () => {
  assert.equal(isShareholdingUrl('https://nsearchives.nseindia.com/corporate/xbrl/SHP_123_WEB.xml'), true);
  for (const url of ['http://127.0.0.1/admin', 'https://nsearchives.nseindia.com.evil.test/corporate/xbrl/a.xml', 'https://user:pass@nsearchives.nseindia.com/corporate/xbrl/a.xml', 'https://api.bseindia.com/private']) {
    assert.equal(isShareholdingUrl(url), false);
  }
});
test('missing per-stock pledge tries the independent BSE reader, stores provenance for both listings, and reuses success', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  try {
    await mongoose.connect(uri.toString());
    const now = new Date().toISOString(), period = now.slice(0, 7) + '-01', rawPeriod = period.replaceAll('-', '');
    const stocks: Instrument[] = [
      { _id: 'NSE:1', exchange: 'NSE', securityId: '1', isin: 'INE000A01010', symbol: 'TEST', name: 'Test Ltd', series: 'EQ', lotSize: 1, active: true, primary: true, observedAt: now },
      { _id: 'BSE:500001', exchange: 'BSE', securityId: '500001', isin: 'INE000A01010', symbol: 'TEST', name: 'Test Ltd', series: 'A', lotSize: 1, active: true, primary: false, observedAt: now },
    ];
    await instruments.insertMany(stocks);
    const calls: string[] = [];
    const request = async (url: string): Promise<unknown> => {
      calls.push(url);
      if (url.includes('nseindia')) throw new Error('NSE temporarily unavailable');
      if (url.includes('ConsolidatePledge')) return { Table: [{ Fld_ScripCode: 500001, Fld_EndDate: rawPeriod, Fld_QuarterId: 130, SHP_PulishedTime: now }] };
      return { Table: [{ Fld_AuthoriseDate: now, Fld_IsPledge: true, Fld_IsNDU: false, Fld_IsOtherEncumbrances: false }],
        Table1: [{ Fld_Code: 'STA1A2', Fld_Level: 'A=A1+A2', Fld_TotalNoOfShares: 1000, Fld_TotalencumberedNoOfShares: 60 }] };
    };
    assert.equal(await ensureShareholding(stocks[0], request), true);
    const saved = await facts.find({ field: 'pledge' }).lean();
    assert.equal(saved.length, 2); assert.ok(saved.every(row => row.value === 6 && row.period === period && row.source === 'bse-shareholding'));
    assert.ok(saved.every(row => row.ownership?.encumberedShares === 60 && row.knownAt >= now));
    const count = calls.length;
    assert.equal(await ensureShareholding(stocks[1], request), false); assert.equal(calls.length, count);
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
