import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { InstrumentModel } from '../src/modules/market-data/models/market-data.model.js';
import { MonthlyUniverseModel } from '../src/modules/qualification/models/qualification.model.js';
import { WatchlistModel } from '../src/modules/watchlists/models/watchlist.model.js';
import { addWatchlistStock, browseStocks, getWatchlist, listWatchlists, removeWatchlistStock, saveWatchlist } from '../src/modules/watchlists/services/watchlist.service.js';

test('watchlists browse both exchanges, persist independently, handle duplicate additions and preserve qualified stocks', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  try {
    await mongoose.connect(uri.toString());
    await InstrumentModel.insertMany(Array.from({ length: 45 }, (_, i) => ({ _id: `${i % 2 ? 'BSE' : 'NSE'}:${i}`, exchange: i % 2 ? 'BSE' : 'NSE', securityId: String(i), isin: `TEST${i}`, symbol: `STOCK${String(i).padStart(2, '0')}`, name: i === 2 ? 'Dot.* company' : `Company ${i}`, active: i !== 44 })));
    await MonthlyUniverseModel.create({ _id: '2026-09', members: [{ instrumentId: 'NSE:0', isin: 'TEST0', source: 'scan' }] });
    const before = JSON.stringify(await MonthlyUniverseModel.find().lean());
    assert.equal((await listWatchlists()).universeCount, 44);
    const second = await browseStocks({ pageSize: 10, page: 2 });
    assert.equal(second.total, 44); assert.equal(second.items.length, 10); assert.equal(second.items[0].symbol, 'STOCK10');
    const descending = await browseStocks({ pageSize: 10, page: 1, order: 'desc', exchange: 'BSE' });
    assert.equal(descending.items[0].symbol, 'STOCK43'); assert.equal(descending.total, 22);
    assert.equal((await browseStocks({ q: '.*' })).total, 1, 'search text is not interpreted as a regex');
    const list = await saveWatchlist({ name: '  Research  ' });
    assert.equal(list.name, 'Research');
    await Promise.all([addWatchlistStock(list._id, 'NSE:2'), addWatchlistStock(list._id, 'NSE:2'), addWatchlistStock(list._id, 'BSE:3')]);
    assert.equal((await getWatchlist(list._id)).ids.length, 2);
    await assert.rejects(addWatchlistStock(list._id, 'NSE:44'), /active cash stock/);
    await assert.rejects(addWatchlistStock('missing', 'NSE:2'), /no longer exists/);
    assert.equal((await browseStocks({ listId: list._id })).total, 2);
    await InstrumentModel.updateOne({ _id: 'BSE:3' }, { $set: { active: false } });
    assert.equal((await browseStocks({ listId: list._id })).items.find(s => s._id === 'BSE:3')?.active, false);
    await saveWatchlist({ name: 'Swing research' }, list._id);
    assert.equal((await getWatchlist(list._id)).name, 'Swing research');
    await removeWatchlistStock(list._id, 'BSE:3');
    assert.deepEqual((await getWatchlist(list._id)).ids, ['NSE:2']);
    await WatchlistModel.updateOne({ _id: list._id }, { $set: { ids: Array.from({ length: 500 }, (_, i) => `NSE:${i}`) } });
    await addWatchlistStock(list._id, 'NSE:2');
    await assert.rejects(addWatchlistStock(list._id, 'BSE:1'), /500 stocks/);
    await WatchlistModel.deleteOne({ _id: list._id });
    await assert.rejects(browseStocks({ listId: list._id }), /no longer exists/);
    await assert.rejects(browseStocks({ pageSize: 6000 }), /Invalid/);
    assert.equal(JSON.stringify(await MonthlyUniverseModel.find().lean()), before);
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
