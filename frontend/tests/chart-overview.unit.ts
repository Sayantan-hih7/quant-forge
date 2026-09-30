import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overviewRequest, overviewWindow } from '../src/modules/stock-details/utils/overviewRange';
import type { ChartBar, StockQuote } from '../src/modules/stock-details/types';
const bar = (time: string): ChartBar => ({ time, open:100, high:110, low:90, close:105, volume:100 });

test('Today isolates the latest session and weekends keep its actual date', () => {
  const bars = ['2026-09-24T03:45:00Z','2026-09-25T03:45:00Z','2026-09-25T03:50:00Z'].map(bar);
  const result = overviewWindow(bars,'today',Date.parse('2026-09-26T06:00:00Z'));
  assert.equal(result.session,'2026-09-25'); assert.equal(result.bars.length,2); assert.equal(result.latestSession,true);
  const today = overviewWindow(bars,'today',Date.parse('2026-09-25T06:00:00Z'));
  assert.equal(today.latestSession,false);
  assert.equal(overviewRequest('today').timeframe,'5m');
  assert.equal(overviewRequest('1w').timeframe,'15m');
  assert.equal(overviewRequest('1mo').timeframe,'1d');
});

test('a newer quote must not relabel older candles as today, and future bars are excluded', () => {
  const now = Date.parse('2026-09-30T06:00:00Z');
  const quote = { lastTradeAt:'2026-09-30T05:59:00Z', source:'motilal-stream' } as StockQuote;
  const result = overviewWindow([bar('2026-09-29T04:00:00Z'),bar('2026-09-30T07:00:00Z')],'today',now,quote);
  assert.equal(result.session,'2026-09-30'); assert.deepEqual(result.bars,[]);
  assert.equal(overviewWindow([bar('2026-09-29T04:00:00Z')],'today',now,{...quote,lastTradeAt:'2026-09-30T08:00:00Z'}).session,'2026-09-29');
});

test('calendar ranges clamp month ends and keep only candles in the selected period', () => {
  const bars = ['2026-02-27','2026-02-28','2026-03-01','2026-03-30'].map(bar);
  assert.deepEqual(overviewWindow(bars,'1mo',Date.parse('2026-03-31T06:00:00Z')).bars,bars.slice(1));
  assert.deepEqual(overviewWindow(bars,'all',Date.parse('2026-03-31T06:00:00Z')).bars,bars);
  assert.deepEqual(overviewWindow(bars,'1w',Date.parse('2026-03-31T06:00:00Z')).bars,bars.slice(-1));
  assert.deepEqual(overviewWindow([],'today',Date.parse('2026-03-31T06:00:00Z')).bars,[]);
});
