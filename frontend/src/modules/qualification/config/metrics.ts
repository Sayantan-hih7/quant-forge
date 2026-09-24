import type { Condition, Metric, Timeframe, Tier } from '../types';
interface MetricDefinition { label: string; unit: string; frames: Timeframe[]; base: boolean }
const technical: Timeframe[] = ['1m', '5m', '15m', '4h', '1d', '1w', '1mo'];
export const metrics: Record<Metric, MetricDefinition> = {
  marketCap: { label: 'Market cap', unit: '₹ Cr', frames: ['latest'], base: true },
  turnover: { label: 'Avg. daily turnover', unit: '₹ Cr', frames: ['1d'], base: true },
  debtEquity: { label: 'Debt / equity', unit: 'ratio', frames: ['latest'], base: true },
  pledge: { label: 'Promoter pledge', unit: '%', frames: ['latest'], base: true },
  close: { label: 'Close price', unit: '₹', frames: technical, base: true },
  volume: { label: 'Current volume', unit: 'shares', frames: technical, base: true },
  avgVolume20: { label: '20-day average volume', unit: 'shares', frames: ['1d'], base: true },
  ema5: { label: '5 EMA', unit: '₹', frames: technical, base: true },
  ema20: { label: '20 EMA', unit: '₹', frames: technical, base: true },
  sma200: { label: '200 SMA', unit: '₹', frames: technical, base: true },
  vwap: { label: 'VWAP', unit: '₹', frames: ['1m', '5m', '15m', '1d'], base: false },
  rvol: { label: 'Relative volume', unit: 'ratio', frames: technical, base: false },
  rsi: { label: 'RSI (14)', unit: 'RSI', frames: technical, base: false },
  growth: { label: 'Quarterly revenue growth', unit: '%', frames: ['1q'], base: true },
  roe: { label: 'Return on equity', unit: '%', frames: ['latest'], base: true },
};
export const frameLabels: Record<Timeframe, string> = { latest: 'Latest', '1m': '1 min', '5m': '5 min', '15m': '15 min', '4h': '4 hour', '1d': 'Daily', '1w': 'Weekly', '1mo': 'Monthly', '1q': 'Quarterly' };
export const operatorLabels = { gt: '>', gte: '≥', lt: '<', lte: '≤', crossAbove: 'Crosses above', crossBelow: 'Crosses below', within: 'Within % of' };
export const horizonLabels = { intraday: 'Intraday', swing: 'Swing', 'long-term': 'Long term' };
export function allowedFrames(metric: Metric, tier: Tier) {
  return metrics[metric].frames.filter((frame) => tier === 'tactical' || !['1m', '5m', '15m', '4h'].includes(frame));
}
export function describeCondition(condition: Condition) {
  const left = `${metrics[condition.left].label} (${frameLabels[condition.leftFrame]})`;
  const right = condition.rightType === 'value' ? `${condition.value} ${metrics[condition.left].unit}` : `${condition.multiplier !== 1 ? condition.multiplier + ' × ' : ''}${metrics[condition.right].label} (${frameLabels[condition.rightFrame]})`;
  return `${left} ${condition.operator === 'within' ? 'within ' + condition.tolerance + '% of' : operatorLabels[condition.operator]} ${right}`;
}
export const defaultCondition: Condition = { left: 'marketCap', leftFrame: 'latest', operator: 'gte', rightType: 'value', value: 3000, right: 'sma200', rightFrame: '1d', multiplier: 1, tolerance: 2 };
