import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordRecentStock, type RecentStock } from '../src/modules/stock-details/store/recentStocks';
import type { StockListing } from '../src/modules/stock-details/types';

const stock = (id: number): StockListing => ({ _id: `NSE:${id}`, symbol: `STOCK${id}`, name: `Company ${id}`, exchange: 'NSE', isin: `ISIN${id}`, active: true });
test('recent viewing retains ten unique companies and reopens the last viewed exchange', () => {
  let items: RecentStock[] = [];
  for (let i = 1; i <= 12; i++) items = recordRecentStock(items, stock(i), new Date(Date.UTC(2026, 8, i)).toISOString());
  assert.equal(items.length, 10);
  assert.equal(items[0]._id, 'NSE:12'); assert.equal(items.at(-1)?._id, 'NSE:3');
  items = recordRecentStock(items, { ...stock(5), _id: 'BSE:500005', exchange: 'BSE' });
  assert.equal(items[0]._id, 'BSE:500005');
  assert.equal(items.filter(item => item.isin === 'ISIN5').length, 1);
  assert.equal(items.length, 10);
  const unchanged = recordRecentStock(items, { ...stock(1), _id: 'invalid' });
  assert.equal(unchanged, items);
});
