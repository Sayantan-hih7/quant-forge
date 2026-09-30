import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stockBeta } from '../src/modules/stock-details/utils/beta';
import { financialGrowth, financialRows } from '../src/modules/stock-details/utils/financials';
import type { ChartBar } from '../src/modules/stock-details/types';

function series(sensitivity: number) {
  let price = 100;
  return Array.from({ length: 253 }, (_, index): ChartBar => {
    if (index) price *= 1 + (index % 2 ? 0.01 : -0.005) * sensitivity;
    return { time: new Date(Date.UTC(2025, 0, index + 1)).toISOString(), open: price, high: price, low: price, close: price, volume: 100 };
  });
}
const now = Date.parse('2026-09-30');
test('beta uses matched returns and preserves negative market relationships', () => {
  for (const sensitivity of [1, 2, -0.5]) {
    const beta = stockBeta(series(sensitivity), series(1), now);
    assert.equal(beta.pairs, 252); assert.ok(Math.abs(beta.value! - sensitivity) < 1e-9);
  }
});
test('beta rejects short history, missing intervals, forming candles and zero market variance', () => {
  const bars = series(1);
  assert.equal(stockBeta(bars.slice(-6), bars, now).pairs, 5);
  assert.equal(stockBeta(bars.filter((_, i) => i !== 120), bars, now).value, null);
  assert.equal(stockBeta(bars, bars.filter((_, i) => i !== 120), now).value, null);
  assert.equal(stockBeta(bars, bars, Date.parse(bars.at(-1)!.time) + 3600000).value, null);
  assert.equal(stockBeta(bars, series(0), now).reason, 'no-benchmark-variation');
});
test('financial YoY matches the prior-year period, not the previous row or a loss denominator', () => {
  const period = (date: string, revenue: number, netProfit: number) => ({ period: date, revenue, netProfit, sales: null, eps: null, ebitda: null });
  const rows = financialRows([period('2026-06-30', 150, 30), period('2026-03-31', 100, 10), period('2025-06-30', 100, -10)]);
  assert.equal(rows[2].revenueGrowth, 50); assert.equal(rows[2].profitGrowth, null); assert.equal(rows[1].revenueGrowth, null);
  assert.equal(financialGrowth(-10, 20), -150); assert.equal(financialGrowth(0, 20), -100); assert.equal(financialGrowth(10, 0), null);
});
