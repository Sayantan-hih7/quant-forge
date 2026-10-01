import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bseClosesUrl, parseBseCloses, parseNseCloses } from '../src/modules/market-data/sources/daily-closes.js';
import { parseNiftyMembers } from '../src/modules/market-data/sources/index-membership.js';
import { returnCorrelation } from '../src/modules/stock-details/utils/related-stocks.js';
import type { Instrument } from '../src/modules/market-data/types.js';

const now = '2026-10-01T14:00:00.000Z';
const stock = (symbol: string, isin: string, series = 'EQ', primary = true): Instrument => ({ _id: `NSE:${symbol}${series}`, exchange: 'NSE', securityId: '1', isin, symbol, name: symbol, series, lotSize: 1, active: true, observedAt: now, primary });

test('NSE closes map listings to one row per company and reject another session', () => {
  const csv = ['SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER',
    'ABB, EQ, 30-Sep-2026, 6845, 6800, 6925, 6753, 6753, 6753.55, 6800, 10, 1, 1, 5, 50',
    'ABB, BE, 30-Sep-2026, 6845, 6800, 6925, 6753, 6753, 6700, 6800, 10, 1, 1, 5, 50',
    'UNKNOWN, EQ, 30-Sep-2026, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1',
    'ZERO, EQ, 30-Sep-2026, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1'].join('\n');
  const rows = parseNseCloses(csv, '2026-09-30', [stock('ABB', 'INE117A01022'), stock('ABB', 'INE117A01022', 'BE', false), stock('ZERO', 'INE000Z01011')], now);
  assert.deepEqual(rows.map(r => [r._id, r.close, r.prevClose, r.exchange]), [['INE117A01022:2026-09-30', 6753.55, 6845, 'NSE']]);
  assert.throws(() => parseNseCloses(csv, '2026-10-01', [stock('ABB', 'INE117A01022')], now), (error: { code?: string }) => error.code === 'NO_SESSION');
});

test('BSE closes keep tracked listed equities only and treat a mismatched file as no session', () => {
  const header = 'TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric';
  const csv = [header,
    '2026-09-30,2026-09-30,CM,BSE,STK,500002,INE117A01022,ABB,A,,,,,ABB INDIA,6800,6925,6753.55,6753.55,6753.55,6845',
    '2026-09-30,2026-09-30,CM,BSE,STK,500003,INE999X01011,OTHER,A,,,,,OTHER,1,1,1,1,1,1',
    '2026-09-30,2026-09-30,CM,BSE,DBT,900001,INE117A07011,ABBNCD,F,,,,,NCD,1,1,1,1,1,1'].join('\n');
  const rows = parseBseCloses(csv, '2026-09-30', new Set(['INE117A01022', 'INE117A07011']), now);
  assert.deepEqual(rows.map(r => [r.isin, r.close, r.exchange]), [['INE117A01022', 6753.55, 'BSE']]);
  assert.throws(() => parseBseCloses(csv, '2026-10-02', new Set(['INE117A01022']), now), (error: { code?: string }) => error.code === 'NO_SESSION');
  assert.throws(() => parseBseCloses('<!DOCTYPE html><html></html>', '2026-10-02', new Set(), now), (error: { code?: string }) => error.code === 'NO_SESSION');
  assert.equal(bseClosesUrl('2026-09-30'), 'https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_20260930_F_0000.CSV');
});

test('correlation ignores split/bonus days in unadjusted closes', () => {
  const days = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
  const wave = days.map((_, i) => 100 * Math.exp(0.01 * Math.sin(i * 1.7)));
  const a = new Map(days.map((day, i) => [day, wave[i]]));
  // A 1:2 split halves the price mid-series; it must not read as a crash.
  const split = new Map(days.map((day, i) => [day, wave[i] * (i >= 45 ? 0.5 : 1)]));
  assert.equal(returnCorrelation(a, split), 1);
});

test('NIFTY files with a "Company" header still parse', () => {
  const rows = parseNiftyMembers('Company,Industry,Symbol,Series,ISIN Code\r\nDLF Ltd.,Realty,DLF,EQ,INE271C01023\r\n');
  assert.deepEqual(rows, [{ isin: 'INE271C01023', symbol: 'DLF', industry: 'Realty' }]);
  // Demerger placeholders use DU1.../DUM... codes and are labelled Dummy; unlabelled bad ISINs still fail.
  const dummies = 'Company Name,Industry,Symbol,Series,ISIN Code\nDummy India Glycols ltd. 1,Healthcare,DUMMYINGL1,EQ,DU1560A01023\nDummy Triveni Ltd.,Capital Goods,DUMMYTRVN,EQ,DUM256C01024\nDLF Ltd.,Realty,DLF,EQ,INE271C01023\n';
  assert.equal(parseNiftyMembers(dummies).length, 1);
  assert.throws(() => parseNiftyMembers('Company Name,Industry,Symbol,Series,ISIN Code\nReal Co,Realty,REAL,EQ,DU1560A01023\n'), /Invalid ISIN/);
});
