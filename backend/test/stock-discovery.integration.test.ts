import { after } from 'node:test';
import { maintenance } from '../src/shared/redis.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { redis, jobs } from '../src/shared/redis.js';
import { InstrumentModel, FactModel } from '../src/modules/market-data/models/market-data.model.js';
import { DiscoverySnapshotModel } from '../src/modules/stock-discovery/models/discovery.model.js';
import { discoveryCatalog, discoverStocks } from '../src/modules/stock-discovery/services/discovery.service.js';
import { tryDhanQuoteSlot, recordDhanQuoteLimit } from '../src/modules/connections/services/dhan-quote-allowance.js';
import { DhanRateLimitError } from '../src/modules/connections/providers/dhan.client.js';

test('discovery covers both exchanges, globally ranks before pagination, preserves provenance and excludes stale reports', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  try {
    await mongoose.connect(uri.toString());
    const at = new Date().toISOString();
    await DiscoverySnapshotModel.create({ _id: 'cash', attemptedAt: at, quotes: [] }); // No provider calls in tests.
    const stocks = Array.from({ length: 24 }, (_, i) => ({ _id: `TEST:${i}`, securityId: String(i), exchange: i % 2 ? 'BSE' : 'NSE', symbol: `STOCK${String(i).padStart(2, '0')}`, name: i === 2 ? 'Dot.* company' : `Company ${i}`, isin: `TEST${Math.floor(i / 2)}`, active: i !== 23 }));
    await InstrumentModel.insertMany(stocks);
    await FactModel.insertMany(stocks.flatMap((s, i) => ['marketCap', 'roe', 'debtEquity'].map(field => ({ _id: `${s._id}:${field}`, instrumentId: s._id, field, value: field === 'marketCap' ? 20000 + i * 100 : field === 'roe' ? 15 + i : 0.5, source: 'dhan-company', knownAt: at, observedAt: at, validUntil: new Date(Date.now() + (i === 22 ? -86400000 : 86400000)).toISOString(), basis: 'observed-snapshot' }))));
    const catalog = await discoveryCatalog({});
    assert.equal(catalog.refreshing, false); assert.equal(catalog.groups.find(g => g.id === 'quality')?.coverage.matched, 22);
    assert.equal(catalog.groups.find(g => g.id === 'quality')?.coverage.missing, 1);
    const first = await discoverStocks({ group: 'large', pageSize: 10 });
    const second = await discoverStocks({ group: 'large', pageSize: 10, page: 2 });
    assert.equal(first.total, 22); assert.equal(first.items[0].symbol, 'STOCK21'); assert.equal(second.items[0].symbol, 'STOCK11');
    assert.equal(second.items[0].discovery.rank, 11);
    assert.equal(first.items[0].discovery.checks[0].source, 'dhan-company');
    assert.equal((await discoverStocks({ group: 'large', exchange: 'BSE' })).total, 11);
    assert.equal((await discoverStocks({ group: 'large', q: '.*' })).items[0].symbol, 'STOCK02');
    assert.equal((await discoverStocks({ group: 'large', q: 'TEST0' })).total, 2, 'Dual listings remain distinct');
    assert.equal((await discoverStocks({ group: 'large', page: 999, pageSize: 10 })).page, 3);
    assert.equal((await discoverStocks({ group: 'large', sort: 'symbol', order: 'asc' })).items[0].symbol, 'STOCK00');
    await assert.rejects(discoverStocks({ group: 'invented' }), /supported discovery/);
    await assert.rejects(discoverStocks({ group: 'large', pageSize: 6000 }));
    assert.equal(await recordDhanQuoteLimit(new DhanRateLimitError(5000)), true);
    assert.equal(await tryDhanQuoteSlot(), false, 'Discovery and visible quotes share the provider cooldown');
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect(); await jobs.close(); redis.disconnect();
  }
});

after(async()=>{if(process.env.RUN_DB_TESTS!=='1'){await jobs.waitUntilReady();await maintenance.waitUntilReady();await jobs.close();await maintenance.close();redis.disconnect();}});
