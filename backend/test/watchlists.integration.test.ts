import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { InstrumentModel } from '../src/modules/market-data/models/market-data.model.js';
import { MonthlyUniverseModel } from '../src/modules/qualification/models/qualification.model.js';
import { WatchlistModel } from '../src/modules/watchlists/models/watchlist.model.js';
import { addWatchlistStock, browseStocks, getWatchlist, listWatchlists, personalWatchlist, removeWatchlistStock } from '../src/modules/watchlists/services/watchlist.service.js';

test('one watchlist merges legacy lists once without losing stocks, and never changes qualification', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  try {
    await mongoose.connect(uri.toString());
    await InstrumentModel.insertMany(Array.from({ length: 45 }, (_, i) => ({ _id: `${i % 2 ? 'BSE' : 'NSE'}:${i}`, exchange: i % 2 ? 'BSE' : 'NSE', securityId: String(i), isin: `TEST${i}`, symbol: `STOCK${String(i).padStart(2, '0')}`, name: i === 2 ? 'Dot.* company' : `Company ${i}`, active: i !== 44 })));
    await MonthlyUniverseModel.create({ _id: '2026-09', members: [{ instrumentId: 'NSE:0', isin: 'TEST0', source: 'scan' }] });
    const before = JSON.stringify(await MonthlyUniverseModel.find().lean());
    await WatchlistModel.insertMany([
      { _id: 'old-a', name: 'Research', ids: ['NSE:0', 'NSE:2'], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { _id: 'old-b', name: 'Swing', ids: ['NSE:2', 'BSE:3', 'NSE:44'], createdAt: '2026-01-02', updatedAt: '2026-01-02' },
    ]);
    const initialized = await Promise.all([personalWatchlist(), personalWatchlist()]);
    assert.equal(initialized[0]._id, 'personal'); assert.equal(initialized[1]._id, 'personal');
    assert.deepEqual(initialized[0].ids, ['NSE:0', 'NSE:2', 'BSE:3', 'NSE:44']);
    const state = await listWatchlists(); assert.equal(state.lists.length, 1); assert.equal(state.universeCount, 44);
    assert.equal(await WatchlistModel.countDocuments({ archivedAt: { $exists: true } }), 2);
    assert.equal((await WatchlistModel.findById('old-a').lean())?.name, 'Research', 'Archive preserves original data');
    const second = await browseStocks({ pageSize: 10, page: 2 });
    assert.equal(second.total, 44); assert.equal(second.items[0].symbol, 'STOCK10');
    assert.equal((await browseStocks({ q: '.*' })).total, 1, 'Search is literal, not a regex');
    assert.equal((await browseStocks({ listId: 'old-a' })).total, 4, 'Old bookmarks open the merged list');
    assert.equal((await browseStocks({ listId: 'personal' })).items.find(s => s._id === 'NSE:44')?.active, false);
    await Promise.all([addWatchlistStock('personal', 'NSE:2'), addWatchlistStock('personal', 'BSE:5'), addWatchlistStock('personal', 'BSE:5')]);
    assert.equal((await getWatchlist('personal')).ids.length, 5);
    await assert.rejects(addWatchlistStock('personal', 'NSE:44'), /active cash stock/);
    await assert.rejects(getWatchlist('missing'), /not found/);
    await removeWatchlistStock('personal', 'NSE:2');
    assert.equal((await listWatchlists()).lists[0].ids.includes('NSE:2'), false, 'Removed legacy stocks are not reimported');
    await removeWatchlistStock('old-b', 'NSE:44');
    assert.equal((await personalWatchlist()).ids.includes('NSE:44'), false, 'Inactive stocks can be removed');
    assert.equal((await browseStocks({ listId: 'personal', page: 999 })).page, 1, 'Pages clamp after removal');
    await assert.rejects(browseStocks({ pageSize: 6000 }), /Invalid/);
    assert.equal(JSON.stringify(await MonthlyUniverseModel.find().lean()), before);
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
