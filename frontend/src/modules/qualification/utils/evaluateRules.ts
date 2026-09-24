import { metricValue } from '../api/mockMarket';
import type { CandidateStock, Condition, RuleDefinition } from '../types';

export function conditionMatches(stock: CandidateStock, condition: Condition): boolean {
  const left = metricValue(stock, condition.left, condition.leftFrame);
  const right = condition.rightType === 'value' ? condition.value : metricValue(stock, condition.right, condition.rightFrame) * condition.multiplier;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  switch (condition.operator) {
    case 'gt': return left > right;
    case 'gte': return left >= right;
    case 'lt': return left < right;
    case 'lte': return left <= right;
    case 'within': return right !== 0 && Math.abs(left - right) / Math.abs(right) * 100 <= condition.tolerance;
    case 'crossAbove': return left > right && metricValue(stock, condition.left, condition.leftFrame, true) <= metricValue(stock, condition.right, condition.rightFrame, true) * condition.multiplier;
    case 'crossBelow': return left < right && metricValue(stock, condition.left, condition.leftFrame, true) >= metricValue(stock, condition.right, condition.rightFrame, true) * condition.multiplier;
  }
}
export function ruleMatches(stock: CandidateStock, rule: RuleDefinition) {
  const matches = rule.groups.map((group) => group.logic === 'AND' ? group.conditions.every((condition) => conditionMatches(stock, condition)) : group.conditions.some((condition) => conditionMatches(stock, condition)));
  return rule.logic === 'AND' ? matches.every(Boolean) : matches.some(Boolean);
}
