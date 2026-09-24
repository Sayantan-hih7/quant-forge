import { expect, test } from '@playwright/test';
import { initialTemplates } from '../src/modules/qualification/config/templates';
import { defaultCondition } from '../src/modules/qualification/config/metrics';
import { mockMarket, metricValue } from '../src/modules/qualification/api/mockMarket';
import { createMonthlyCache, previewBaseRule, scanCachedCandidates } from '../src/modules/qualification/api/mockQualification';
import { ruleMatches, conditionMatches } from '../src/modules/qualification/utils/evaluateRules';
import { ruleSchema } from '../src/modules/qualification/schemas/ruleSchema';
import type { Condition, RuleTemplate } from '../src/modules/qualification/types';

test('base presets filter all 6,200 synthetic records to reproducible candidate pools', () => {
  expect(mockMarket).toHaveLength(6200);
  expect(initialTemplates.filter((rule) => rule.tier === 'base').map((rule) => previewBaseRule(rule).length)).toEqual([62, 80, 36]);
});

test('indicator comparisons, volume multiples, proximity and crossovers evaluate their operands', () => {
  const stock = mockMarket[19];
  const volume: Condition = { ...defaultCondition, left: 'volume', leftFrame: '5m', operator: 'gt', rightType: 'indicator', right: 'avgVolume20', rightFrame: '1d', multiplier: 2 };
  expect(conditionMatches(stock, volume)).toBe(metricValue(stock, 'volume', '5m') > 2 * stock.avgVolume20);
  expect(conditionMatches(stock, { ...volume, multiplier: 4 })).toBe(false);
  const cross: Condition = { ...volume, left: 'ema5', right: 'ema20', leftFrame: '5m', rightFrame: '5m', multiplier: 1, operator: 'crossAbove' };
  expect(conditionMatches(stock, cross)).toBe(true);
  expect(conditionMatches(mockMarket[18], cross)).toBe(false);
  expect(conditionMatches(stock, { ...cross, left: 'close', operator: 'within', tolerance: 2 })).toBe(true);
  expect(conditionMatches(stock, { ...cross, left: 'close', operator: 'within', tolerance: .1 })).toBe(false);
});

test('AND/OR connectors compose groups without silently flattening their meaning', () => {
  const yes = { ...defaultCondition, value: 1 };
  const no = { ...defaultCondition, value: 99999999 };
  const rule: RuleTemplate = { ...initialTemplates[0], groups: [{ logic: 'OR', conditions: [yes, no] }, { logic: 'AND', conditions: [no] }], logic: 'AND' };
  expect(ruleMatches(mockMarket[0], rule)).toBe(false);
  expect(ruleMatches(mockMarket[0], { ...rule, logic: 'OR' })).toBe(true);
  expect(ruleMatches(mockMarket[0], { ...rule, groups: [{ logic: 'AND', conditions: [yes, no] }] })).toBe(false);
});

test('Stage 2 reads only supplied candidates even when excluded symbols would match', () => {
  const cache = createMonthlyCache(initialTemplates[0], '2026-09', Date.parse('2026-09-01T02:00:00+05:30'));
  const rule: RuleTemplate = { ...initialTemplates[3], groups: [{ logic: 'AND', conditions: [{ ...defaultCondition, value: 0 }] }] };
  const limited = { ...cache, candidates: [cache.candidates[0], cache.candidates[8]] };
  const result = scanCachedCandidates(limited, rule, Date.parse('2026-09-17'));
  expect(result.scannedCount).toBe(2);
  expect(result.signals.map((signal) => signal.symbol)).toEqual(limited.candidates.map((stock) => stock.symbol));
  expect(scanCachedCandidates({ ...cache, candidates: [] }, rule, 0).signals).toEqual([]);
  const sell = scanCachedCandidates(limited, { ...rule, side: 'SELL' }, 0).signals[0];
  expect(sell.stopLoss).toBeGreaterThan(sell.entry);
  expect(sell.target).toBeLessThan(sell.entry);
});

test('Zod rejects incompatible indicator units, unsupported base timeframes and mixed-frame crossovers', () => {
  const rule = structuredClone(initialTemplates[3]);
  rule.groups[0].conditions[0].right = 'avgVolume20';
  expect(ruleSchema.safeParse(rule).success).toBe(false);
  const base = structuredClone(initialTemplates[0]);
  base.groups[0].conditions[0].leftFrame = '5m';
  expect(ruleSchema.safeParse(base).success).toBe(false);
  const cross = structuredClone(initialTemplates[3]);
  cross.groups[0].conditions[0].operator = 'crossAbove';
  cross.groups[0].conditions[0].rightFrame = '5m';
  expect(ruleSchema.safeParse(cross).success).toBe(false);
  expect(initialTemplates.every((template) => ruleSchema.safeParse(template).success)).toBe(true);
});
