import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveChartBars } from '../src/modules/stock-details/utils/live-chart-bars.js';
import type { StockQuote } from '../src/modules/stock-details/types.js';
const tick = (at: string, price: number, volume: number): StockQuote => ({ instrumentId: 'NSE:1', price, previousClose: 99, change: price-99, percent: 1, open: 100, high: 120, low: 95, volume, averagePrice: 102, lowerCircuit: null, upperCircuit: null, lastTradeAt: at, receivedAt: at, source: 'dhan-stream' });
test('all received ticks contribute to preview extremes and volume before message coalescing', () => {
  const b = new LiveChartBars();
  assert.equal(b.tick(tick('2026-09-28T04:00:50Z',100,1000))[0].partial,true);
  const first = b.tick(tick('2026-09-28T04:01:00Z',101,1010)).at(-1)!;
  assert.equal(first.open,101); assert.equal(first.partial,false);
  b.tick(tick('2026-09-28T04:01:01Z',108,1020));
  b.tick(tick('2026-09-28T04:01:02Z',98,1025));
  const last = b.tick(tick('2026-09-28T04:01:03Z',103,1040)).at(-1)!;
  assert.deepEqual([last.open,last.high,last.low,last.close,last.volume],[101,108,98,103,40]);
});
test('reconnect fragments, out-of-order ticks, gaps and volume resets never look complete', () => {
  const b = new LiveChartBars();
  b.tick(tick('2026-09-28T04:00:59Z',100,1000));
  assert.equal(b.tick(tick('2026-09-28T04:01:01Z',101,1010)).at(-1)!.partial,false);
  assert.deepEqual(b.tick(tick('2026-09-28T04:01:00Z',400,1010)),[]);
  assert.equal(b.tick(tick('2026-09-28T04:01:25Z',102,1030)).at(-1)!.partial,true);
  b.reset(); assert.equal(b.tick(tick('2026-09-28T04:01:30Z',100,1031)).at(-1)!.partial,true);
  assert.equal(b.tick(tick('2026-09-28T04:02:01Z',100,5)).at(-1)!.partial,true);
  assert.deepEqual(b.tick(tick('2026-09-28T10:01:00Z',100,6)),[]);
  assert.deepEqual(b.tick({...tick('2026-09-28T04:05:00Z',100,2000),receivedAt:'2026-09-28T04:06:00Z'}),[]);
});

test('Motilal previews preserve extremes, but changing provider or session starts a partial fragment', () => {
  const b = new LiveChartBars();
  const mo = { ...tick('2026-09-28T04:00:59Z', 100, 1000), source: 'motilal-stream' as const, streamSession: 'mo-1' };
  b.tick(mo);
  const full = b.tick({ ...mo, lastTradeAt: '2026-09-28T04:01:01Z', receivedAt: '2026-09-28T04:01:01Z', price: 102, volume: 1010 }).at(-1)!;
  assert.equal(full.partial, false); assert.equal(full.volume, 10);
  const switched = b.tick({ ...tick('2026-09-28T04:01:02Z', 103, 2000), streamSession: 'dhan-1' }).at(-1)!;
  assert.equal(switched.partial, true); assert.equal(switched.volume, 0); assert.equal(switched.open, 103); assert.equal(switched.streamSession, 'dhan-1');
});
