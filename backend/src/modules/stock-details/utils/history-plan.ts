import type { StockTimeframe } from '../types.js';
import { indianDate } from './chart-bars.js';

export interface ChartHistoryOptions { at?: string; minBars?: number; from?: string; lookbackDays?: number; repair?: boolean }
export function chartHistoryPlan(frame: StockTimeframe, now: number, options: ChartHistoryOptions = {}) {
  const intraday = ['1m', '5m', '15m', '1h', '4h'].includes(frame), today = indianDate(now);
  const n = Math.max(0, Math.min(options.minBars ?? 0, 1500));
  const minutes = parseInt(frame) * (frame.endsWith('h') ? 60 : 1);
  // Calendar allowance includes weekends/holidays and a full anchor boundary.
  const baseline = options.lookbackDays ?? (intraday ? frame.endsWith('h') ? 60 : 10 : 6 * 366);
  const days = Math.max(baseline, n ? intraday ? Math.ceil(n / Math.ceil(375 / minutes) * 1.7) + 10
    : Math.ceil(n * (frame === '1mo' ? 31 : frame === '1w' ? 7 : 1.7)) + 32 : 0);
  let from = indianDate(now - days * 86400000);
  if (options.from && options.from < from) from = options.from;
  if (frame === '1mo') from = `${from.slice(0, 7)}-01`;
  if (frame === '1w') {
    const date = new Date(`${from}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7); from = date.toISOString().slice(0, 10);
  }
  const floor = intraday ? indianDate(now - 5 * 365 * 86400000) : '1990-01-01';
  const limited = from < floor;
  if (limited) from = floor;
  return { intraday, base: intraday ? '1m' as const : '1d' as const, from, today,
    warning: limited ? `History is available only from ${floor} for this interval; earlier anchor data could not be requested.` : undefined };
}
