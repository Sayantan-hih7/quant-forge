import { frameLabels, metrics } from '../config/metrics';
import type { Condition, Metric, Timeframe } from '../types';

const operators = { gt: 'is greater than', gte: 'is at least', lt: 'is less than', lte: 'is at most', crossAbove: 'crosses above', crossBelow: 'crosses below', within: 'is within' };
function operand(metric: Metric, frame: Timeframe) {
  return `${metrics[metric].label}${frame === 'latest' ? '' : ` on the ${frameLabels[frame].toLowerCase()} timeframe`}`;
}
export function summarizeCondition(condition: Condition) {
  const unit = metrics[condition.left].unit;
  const value = condition.value.toLocaleString('en-IN');
  const threshold = unit === '₹ Cr' ? `₹${value} crore` : unit === '₹' ? `₹${value}` : unit === '%' ? `${value}%` : unit === 'shares' ? `${value} shares` : value;
  const right = condition.rightType === 'value' ? threshold : `${condition.multiplier === 1 ? '' : `${condition.multiplier} times `}${operand(condition.right, condition.rightFrame)}`;
  return `${operand(condition.left, condition.leftFrame)} ${operators[condition.operator]} ${condition.operator === 'within' ? `${condition.tolerance}% of ` : ''}${right}.`;
}
