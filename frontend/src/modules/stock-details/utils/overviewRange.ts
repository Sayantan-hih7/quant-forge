import type { ChartBar, StockQuote, StockTimeframe } from '../types';
import { istDay } from './chartTime';

export const overviewPeriods = ['today', '1w', '1mo', '3mo', '6mo', '1y', 'all'] as const;
export type OverviewPeriod = typeof overviewPeriods[number];
export const overviewOptions = overviewPeriods.map(value => ({ value, label: ({ today: 'Today', '1w': '1W', '1mo': '1M', '3mo': '3M', '6mo': '6M', '1y': '1Y', all: 'All' })[value] }));
export function overviewRequest(period: OverviewPeriod, kind: 'candles' | 'line' = 'candles'): { timeframe: StockTimeframe; lookbackDays?: number; intervalLabel: string } {
  if (period === 'today' && kind === 'line') return { timeframe: '1m', lookbackDays: 14, intervalLabel: '1-minute prices' };
  if (period === 'today') return { timeframe: '5m', lookbackDays: 14, intervalLabel: '5-minute candles' };
  if (period === '1w') return { timeframe: '15m', lookbackDays: 14, intervalLabel: '15-minute candles' };
  return { timeframe: '1d', lookbackDays: ({ '1mo': 45, '3mo': 110, '6mo': 200, '1y': 380, all: undefined })[period], intervalLabel: 'Daily candles' };
}

export function overviewWindow(bars: ChartBar[], period: OverviewPeriod, now: number, quote?: StockQuote) {
  const today = istDay(now);
  const available = bars.filter(b => Date.parse(b.time) <= now);
  const latest = available.at(-1);
  let session = latest ? istDay(Date.parse(latest.time)) : undefined;
  const quotedAt = Date.parse(quote?.lastTradeAt ?? '');
  // A newer real trade proves that an older cached day is not the current session.
  // Keep it empty/loading instead of labelling yesterday's chart as today's.
  if (Number.isFinite(quotedAt) && quotedAt <= now + 2000 && quote?.source !== 'historical-close') {
    const quotedDay = istDay(quotedAt);
    if (quotedAt >= Date.parse(`${quotedDay}T09:15:00+05:30`) && (!session || quotedDay > session)) session = quotedDay;
  }
  if (period === 'today') return { bars: available.filter(b => istDay(Date.parse(b.time)) === session), session,
    from: session, to: session, latestSession: session !== today };
  const date = new Date(`${today}T00:00:00Z`);
  if (period === '1w') date.setUTCDate(date.getUTCDate() - 7);
  else if (period !== 'all') {
    const day = date.getUTCDate(); date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - ({ '1mo': 1, '3mo': 3, '6mo': 6, '1y': 12 })[period]);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  const from = period === 'all' ? undefined : date.toISOString().slice(0, 10);
  const selected = available.filter(b => !from || istDay(Date.parse(b.time)) >= from);
  return { bars: selected, session, from: selected[0] ? istDay(Date.parse(selected[0].time)) : from,
    to: selected.at(-1) ? istDay(Date.parse(selected.at(-1)!.time)) : undefined, latestSession: false };
}

export function overviewDate(day?: string) {
  return day ? new Date(`${day}T00:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : 'Waiting for candles';
}
