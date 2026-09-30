import type { Condition, Metric, Timeframe, Tier } from '../types';
import { ruleFields, fieldUnits, fieldLabel } from './ruleFields';
interface MetricDefinition { label: string; unit: string; frames: Timeframe[]; base: boolean }
export const metrics = Object.fromEntries([
  ...Object.entries(ruleFields).filter(([, field]) => field.trading).map(([id, field]) => [id, { label: field.label, unit: fieldUnits[field.unit], frames: field.frames as Timeframe[], base: field.monthly }]),
  ['growth', { label: 'Quarterly revenue growth (source not connected)', unit: '%', frames: ['1q'], base: true }],
]) as Record<Metric, MetricDefinition>;
export const frameLabels: Record<Timeframe, string> = { latest: 'Latest', '1m': '1 min', '5m': '5 min', '15m': '15 min', '4h': '4 hour', '1d': 'Daily', '1w': 'Weekly', '1mo': 'Monthly', '1q': 'Quarterly' };
export const operatorLabels = {
  gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠',
  between: 'Between', notBetween: 'Not between',
  crossAbove: 'Crosses above', crossBelow: 'Crosses below',
  increasing: 'Increasing over', decreasing: 'Decreasing over',
  within: 'Within % of', aboveBy: 'Above by %', belowBy: 'Below by %',
};
export const horizonLabels = { intraday: 'Intraday', swing: 'Swing', 'long-term': 'Long term' };
export function allowedFrames(metric: Metric, tier: Tier) {
  return metrics[metric].frames.filter((frame) => tier === 'tactical' || !['1m', '5m', '15m', '4h'].includes(frame));
}
export function describeCondition(condition: Condition) {
  const left = `${fieldLabel(condition.left, condition.leftPeriod, condition.leftOffset, condition.leftSettings)} (${frameLabels[condition.leftFrame]})`;
  if (condition.operator === 'between' || condition.operator === 'notBetween') {
    return `${left} ${condition.operator === 'between' ? 'between' : 'not between'} ${condition.value} and ${condition.upper ?? condition.value} ${metrics[condition.left].unit}`.trim();
  }
  if (condition.operator === 'increasing' || condition.operator === 'decreasing') {
    return `${left} ${condition.operator} over ${condition.lookback ?? 3} candles`;
  }
  const right = condition.rightType === 'value' ? `${condition.value} ${metrics[condition.left].unit}` : `${condition.multiplier !== 1 ? condition.multiplier + ' × ' : ''}${fieldLabel(condition.right, condition.rightPeriod, condition.rightOffset, condition.rightSettings)} (${frameLabels[condition.rightFrame]})`;
  const opLabel = condition.operator === 'within' ? 'within ' + condition.tolerance + '% of'
    : condition.operator === 'aboveBy' ? 'above by at least ' + condition.tolerance + '% of'
    : condition.operator === 'belowBy' ? 'below by at least ' + condition.tolerance + '% of'
    : operatorLabels[condition.operator];
  const occurrence = condition.operator.startsWith('cross') && (condition.lookback ?? 1) > 1 ? ` within the last ${condition.lookback} completed candles` : '';
  return `${left} ${opLabel} ${right}${occurrence}`;
}
export type ConditionKind = 'bullish' | 'bearish' | 'range' | 'trend' | 'pattern' | 'threshold' | 'relative';
export const conditionKindLabels: Record<ConditionKind, string> = {
  bullish: 'Bullish crossover', bearish: 'Bearish crossover', range: 'Range condition', trend: 'Trend condition', pattern: 'Pattern condition', threshold: 'Threshold condition', relative: 'Relative comparison',
};
export function conditionKind(condition: Condition): ConditionKind {
  if (condition.operator === 'crossAbove') return 'bullish';
  if (condition.operator === 'crossBelow') return 'bearish';
  if (['within', 'between', 'notBetween'].includes(condition.operator)) return 'range';
  if (['increasing', 'decreasing'].includes(condition.operator)) return 'trend';
  if (ruleFields[condition.left]?.unit === 'flag') return 'pattern';
  return condition.rightType === 'value' ? 'threshold' : 'relative';
}
/** Plain-language read of a condition, shown once it is set so a trader can confirm it before adding another. */
export function conditionInsight(condition: Condition) {
  const kind = conditionKind(condition);
  const left = fieldLabel(condition.left, condition.leftPeriod, condition.leftOffset, condition.leftSettings);
  const right = condition.rightType === 'value' ? `${condition.value} ${metrics[condition.left]?.unit ?? ''}`.trim() : fieldLabel(condition.right, condition.rightPeriod, condition.rightOffset, condition.rightSettings);
  const occurrence = (condition.lookback ?? 1) > 1 ? `within the last ${condition.lookback} completed candles` : 'on the latest completed candle';
  const detail = condition.operator === 'crossAbove' ? `Matches when ${left} moves from at-or-below to above ${right} ${occurrence}.`
    : condition.operator === 'crossBelow' ? `Matches when ${left} moves from at-or-above to below ${right} ${occurrence}.`
    : condition.operator === 'within' ? `Matches while ${left} stays within ${condition.tolerance}% of ${right}.`
    : condition.operator === 'aboveBy' ? `Matches when ${left} is at least ${condition.tolerance}% above ${right}.`
    : condition.operator === 'belowBy' ? `Matches when ${left} is at least ${condition.tolerance}% below ${right}.`
    : condition.operator === 'between' ? `Matches while ${left} stays between ${condition.value} and ${condition.upper ?? condition.value}.`
    : condition.operator === 'notBetween' ? `Matches while ${left} stays outside ${condition.value}–${condition.upper ?? condition.value}.`
    : condition.operator === 'increasing' ? `Matches when ${left} has risen for ${condition.lookback ?? 3} candles in a row.`
    : condition.operator === 'decreasing' ? `Matches when ${left} has fallen for ${condition.lookback ?? 3} candles in a row.`
    : condition.operator === 'eq' && ruleFields[condition.left]?.unit === 'flag' ? `Matches when ${metrics[condition.left].label} is ${condition.value === 0 ? 'not detected' : 'detected'}${condition.leftOffset ? `, ${condition.leftOffset} completed candles earlier` : ''}.`
    : condition.operator === 'eq' ? `Matches whenever ${left} equals ${right}.`
    : condition.operator === 'neq' ? `Matches whenever ${left} does not equal ${right}.`
    : `Matches whenever ${left} is ${operatorLabels[condition.operator].toLowerCase()} ${right}.`;
  return { kind, label: conditionKindLabels[kind], summary: describeCondition(condition), detail };
}
export const defaultCondition: Condition = { left: 'marketCap', leftFrame: 'latest', operator: 'gte', rightType: 'value', value: 3000, right: 'sma200', rightFrame: '1d', multiplier: 1, tolerance: 2 };
export const tacticalDefaultCondition: Condition = { ...defaultCondition, left: 'rvol', leftFrame: '5m', value: 2 };
