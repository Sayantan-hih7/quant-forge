import { ruleFields } from '../../../shared/rule-fields.js';
import { indicatorMonths, monthlyFactFields } from '../../qualification/services/history-requirements.js';
import type { StrategyDraft } from '../../strategies/validations/strategy.validation.js';

export interface HistoryPlan { dailyFrom?: string; intradayFrom?: string; to: string; replay: '1d' | '1m'; reportsFrom?: string }
const day = 86_400_000;
const before = (date: string, days: number) => new Date(Date.parse(date) - Math.ceil(days) * day).toISOString().slice(0, 10);

/** Include warm-up before the test starts, without extending its trading period. */
export function strategyHistoryPlan(strategy: StrategyDraft, from: string, to: string): HistoryPlan {
  const replay = strategy.entry.cadence === 'daily' && strategy.risk.timeframe === '1d' ? '1d' : '1m';
  let daily = replay === '1d' ? 10 : 0, intraday = replay === '1m' ? 7 : 0;
  let reports = 0;
  const requireField = (field: string, frame: string, extra = 0, period?: number) => {
    if (monthlyFactFields.has(field)) return;
    const length = indicatorMonths(field, period);
    const bars = (/^(ema|rsi|atr|macd|adx|diPlus|diMinus|supertrend|bodyAboveEma|bodyBelowEma)/.test(field) ? length * 3 : length) + extra + 2;
    if (['high52w', 'low52w'].includes(field)) { daily = Math.max(daily, 400 + extra * (frame === '1mo' ? 31 : 2)); return; }
    if (ruleFields[field]?.source === 'dailyReports') reports = Math.max(reports, bars * 1.7 + 14);
    if (['1d', '1w', '1mo', '1q'].includes(frame)) {
      const days = frame === '1d' ? bars * 1.7 + 14 : frame === '1w' ? bars * 7 + 14 : bars * (frame === '1q' ? 93 : 31) + 31;
      daily = Math.max(daily, days);
    } else {
      const minutes = ({ '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240 } as Record<string, number>)[frame] ?? 1;
      intraday = Math.max(intraday, Math.ceil(bars * minutes / 375) * 2 + 7);
    }
  };
  for (const rule of [strategy.entry, strategy.exit]) {
    if (rule.enabled === false) continue;
    for (const group of rule.groups as { conditions: Record<string, unknown>[] }[]) for (const c of group.conditions) {
      const extra = ['crossAbove', 'crossBelow', 'increasing', 'decreasing'].includes(String(c.operator)) ? Number(c.lookback ?? 1) : 0;
      requireField(String(c.left), String(c.leftFrame), extra + Number(c.leftOffset ?? 0), c.leftPeriod as number | undefined);
      if (c.rightType === 'indicator') requireField(String(c.right), String(c.rightFrame), extra + Number(c.rightOffset ?? 0), c.rightPeriod as number | undefined);
    }
  }
  if (strategy.risk.stopMode === 'ATR') requireField('atr', strategy.risk.timeframe, 0, strategy.risk.atrPeriod);
  if (strategy.risk.stopMode === 'candleLow') requireField('low', strategy.risk.timeframe);
  return { replay, to, ...(reports ? { reportsFrom: before(from, reports) } : {}), ...(daily ? { dailyFrom: before(from, daily) } : {}), ...(intraday ? { intradayFrom: before(from, intraday) } : {}) };
}
