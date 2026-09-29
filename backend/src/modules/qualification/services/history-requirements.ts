import { ruleFields } from '../../../shared/rule-fields.js';
export const monthlyFactFields = new Set(['marketCap', 'debtEquity', 'pledge', 'delivery', 'roe', 'roce', 'pe', 'promoterHolding', 'fiiChange', 'diiChange', 'sector', 'index', 'turnover', 'tradedValue']);
export const dhanCompanyFields = new Set(['marketCap', 'debtEquity', 'roe', 'roce', 'pe', 'promoterHolding', 'fiiChange', 'diiChange', 'sector']);
export function indicatorMonths(field: string, period?: number) {
  if (['high52w', 'low52w'].includes(field)) return 13;
  const length = period ?? ruleFields[field]?.period?.default;
  if (field === 'adx') return 2 * (length ?? 14) - 1;
  if (length) return length + (['rsi', 'avgVolume', 'rvol', 'volumeRatio'].includes(field) ? 1 : 0);
  const ma = /^(ema|sma)(\d+)$/.exec(field);
  if (ma) return Number(ma[2]);
  const fixed: Record<string, number> = { rsi: 15, atr: 14, macd: 26, macdSignal: 34, avgVolume6: 7, avgVolume20: 21, rvol: 21, volumeRatio: 21, priceChange: 2, supertrend: 10, bullishEngulfing: 2, bearishEngulfing: 2 };
  const returns = /^return(\d+)m$/.exec(field);
  return fixed[field] ?? (returns ? Number(returns[1]) + 1 : 1);
}
export function monthlyHistoryRequirements(rule: Record<string, unknown>, month: string) {
  const requirements = new Map<string, number>();
  for (const group of rule.groups as { conditions: Record<string, unknown>[] }[] ?? []) for (const c of group.conditions) {
    const extra = ['crossAbove', 'crossBelow', 'increasing', 'decreasing'].includes(String(c.operator)) ? Number(c.lookback ?? 1) : 0;
    for (const [field, period, offset] of [[String(c.field), c.period, c.offset], ...(c.operand === 'field' ? [[String(c.compareField), c.comparePeriod, c.compareOffset]] : [])] as [string, number | undefined, number | undefined][]) {
      if (!monthlyFactFields.has(field)) requirements.set(field, Math.max(requirements.get(field) ?? 0, indicatorMonths(field, period) + (offset ?? 0) + extra));
    }
  }
  const minimum = Math.max(0, ...requirements.values());
  // Additional warm-up reduces EMA/RSI seed effects. Never use the forming month.
  const months = Math.max(0, ...[...requirements].map(([field, count]) => /^(ema|rsi|macd|atr|adx|diPlus|diMinus|supertrend|bodyAboveEma|bodyBelowEma)/.test(field) ? Math.max(count * 3, 36) : count));
  const [year, number] = month.split('-').map(Number);
  return { minimum, months, from: new Date(Date.UTC(year, number - 1 - months, 1)).toISOString().slice(0, 10), to: `${month}-01`, fields: Object.fromEntries(requirements) };
}
