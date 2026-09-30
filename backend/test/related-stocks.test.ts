import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectRelatedStocks, type RelatedListing } from '../src/modules/stock-details/utils/related-stocks.js';
import type { Fact } from '../src/modules/market-data/types.js';

const listing = (id: number, extra: Partial<RelatedListing> = {}): RelatedListing => ({ _id: `NSE:${id}`, symbol: `STOCK${id}`, name: `Company ${id}`, exchange: 'NSE', isin: `ISIN${id}`, primary: true, series: 'EQ', active: true, ...extra });
const facts = (stock: RelatedListing, sector: string, cap?: number): Fact[] => [['sector', sector], ...(cap === undefined ? [] : [['marketCap', cap]])].map(([field, value]) => ({
  _id: `${stock._id}:${field}`, instrumentId: stock._id, field: String(field), value: value!, knownAt: '2026-09-30T00:00:00Z', observedAt: '2026-09-29T00:00:00Z', source: 'fixture', sourceUrl: '', basis: 'observed-snapshot',
}));
test('related stocks match sector/exchange, exclude self and duplicate securities, rank comparable sizes', () => {
  const current = listing(1), near = listing(2), far = listing(3), unknownCap = listing(4), other = listing(5), inactive = listing(6, { active: false });
  const sameIsin = listing(7, { isin: current.isin }), duplicate = listing(8, { isin: near.isin, primary: false, series: 'BE' }), bse = listing(9, { _id: 'BSE:9', exchange: 'BSE' });
  const rows = [current, near, far, unknownCap, other, inactive, sameIsin, duplicate, bse];
  const values = rows.flatMap(stock => facts(stock, stock === other ? 'Banking' : 'Technology', stock === near ? 90 : stock === far ? 500 : stock === unknownCap ? undefined : 100));
  const result = selectRelatedStocks(current, facts(current, ' Technology ', 100), rows, values);
  assert.deepEqual(result.items.map(row => row._id), [near._id, far._id, unknownCap._id]);
  assert.equal(result.ordering, 'similar-market-cap');
  assert.equal(result.items[2].marketCap, null);
  assert.equal(result.sector, 'Technology');
});
test('missing sector does not fabricate peers, missing cap uses alphabetical order and caps at six', () => {
  const current = listing(1), rows = Array.from({ length: 10 }, (_, i) => listing(i + 2));
  const values = rows.flatMap(stock => facts(stock, 'Banking', 100));
  for (const sector of ['', 'Unknown', 'Others', 'N/A']) assert.equal(selectRelatedStocks(current, facts(current, sector), rows, values).items.length, 0);
  const result = selectRelatedStocks(current, facts(current, 'Banking', 0), rows, values);
  assert.equal(result.items.length, 6);
  assert.equal(result.ordering, 'alphabetical');
  assert.deepEqual(result.items.map(row => row.symbol), rows.map(row => row.symbol).sort().slice(0, 6));
  assert.equal(selectRelatedStocks(current, facts(current, 'Oil'), rows, values).items.length, 0);
});
