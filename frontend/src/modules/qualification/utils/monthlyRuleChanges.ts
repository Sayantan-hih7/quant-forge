import { isDistance, isRange, isTrend } from '../config/monthlyFields';
import type { MonthlyCondition, MonthlyRuleDefinition } from '../types/monthly';
import type { MonthlyCache, QualificationWorkspace } from '../types';
import { isScanActive } from './scanJobs';

// Compare the conditions that actually run, ignoring labels, revisions, row order,
// and values belonging to hidden/inactive inputs.
function conditionKey(condition: MonthlyCondition) {
  const { field, timeframe, operator } = condition;
  const base = { field, timeframe, operator };
  if (['is', 'isNot', 'in', 'notIn'].includes(operator)) return { ...base, choices: [...new Set(condition.choices)].sort(), ...(condition.category === 'patterns' ? { lookback: condition.lookback } : {}) };
  if (['contains', 'notContains'].includes(operator)) return { ...base, text: condition.text.trim().toLowerCase() };
  if (isTrend(operator)) return { ...base, lookback: condition.lookback };
  if (isRange(operator)) return { ...base, value: condition.value, upper: condition.upper };
  return { ...base,
    ...(condition.operand === 'field' || isDistance(operator) ? { compareField: condition.compareField, multiplier: condition.multiplier } : { value: condition.value }),
    ...(isDistance(operator) ? { distance: condition.distance } : {}),
    ...(operator.startsWith('cross') ? { lookback: condition.lookback } : {}),
  };
}
export function monthlyRuleKey(rule: MonthlyRuleDefinition) {
  const groups = rule.groups.map((group) => ({ logic: group.conditions.length === 1 ? 'AND' : group.logic, conditions: [...new Set(group.conditions.map((condition) => JSON.stringify(conditionKey(condition))))].sort() }));
  return JSON.stringify({ timeframe: rule.timeframe, logic: groups.length === 1 ? 'AND' : rule.logic, groups: groups.map((group) => JSON.stringify(group)).sort() });
}
export const monthlyRulesEqual = (left: MonthlyRuleDefinition, right: MonthlyRuleDefinition) => monthlyRuleKey(left) === monthlyRuleKey(right);
export const differsFromPublished = (rule: MonthlyRuleDefinition, cache?: MonthlyCache) => !cache || cache.rule.tier !== 'monthly' || !monthlyRulesEqual(rule, cache.rule);
export const monthlyScanPending = (workspace: QualificationWorkspace, month: string) => workspace.jobs.some((job) => job.month === month && job.kind === 'monthly' && job.rules[0].tier === 'monthly' && (isScanActive(job) || job.status === 'ready'));
export const canRunSavedMonthlyRule = (workspace: QualificationWorkspace, month: string) => workspace.monthlyRuleSaved && differsFromPublished(workspace.monthlyRule, workspace.caches[month]) && !monthlyScanPending(workspace, month);
