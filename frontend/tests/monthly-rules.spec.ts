import { expect, test } from '@playwright/test';
import { initialMonthlyRule, monthlyOperators, newMonthlyCondition } from '../src/modules/qualification/config/monthlyFields';
import { monthlyRuleSchema } from '../src/modules/qualification/schemas/monthlyRuleSchema';
import { monthlyConditionMatches, monthlyRuleMatches } from '../src/modules/qualification/api/mockMonthly';
import { mockMarket } from '../src/modules/qualification/api/mockMarket';
import { nextMonth, previousMonth } from '../src/modules/strategies/utils/monthlyCycle';
import { canRunSavedMonthlyRule, monthlyRulesEqual } from '../src/modules/qualification/utils/monthlyRuleChanges';
import { createQualificationWorkspace } from '../src/modules/qualification/api/mockQualification';

test('rule comparison ignores labels, revisions, row order and inactive values but detects active condition changes', () => {
  const rule = structuredClone(initialMonthlyRule);
  rule.name = 'Other label';
  rule.description = 'Other description';
  rule.revision += 1;
  rule.groups[0].conditions[0].upper = 999;
  rule.groups[0].conditions[5].value = 100;
  rule.groups[0].conditions.reverse();
  expect(monthlyRulesEqual(rule, initialMonthlyRule)).toBe(true);
  rule.groups[0].conditions[0].multiplier = 2;
  expect(monthlyRulesEqual(rule, initialMonthlyRule)).toBe(false);
  rule.groups[0].conditions[0].multiplier = 1;
  rule.groups[0].logic = 'OR';
  expect(monthlyRulesEqual(rule, initialMonthlyRule)).toBe(false);
});

test('only a current-month monthly scan blocks Run; hidden legacy and past-month jobs do not', () => {
  const workspace = createQualificationWorkspace('2026-09');
  workspace.monthlyRuleSaved = true;
  workspace.monthlyRule.groups[0].conditions[2].value = 0.4;
  workspace.jobs = [{ id: 'previous-month', kind: 'monthly', status: 'ready', phase: 'done', month: '2026-08', rules: [workspace.monthlyRule], scopeCount: 6200, createdAt: 0, updatedAt: 0, progress: 100, processed: 6200 }];
  expect(canRunSavedMonthlyRule(workspace, '2026-09')).toBe(true);
  workspace.jobs[0].month = '2026-09';
  expect(canRunSavedMonthlyRule(workspace, '2026-09')).toBe(false);
  workspace.jobs[0].kind = 'trial';
  expect(canRunSavedMonthlyRule(workspace, '2026-09')).toBe(true);
});

test('qualification schema rejects daily, weekly, intraday and unknown monthly fields', () => {
  expect(monthlyRuleSchema.safeParse(initialMonthlyRule).success).toBe(true);
  for (const timeframe of ['1m', '5m', '1d', '1w', '1q', 'latest']) {
    expect(monthlyRuleSchema.safeParse({ ...initialMonthlyRule, timeframe }).success).toBe(false);
    const rule = structuredClone(initialMonthlyRule);
    Object.assign(rule.groups[0].conditions[0], { timeframe });
    expect(monthlyRuleSchema.safeParse(rule).success).toBe(false);
  }
  const unsupported = structuredClone(initialMonthlyRule);
  unsupported.groups[0].conditions[0].field = 'vwap';
  expect(monthlyRuleSchema.safeParse(unsupported).success).toBe(false);
});

test('type-specific operators reject invalid pattern math, inverted ranges and mismatched operands', () => {
  expect(monthlyOperators('candlePattern')).toEqual(['is', 'isNot', 'in', 'notIn']);
  expect(monthlyOperators('breakout')).toEqual(['is', 'isNot']);
  expect(monthlyOperators('newsText')).toEqual(['contains', 'notContains']);
  const rule = structuredClone(initialMonthlyRule);
  rule.groups[0].conditions = [{ ...newMonthlyCondition('candlePattern'), operator: 'gt' }];
  expect(monthlyRuleSchema.safeParse(rule).success).toBe(false);
  rule.groups[0].conditions = [{ ...newMonthlyCondition('rsi'), operator: 'between', value: 70, upper: 50 }];
  expect(monthlyRuleSchema.safeParse(rule).success).toBe(false);
  rule.groups[0].conditions = [{ ...newMonthlyCondition('ema5'), operand: 'field', compareField: 'volume' }];
  expect(monthlyRuleSchema.safeParse(rule).success).toBe(false);
});

test('monthly examples evaluate crossovers over six candles, delivery, volume multiples and categorical matches', () => {
  const stock = mockMarket[1];
  const cross = { ...newMonthlyCondition('ema5'), operator: 'crossAbove' as const, operand: 'field' as const, compareField: 'ema21', lookback: 6 };
  expect(monthlyConditionMatches(stock, cross)).toBe(true);
  expect(monthlyConditionMatches(stock, { ...cross, lookback: 1 })).toBe(false);
  expect(monthlyConditionMatches(stock, { ...newMonthlyCondition('delivery'), value: 40 })).toBe(true);
  expect(monthlyConditionMatches(mockMarket[4], { ...newMonthlyCondition('volume'), operator: 'gt', operand: 'field', compareField: 'avgVolume6', multiplier: 2 })).toBe(true);
  expect(monthlyConditionMatches(stock, { ...newMonthlyCondition('index'), operator: 'in', choices: ['nifty-50', 'nifty-200'] })).toBe(true);
  expect(monthlyConditionMatches(stock, { ...newMonthlyCondition('index'), operator: 'notIn', choices: ['nifty-50'] })).toBe(false);
  expect(monthlyConditionMatches(mockMarket[0], { ...newMonthlyCondition('newsText'), text: 'ORDER win' })).toBe(true);
});

test('monthly rule groups preserve AND/OR and filter the full fixture with calendar rollover', () => {
  expect(mockMarket.filter((stock) => monthlyRuleMatches(stock, initialMonthlyRule))).toHaveLength(62);
  const rule = structuredClone(initialMonthlyRule);
  rule.groups.push({ logic: 'AND', conditions: [{ ...newMonthlyCondition(), value: 99999999 }] });
  expect(monthlyRuleMatches(mockMarket[0], rule)).toBe(false);
  expect(monthlyRuleMatches(mockMarket[0], { ...rule, logic: 'OR' })).toBe(true);
  expect(nextMonth('2026-12')).toBe('2027-01');
  expect(previousMonth('2027-01')).toBe('2026-12');
});
