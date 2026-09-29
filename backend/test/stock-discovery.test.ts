import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoveryGroups } from '../src/modules/stock-discovery/config/groups.js';
import { discoveryEvidence, evaluateGroup } from '../src/modules/stock-discovery/services/evaluate.js';
import { discoverySession, snapshotDue } from '../src/modules/stock-discovery/utils/session.js';
import type { Fact, Instrument } from '../src/modules/market-data/types.js';
import type { StockQuote } from '../src/modules/stock-details/types.js';
import { enrichClosingQuotes, nsePreviousCloses } from '../src/modules/stock-discovery/providers/nse-reference.js';

const at = '2026-09-29T06:00:00.000Z';
const stock = (id: string): Instrument => ({ _id: id, symbol: id, name: id, isin: id, exchange: 'NSE', securityId: id, active: true, primary: true, series: 'EQ', lotSize: 1, observedAt: at });
const quote = (id: string, overrides: Partial<StockQuote> = {}): StockQuote => ({ instrumentId: id, price: 102, previousClose: 100, percent: 2, change: 2, volume: 1_000_000, averagePrice: 100, open: 100, high: 105, low: 99, lowerCircuit: null, upperCircuit: null, lastTradeAt: at, receivedAt: at, source: 'dhan-snapshot', ...overrides });
const fact = (field: string, value: number, overrides: Partial<Fact> = {}): Fact => ({ _id: field, instrumentId: 'A', field, value, source: 'dhan-company', sourceUrl: 'https://api.dhan.co', observedAt: at, knownAt: at, validUntil: '2026-10-01T00:00:00.000Z', basis: 'observed-snapshot', ...overrides });

test('discovery ranks the whole evaluated universe and enforces liquidity / direction boundaries', () => {
  const quotes = new Map([['A', quote('A')], ['B', quote('B', { percent: 12, price: 112 })], ['C', quote('C', { percent: 40, volume: 100 })], ['D', quote('D', { percent: -5, price: 95 })], ['E', quote('E', { percent: 0 })], ['F', quote('F', { price: 19, percent: 20 })]]);
  const stocks = [...quotes.keys()].map(stock), evidence = new Map(stocks.map(s => [s._id, discoveryEvidence(quotes.get(s._id), [], '2026-09-29', at)]));
  const gainers = evaluateGroup(discoveryGroups[0], stocks, evidence, quotes);
  assert.deepEqual(gainers.items.map(s => [s._id, s.discovery.rank]), [['B', 1], ['A', 2]]);
  assert.equal(gainers.coverage.available, 6); assert.equal(gainers.coverage.missing, 0);
  assert.deepEqual(evaluateGroup(discoveryGroups[1], stocks, evidence, quotes).items.map(s => s._id), ['D']);
  assert.deepEqual(evaluateGroup(discoveryGroups[3], stocks, evidence, quotes).items.map(s => s._id), ['B', 'A']);
  assert.equal(gainers.items[1].discovery.checks.find(c => c.field === 'turnover')?.value, 10);
});
test('missing volume, average price, trade time, stale session and future trade times never pass market filters', () => {
  for (const overrides of [{ volume: null }, { averagePrice: null }, { lastTradeAt: null }, { lastTradeAt: '2026-09-28T06:00:00.000Z' }, { lastTradeAt: '2026-09-29T07:00:00.000Z' }, { source: 'historical-close' as const }]) {
    const q = quote('A', overrides), evidence = new Map([['A', discoveryEvidence(q, [], '2026-09-29', at)]]);
    const result = evaluateGroup(discoveryGroups[0], [stock('A')], evidence, new Map([['A', q]]));
    assert.equal(result.items.length, 0); assert.equal(result.coverage.missing, 1);
  }
});
test('company groups use exact boundaries and reject expired, future, non-numeric and missing facts', () => {
  for (const [cap, id] of [[500, 'small'], [4999.9, 'small'], [5000, 'medium'], [19999.9, 'medium'], [20000, 'large']] as const) {
    const evidence = new Map([['A', discoveryEvidence(undefined, [fact('marketCap', cap)], undefined, at)]]);
    assert.equal(evaluateGroup(discoveryGroups.find(g => g.id === id)!, [stock('A')], evidence, new Map()).items.length, 1);
  }
  const base = [fact('marketCap', 2000), fact('roe', 15), fact('debtEquity', 0.5)];
  const evaluate = (facts: Fact[]) => evaluateGroup(discoveryGroups.find(g => g.id === 'quality')!, [stock('A')], new Map([['A', discoveryEvidence(undefined, facts, undefined, at)]]), new Map());
  assert.equal(evaluate(base).items.length, 1);
  assert.equal(evaluate(base.slice(0, 2)).coverage.missing, 1, 'Unknown debt must not become zero');
  assert.equal(evaluate([base[0], base[1], fact('debtEquity', -1)]).items.length, 0);
  for (const invalid of [fact('roe', 20, { validUntil: '2026-09-28T00:00:00.000Z' }), fact('roe', 20, { knownAt: '2026-09-30T00:00:00.000Z' }), fact('roe', 20, { value: '20' })]) {
    assert.equal(evaluate([base[0], invalid, base[2]]).coverage.missing, 1);
  }
});
test('market refresh pauses for weekends, holidays and closed sessions after one closing snapshot', () => {
  const friday = Date.parse('2026-10-02T12:00:00+05:30'); // Gandhi Jayanti
  assert.equal(discoverySession(friday)?.date, '2026-10-01');
  assert.equal(discoverySession(Date.parse('2026-10-04T12:00:00+05:30'))?.date, '2026-10-01');
  const saved = { _id: 'cash', quotes: [], attemptedAt: '2026-10-01T10:01:00.000Z' };
  assert.equal(snapshotDue(saved, friday), false);
  assert.equal(snapshotDue(saved, friday, true), true);
  assert.equal(snapshotDue({ ...saved, attemptedAt: '2026-10-01T09:59:00.000Z' }, friday), true, 'One final closing refresh');
  assert.equal(snapshotDue(saved, Date.parse('2026-10-05T09:14:00+05:30')), false);
  assert.equal(snapshotDue(saved, Date.parse('2026-10-05T09:15:00+05:30')), true);
  assert.equal(snapshotDue({ _id: 'cash', quotes: [], attemptedAt: at }, Date.parse(at) + 60000, true), false, 'Manual refresh respects provider cooldown');
});

test('NSE closing reference validates session and series, and corrects broker change resets without changing LTP', async () => {
  const stocks = [{ ...stock('NSE:1'), symbol: 'ONE', series: 'EQ' }, { ...stock('NSE:2'), symbol: 'ONE', series: 'BE' }];
  const csv = 'SYMBOL,SERIES,DATE1,PREV_CLOSE\nONE,EQ,29-Sep-2026,100\nONE,BE,29-Sep-2026,90';
  const refs = nsePreviousCloses(csv, '2026-09-29', stocks);
  assert.equal(refs.get('NSE:1'), 100); assert.equal(refs.get('NSE:2'), 90);
  assert.throws(() => nsePreviousCloses(csv, '2026-09-28', stocks), /different session/);
  assert.throws(() => nsePreviousCloses(csv + '\nONE,EQ,29-Sep-2026,101', '2026-09-29', stocks), /Duplicate/);
  const q = quote('NSE:1', { price: 102, previousClose: 102, change: 0, percent: 0 });
  const result = await enrichClosingQuotes([q], stocks, { date: '2026-09-29', close: 0 }, { _id: 'cash', sessionDate: '2026-09-29', quotes: [{ ...q, previousClose: 100, changeSource: 'nse-bhavcopy' }] });
  assert.equal(result.quotes[0].price, 102); assert.equal(result.quotes[0].percent, 2);
  assert.match(discoveryEvidence(result.quotes[0], [], '2026-09-29', at).percent!.source, /NSE daily report/);
});
