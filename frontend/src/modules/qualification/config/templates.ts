import type { Condition, RuleTemplate, RuleDefinition } from '../types';
import { defaultCondition } from './metrics';
const condition = (values: Partial<Condition>): Condition => ({ ...defaultCondition, ...values });
const common: Omit<RuleTemplate, 'id' | 'name' | 'groups'> = { description: '', tier: 'base', horizon: 'intraday', logic: 'AND', side: 'BUY', cadence: '5m', revision: 1 };
function base(id: string, name: string, description: string, debt: number, cap: number): RuleTemplate {
  return { ...common, id, name, description, groups: [{ logic: 'AND', conditions: [
    condition({ value: cap }),
    condition({ left: 'turnover', leftFrame: '1d', value: 5 }),
    condition({ left: 'debtEquity', operator: 'lte', value: debt }),
    condition({ left: 'pledge', operator: 'lte', value: 5 }),
    condition({ left: 'close', leftFrame: '1d', operator: 'gt', rightType: 'indicator', right: 'sma200' }),
  ] }] };
}
export const initialTemplates: RuleTemplate[] = [
  base('base-balanced', 'Balanced Quality', 'Liquidity, healthy balance sheets and an established long-term trend.', 1, 3000),
  base('base-bull', 'Bull Market Aggressive', 'A wider candidate pool with a more flexible debt threshold.', 1.5, 1000),
  base('base-bear', 'Bear Market Defensive', 'Larger companies with conservative debt exposure.', 0.4, 10000),
  { ...common, id: 'tactical-intraday', name: 'Intraday Momentum', description: 'Daily trend context with a 5-minute momentum trigger.', tier: 'tactical', groups: [
    { logic: 'AND', conditions: [condition({ left: 'close', leftFrame: '1d', operator: 'gt', rightType: 'indicator' })] },
    { logic: 'AND', conditions: [
      condition({ left: 'rvol', leftFrame: '5m', operator: 'gt', value: 2 }),
      condition({ left: 'close', leftFrame: '5m', operator: 'gt', rightType: 'indicator', right: 'vwap', rightFrame: '5m' }),
      condition({ left: 'ema5', leftFrame: '5m', rightType: 'indicator', right: 'ema20', rightFrame: '5m' }),
    ] },
  ] },
  { ...common, id: 'tactical-swing', name: 'Swing Breakouts', description: 'Daily momentum near the 20 EMA, supported by a 4-hour trend.', tier: 'tactical', horizon: 'swing', cadence: 'daily', groups: [{ logic: 'AND', conditions: [
    condition({ left: 'close', leftFrame: '4h', operator: 'gt', rightType: 'indicator' , rightFrame: '4h' }),
    condition({ left: 'rsi', leftFrame: '1d', operator: 'gt', value: 55 }),
    condition({ left: 'close', leftFrame: '1d', operator: 'within', rightType: 'indicator', right: 'ema20', tolerance: 2 }),
  ] }] },
  { ...common, id: 'tactical-long', name: 'Long-Term Accumulation', description: 'Quarterly growth with weekly momentum in a defined range.', tier: 'tactical', horizon: 'long-term', cadence: 'daily', groups: [{ logic: 'AND', conditions: [
    condition({ left: 'growth', leftFrame: '1q', operator: 'gt', value: 15 }),
    condition({ left: 'rsi', leftFrame: '1w', value: 45 }),
    condition({ left: 'rsi', leftFrame: '1w', operator: 'lte', value: 65 }),
  ] }] },
];
export function newRule(tier: RuleDefinition['tier']): RuleDefinition {
  const template = initialTemplates[tier === 'base' ? 0 : 3];
  return { ...structuredClone(template), name: '', description: '', groups: [{ logic: 'AND', conditions: [structuredClone(template.groups[0].conditions[0])] }] };
}
