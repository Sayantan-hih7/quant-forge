import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capRanks, MIN_RANKED_COMPANIES, returnCorrelation, selectRelatedStocks, type RelatedListing } from '../src/modules/stock-details/utils/related-stocks.js';
import type { Fact, FactValue } from '../src/modules/market-data/types.js';

const listing = (id: number, extra: Partial<RelatedListing> = {}): RelatedListing => ({ _id: `NSE:${id}`, symbol: `STOCK${id}`, name: `Company ${id}`, exchange: 'NSE', isin: `ISIN${id}`, primary: true, series: 'EQ', active: true, ...extra });
const facts = (stock: RelatedListing, values: Record<string, FactValue | undefined>): Fact[] => Object.entries(values).filter(([, value]) => value !== undefined).map(([field, value]) => ({
  _id: `${stock._id}:${field}`, instrumentId: stock._id, field, value: value!, knownAt: '2026-09-30T00:00:00Z', observedAt: '2026-09-29T00:00:00Z', source: 'fixture', sourceUrl: '', basis: 'observed-snapshot',
}));
const lens = (result: ReturnType<typeof selectRelatedStocks>, key: string) => result.lenses.find(row => row.key === key)!;

test('closest peers respect exchange/self/duplicate rules and rank industry, size and profile together', () => {
  const current = listing(1), twin = listing(2), sameIndustryFar = listing(3), sectorOnly = listing(4), unknown = listing(5), banking = listing(6);
  const inactive = listing(7, { active: false }), sameIsin = listing(8, { isin: current.isin }), duplicate = listing(9, { isin: twin.isin, primary: false, series: 'BE' }), bse = listing(10, { _id: 'BSE:10', exchange: 'BSE' });
  const rows = [current, twin, sameIndustryFar, sectorOnly, unknown, banking, inactive, sameIsin, duplicate, bse];
  const base = { sector: 'Technology', industry: 'Software', marketCap: 100, pe: 20, roce: 20, debtEquity: 0.05, index: ['nifty-it'] };
  const values = [
    ...facts(current, base), ...facts(twin, { ...base, marketCap: 110, pe: 22 }), ...facts(sameIndustryFar, { ...base, marketCap: 3000, pe: 60, roce: 5, debtEquity: 1.5, index: [] }),
    ...facts(sectorOnly, { ...base, industry: 'IT Services', marketCap: 120 }), ...facts(unknown, { sector: 'Technology' }), ...facts(banking, { ...base, sector: 'Banking', industry: 'Private Bank' }),
    ...[inactive, sameIsin, duplicate, bse].flatMap(stock => facts(stock, base)),
  ];
  const result = selectRelatedStocks({ current, currentFacts: facts(current, { ...base, sector: ' Technology ' }), stocks: rows, facts: values });
  const peers = lens(result, 'peers').items;
  assert.deepEqual(peers.map(row => row._id), [twin._id, sectorOnly._id, sameIndustryFar._id, unknown._id]);
  assert.equal(peers[0].strength, 'close');
  assert.ok(peers[0].reasons.some(reason => reason.label === 'Same industry · Software'));
  assert.ok(peers[0].reasons.length <= 3);
  assert.equal(peers[3].marketCap, null);
  assert.equal(result.subject.sector, 'Technology');
  // A similar company from another sector belongs to the size lens, not closest peers.
  assert.deepEqual(lens(result, 'size').items.map(row => row._id), [banking._id]);
  assert.deepEqual(lens(result, 'leaders').items.map(row => row._id), [sameIndustryFar._id, sectorOnly._id, twin._id]);
  assert.equal(lens(result, 'leaders').items[0].reasons[0].label, '#1 in sector by market cap');
  assert.equal(result.subject.sectorRank, 4);
});

test('missing sector does not fabricate peers; missing cap disables size comparison; lists cap at twelve', () => {
  const current = listing(1), rows = Array.from({ length: 20 }, (_, i) => listing(i + 2));
  const values = rows.flatMap(stock => facts(stock, { sector: 'Banking', marketCap: 100 }));
  for (const sector of ['', 'Unknown', 'Others', 'N/A']) {
    const result = selectRelatedStocks({ current, currentFacts: facts(current, { sector, marketCap: 100 }), stocks: rows, facts: values });
    assert.equal(lens(result, 'peers').items.length, 0);
    assert.match(lens(result, 'peers').message!, /reported sector/);
    assert.equal(lens(result, 'leaders').items.length, 0);
  }
  const result = selectRelatedStocks({ current, currentFacts: facts(current, { sector: 'Banking' }), stocks: rows, facts: values });
  assert.equal(lens(result, 'peers').items.length, 12);
  assert.equal(lens(result, 'size').items.length, 0);
  assert.match(lens(result, 'size').message!, /saved market cap/);
});

test('cap bands follow SEBI/AMFI rank cut-offs, one cap per company, only with enough coverage', () => {
  const stocks = Array.from({ length: MIN_RANKED_COMPANIES + 50 }, (_, i) => listing(i + 1));
  const caps = new Map(stocks.map((stock, i) => [stock._id, 1_000_000 - i]));
  stocks.push(listing(99_999, { isin: stocks[0].isin, exchange: 'BSE', _id: 'BSE:1' })); caps.set('BSE:1', 1_000_000);
  const ranks = capRanks(stocks, caps);
  assert.equal(ranks.of, MIN_RANKED_COMPANIES + 50);
  assert.deepEqual([1, 100, 101, 250, 251, 500, 501].map(rank => ranks.band(1_000_000 - (rank - 1))?.key), ['large', 'large', 'mid', 'mid', 'small', 'small', 'micro']);
  assert.equal(ranks.band(1_000_000 - 99)?.rank, 100);
  assert.equal(ranks.band(null), null);
  assert.equal(capRanks(stocks.slice(0, 100), caps).band(1_000_000), null);
});

test('return correlation uses shared sessions and needs enough history', () => {
  const days = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
  const wave = days.map((_, i) => 100 * Math.exp(0.01 * Math.sin(i * 1.7) + 0.002 * i));
  const a = new Map(days.map((day, i) => [day, wave[i]])), b = new Map(days.map((day, i) => [day, wave[i] * 3]));
  const inverse = new Map(days.map((day, i) => [day, 10_000 / wave[i]]));
  assert.equal(returnCorrelation(a, b), 1);
  assert.equal(returnCorrelation(a, inverse), -1);
  assert.equal(returnCorrelation(a, new Map([...b].slice(0, 30))), null);
});
