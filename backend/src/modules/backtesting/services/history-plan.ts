import { indicatorMonths, monthlyFactFields } from '../../qualification/services/history-requirements.js';
import type { StrategyDraft } from '../../strategies/validations/strategy.validation.js';

export interface HistoryPlan { dailyFrom?: string; intradayFrom?: string; to: string; replay: '1d' | '1m' }
const day = 86_400_000;
const before = (date: string, days: number) => new Date(Date.parse(date) - Math.ceil(days) * day).toISOString().slice(0, 10);

/** Include warm-up before the test starts, without extending its trading period. */
export function strategyHistoryPlan(strategy: StrategyDraft, from: string, to: string): HistoryPlan {
  const replay = strategy.entry.cadence === 'daily' && strategy.risk.timeframe === '1d' ? '1d' : '1m';
  let daily = replay === '1d' ? 10 : 0, intraday = replay === '1m' ? 7 : 0;
  const requireField = (field: string, frame: string, extra = 0, period?: number) => {
    if (monthlyFactFields.has(field)) return;
    const length = period ?? indicatorMonths(field);
    const bars = (/^(ema|rsi|atr|macd)/.test(field) ? length * 3 : length) + extra + 2;
    if (['1d', '1w', '1mo', '1q'].includes(frame)) {
      const days = frame === '1d' ? bars * 1.7 + 14 : frame === '1w' ? bars * 7 + 14 : bars * (frame === '1q' ? 93 : 31) + 31;
      daily = Math.max(daily, days);
    } else {
      const minutes = ({ '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240 } as Record<string, number>)[frame] ?? 1;
      intraday = Math.max(intraday, Math.ceil(bars * minutes / 375) * 2 + 7);
    }
  };
  for (const rule of [strategy.entry, strategy.exit]) {
    for (const group of rule.groups as { conditions: Record<string, unknown>[] }[]) for (const c of group.conditions) {
      const extra = ['crossAbove', 'crossBelow', 'increasing', 'decreasing'].includes(String(c.operator)) ? Number(c.lookback ?? 1) : 0;
      requireField(String(c.left), String(c.leftFrame), extra);
      if (c.rightType === 'indicator') requireField(String(c.right), String(c.rightFrame), extra);
    }
  }
  if (strategy.risk.stopMode === 'ATR') requireField('atr', strategy.risk.timeframe, 0, strategy.risk.atrPeriod);
  return { replay, to, ...(daily ? { dailyFrom: before(from, daily) } : {}), ...(intraday ? { intradayFrom: before(from, intraday) } : {}) };
}
