import type { ChartBar } from '../types';
import { barEnd, bucketTime } from './chartTime';

export const betaPeriods = 252;
export function stockBeta(stock: ChartBar[], benchmark: ChartBar[], now: number) {
  const closed = (bars: ChartBar[]) => bars.filter(b => barEnd(b.time, '1d') <= now && Number.isFinite(b.close) && b.close > 0).sort((a, b) => a.time.localeCompare(b.time));
  const stocks = closed(stock), benchmarks = closed(benchmark);
  const stockDates = new Map(stocks.map((bar, index) => [bucketTime(Date.parse(bar.time), '1d'), { close: bar.close, index }]));
  const lastStock = stocks.at(-1)?.time.slice(0, 10);
  const window = benchmarks.filter(b => lastStock && b.time.slice(0, 10) <= lastStock).slice(-betaPeriods - 1);
  const returns: { stock: number; market: number }[] = [];
  for (let i = 1; i < window.length; i++) {
    const previous = stockDates.get(bucketTime(Date.parse(window[i - 1].time), '1d'));
    const current = stockDates.get(bucketTime(Date.parse(window[i].time), '1d'));
    // Never bridge a missing observation in one series with a one-day return in the other.
    if (!previous || !current || current.index !== previous.index + 1) continue;
    returns.push({ stock: current.close / previous.close - 1, market: window[i].close / window[i - 1].close - 1 });
  }
  const detail = { pairs: returns.length, required: betaPeriods, from: window[0]?.time.slice(0, 10), to: window.at(-1)?.time.slice(0, 10) };
  if (returns.length < betaPeriods) return { ...detail, value: null, reason: 'insufficient-history' as const };
  const mean = (key: 'stock' | 'market') => returns.reduce((sum, r) => sum + r[key], 0) / returns.length;
  const stockMean = mean('stock'), marketMean = mean('market');
  const variance = returns.reduce((sum, r) => sum + (r.market - marketMean) ** 2, 0);
  if (variance < 1e-12) return { ...detail, value: null, reason: 'no-benchmark-variation' as const };
  const covariance = returns.reduce((sum, r) => sum + (r.stock - stockMean) * (r.market - marketMean), 0);
  return { ...detail, value: covariance / variance, reason: undefined };
}
