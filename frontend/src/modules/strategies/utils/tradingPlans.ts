import { defaultBacktestConfig } from '../../backtesting/schemas/backtestSchema';
import { defaultExitRule } from '../../backtesting/config/backtestDefaults';
import { initialTemplates } from '../../qualification/config/templates';
import { strategyRiskSchema } from '../schemas/tradingPlanSchema';
import type { Horizon, QualificationWorkspace, RuleDefinition } from '../../qualification/types';
import type { TradingPlan, TradingPlanDraft } from '../types/tradingPlan';

export function draftFromEntry(entry: RuleDefinition): TradingPlanDraft {
  const exit = structuredClone(defaultExitRule);
  const frame = entry.horizon === 'intraday' ? '15m' : entry.horizon === 'swing' ? '1d' : '1w';
  exit.groups.forEach((group) => group.conditions.forEach((condition) => { condition.leftFrame = frame; condition.rightFrame = frame; }));
  return {
    name: entry.name.replace(/ · Buy$/, ''), entry: structuredClone(entry),
    exit: { ...exit, name: `${entry.name.slice(0, 48)} · Sell`, horizon: entry.horizon, cadence: entry.cadence, description: 'Close held shares when momentum weakens. Protective stops and targets also apply.' },
    risk: strategyRiskSchema.parse({ ...defaultBacktestConfig('', ''), timeframe: entry.horizon === 'intraday' ? '15m' : '1d', overnight: entry.horizon !== 'intraday' }),
  };
}
export function sampleTradingPlan(horizon: Horizon): TradingPlanDraft {
  return draftFromEntry(initialTemplates.find((rule) => rule.tier === 'tactical' && rule.horizon === horizon)!);
}
export function blankTradingPlan(horizon: Horizon = 'intraday'): TradingPlanDraft {
  const sample = sampleTradingPlan(horizon);
  return { ...sample, name: '', risk: { ...sample.risk, timeframe: sample.entry.cadence === 'daily' ? '1d' : sample.entry.cadence }, entry: { ...sample.entry, name: 'Buy entry', description: '', groups: [{ logic: 'AND', conditions: [] }] },
    exit: { ...sample.exit, name: 'Sell exit', description: '', groups: [{ logic: 'OR', conditions: [] }] } };
}
export function savedPlanDraft(workspace: QualificationWorkspace, plan: TradingPlan): TradingPlanDraft | undefined {
  const entry = workspace.templates.find((rule) => rule.id === plan.entryRuleId);
  const exit = workspace.templates.find((rule) => rule.id === plan.exitRuleId);
  return entry && exit ? { name: plan.name, entry, exit, risk: plan.risk } : undefined;
}
// Rule IDs/revisions are storage metadata, not changes to the strategy definition.
export function planFingerprint(plan?: TradingPlanDraft) {
  return plan ? JSON.stringify(plan, (key, value) => key === 'id' || key === 'revision' ? undefined : value) : '';
}
