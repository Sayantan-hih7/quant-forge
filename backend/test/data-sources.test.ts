import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDhanMaster } from '../src/modules/market-data/sources/dhan-master.js';
import { parseDhanCompany } from '../src/modules/market-data/sources/dhan-company.js';
import { parseNseDelivery, monthlyDelivery } from '../src/modules/market-data/sources/nse-reports.js';
import { parseBseDelivery, parseBsePledge } from '../src/modules/market-data/sources/bse-reports.js';
import { parseNiftyMembers, parseBseMembers } from '../src/modules/market-data/sources/index-membership.js';
import { parseDhanHistory } from '../src/modules/market-data/sources/dhan-history.js';
import type { Instrument, DeliveryDay } from '../src/modules/market-data/types.js';
const now = '2026-09-23T05:00:00.000Z';
const stock: Instrument = { _id: 'NSE:2885', securityId: '2885', exchange: 'NSE', isin: 'INE002A01018', symbol: 'RELIANCE', name: 'Reliance Industries', series: 'EQ', active: true, primary: true, lotSize: 1, observedAt: now };

test('master excludes bonds and funds and selects one primary listing per ISIN', () => {
  const header = 'EXCH_ID,SEGMENT,SECURITY_ID,ISIN,INSTRUMENT,INSTRUMENT_TYPE,UNDERLYING_SYMBOL,SYMBOL_NAME,SERIES,LOT_SIZE,BUY_SELL_INDICATOR\n';
  const rows = parseDhanMaster(header + [
    'BSE,E,500325,INE002A01018,EQUITY,ES,RELIANCE,Reliance,A,1,A',
    'NSE,E,2885,INE002A01018,EQUITY,ES,RELIANCE,Reliance,EQ,1,A',
    'NSE,E,1,INE002A01018,EQUITY,DB,DEBT,Bond,N0,1,A',
    'NSE,E,2,INF002A01018,EQUITY,ES,FUND,ETF,EQ,1,A',
  ].join('\n'), now);
  assert.equal(rows.length, 2); assert.equal(rows.filter(x => x.primary).length, 1);
  assert.equal(rows.find(x => x.primary)?.exchange, 'NSE');
});
test('company snapshots preserve zero, reject missing numbers, and are not backdated to the quarter', () => {
  const rows = parseDhanCompany({ securityId: '2885', data: { CO: { MARKET_CAP: '1,234.5', SECTOR: 'Energy' }, RATIOS: { DEBT_TO_EQUITY: '0', ROE: null }, SHP: { REPORTING_PERIOD: '202606', PROMOTER_HOLDING: '-' } } }, stock, now);
  assert.equal(rows.find(x => x.field === 'debtEquity')?.value, 0);
  assert.equal(rows.find(x => x.field === 'marketCap')?.value, 1234.5);
  assert.equal(rows.some(x => x.field === 'roe' || x.field === 'promoterHolding'), false);
  assert.ok(rows.every(x => x.knownAt === now));
  assert.throws(() => parseDhanCompany({ securityId: '500325', data: { CO: {} } }, stock, now));
});
test('NSE delivery units, absent delivery and wrong dates are handled explicitly', () => {
  const csv = 'SYMBOL, SERIES, DATE1, TTL_TRD_QNTY, TURNOVER_LACS, DELIV_QTY\nRELIANCE, EQ, 22-Sep-2026, 1000, 200, -';
  const [row] = parseNseDelivery(csv, '2026-09-22', [stock], now);
  assert.equal(row.turnoverCr, 2); assert.equal(row.deliverable, null);
  assert.throws(() => parseNseDelivery(csv, '2026-09-21', [stock], now));
});
test('monthly delivery is volume-weighted, complete-session only, and not a mean of percentages', () => {
  const day = (date: string, volume: number, deliverable: number | null): DeliveryDay => ({ _id: date, instrumentId: stock._id, date, volume, deliverable, turnoverCr: 2, source: 'test', sourceUrl: 'test', observedAt: now, knownAt: now });
  const days = [day('2026-08-03', 100, 80), day('2026-08-04', 900, 180)];
  const rows = monthlyDelivery(days, '2026-08', days.map(x => x.date), now);
  assert.equal(rows.find(x => x.field === 'delivery')?.value, 26);
  assert.equal(rows.find(x => x.field === 'tradedValue')?.value, 4);
  assert.equal(monthlyDelivery(days, '2026-08', [...days.map(x => x.date), '2026-08-05'], now).length, 0);
  assert.equal(monthlyDelivery([days[0], { ...days[1], deliverable: null }], '2026-08', days.map(x => x.date), now).some(x => x.field === 'delivery'), false);
});
test('BSE pipe-delimited reports resolve by BSE code and use rupees, not NSE lakh units', () => {
  const bse = { ...stock, _id: 'BSE:500325', exchange: 'BSE' as const, securityId: '500325' };
  const text = "DATE|SCRIP CODE|DELIVERY QTY|DAY'S VOLUME|DAY'S TURNOVER\r\r\n22092026|500325|50|100|20000000\r\r\n";
  const [row] = parseBseDelivery(text, '2026-09-22', [stock, bse], now);
  assert.equal(row.instrumentId, bse._id); assert.equal(row.turnoverCr, 2);
});

test('pledge joins by BSE code and ISIN, uses promoter denominator and retains reporting period', () => {
  const bse = { ...stock, _id: 'BSE:500325', exchange: 'BSE' as const, securityId: '500325' };
  const payload = { Table: [{ Fld_ScripCode: 500325, Fld_EndDate: '20260630', PROMOTEREncum_Percof_PromoterShares: 4.5, PROMOTEREncum_Percof_TotalShares: 1.2 }] };
  const { facts } = parseBsePledge(payload, [stock, bse], now);
  assert.equal(facts.length, 2); assert.ok(facts.every(x => x.value === 4.5 && x.period === '2026-06-30' && x.knownAt === now));
  assert.equal(parseBsePledge({ Table: [{ ...payload.Table[0], PROMOTEREncum_Percof_PromoterShares: '-' }] }, [stock, bse], now).facts.length, 0);
});
test('constituents retain multiple independent memberships and reject malformed identities', () => {
  const csv = 'Company Name,Industry,Symbol,ISIN Code\nReliance,Energy,RELIANCE,INE002A01018\nDummy HEG Ltd.,Metals,DUMMYHEG,DUM545A01024';
  assert.equal(parseNiftyMembers(csv).length, 1);
  assert.throws(() => parseNiftyMembers(csv.replace('INE002A01018', 'bad')));
  assert.equal(parseBseMembers({ Table: [{ SCRIP_CODE: '500325', Industry_name: 'Energy' }] })[0].securityId, '500325');
});
test('history rejects array mismatch and excludes the currently forming minute', () => {
  const stamp = Date.parse('2026-09-23T05:00:00Z') / 1000;
  const payload = { timestamp: [stamp - 60, stamp], open: [100, 100], high: [102, 102], low: [99, 99], close: [101, 101], volume: [100, 100] };
  assert.equal(parseDhanHistory(payload, stock, '1m', now).length, 1);
  assert.throws(() => parseDhanHistory({ ...payload, close: [101] }, stock, '1m', now));
  assert.throws(() => parseDhanHistory({ ...payload, high: [90, 90] }, stock, '1m', now));
});
