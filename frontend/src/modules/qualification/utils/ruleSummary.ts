import { fieldLabel } from '../config/ruleFields';
import { frameLabels, metrics } from '../config/metrics';
import type { Condition, Metric, Timeframe } from '../types';

const operators = {
  gt: 'is greater than', gte: 'is at least', lt: 'is less than', lte: 'is at most', eq: 'equals', neq: 'does not equal',
  crossAbove: 'crosses above', crossBelow: 'crosses below', within: 'is within', aboveBy: 'is above by at least', belowBy: 'is below by at least',
  between: 'is between', notBetween: 'is not between', increasing: 'has increased over', decreasing: 'has decreased over',
};
function operand(metric: Metric, frame: Timeframe, period?: number, offset?: number) {
  return `${fieldLabel(metric, period, offset)}${frame === 'latest' ? '' : ` on the ${frameLabels[frame].toLowerCase()} timeframe`}`;
}
function formatValue(metric: Metric, value: number) {
  const unit = metrics[metric].unit;
  const text = value.toLocaleString('en-IN');
  return unit === '₹ Cr' ? `₹${text} crore` : unit === '₹' ? `₹${text}` : unit === '%' ? `${text}%` : unit === 'shares' ? `${text} shares` : text;
}
export function summarizeCondition(condition: Condition) {
  const left = operand(condition.left, condition.leftFrame, condition.leftPeriod, condition.leftOffset);
  if (condition.operator === 'between' || condition.operator === 'notBetween') {
    return `${left} ${operators[condition.operator]} ${formatValue(condition.left, condition.value)} and ${formatValue(condition.left, condition.upper ?? condition.value)}.`;
  }
  if (condition.operator === 'increasing' || condition.operator === 'decreasing') {
    return `${left} ${operators[condition.operator]} the last ${condition.lookback ?? 3} candles.`;
  }
  const right = condition.rightType === 'value' ? formatValue(condition.left, condition.value) : `${condition.multiplier === 1 ? '' : `${condition.multiplier} times `}${operand(condition.right, condition.rightFrame, condition.rightPeriod, condition.rightOffset)}`;
  const distance = ['within', 'aboveBy', 'belowBy'].includes(condition.operator) ? `${condition.tolerance}% of ` : '';
  const occurrence = condition.operator.startsWith('cross') && (condition.lookback ?? 1) > 1 ? ` within the last ${condition.lookback} completed candles` : '';
  return `${left} ${operators[condition.operator]} ${distance}${right}${occurrence}.`;
}
