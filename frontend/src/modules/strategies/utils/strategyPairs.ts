import type { QualificationWorkspace, RuleTemplate } from '../../qualification/types';
import { initialTemplates } from '../../qualification/config/templates';
import { draftFromEntry, sampleTradingPlan } from './tradingPlans';

/** Upgrade saved single-sided rules without replacing the user's conditions. */
export function normalizeStrategyPairs(workspace: QualificationWorkspace): QualificationWorkspace {
  const templates = [...workspace.templates];
  const tradingPlans = [...(workspace.tradingPlans ?? [])];
  for (const rule of workspace.templates.filter(item => item.tier === 'tactical')) {
    if (tradingPlans.some(plan => plan.entryRuleId === rule.id || plan.exitRuleId === rule.id)) continue;
    const original = initialTemplates.find(item => item.id === rule.id);
    const untouchedDemo = !!original && JSON.stringify(original) === JSON.stringify(rule);
    const draft = rule.side === 'BUY' ? draftFromEntry(rule) : { ...sampleTradingPlan(rule.horizon), name: rule.name, exit: rule };
    const name = draft.name.replace(/ · (Buy|Sell)$/, '');
    const entryRuleId = rule.side === 'BUY' ? rule.id : `${rule.id}-buy`;
    const exitRuleId = rule.side === 'SELL' ? rule.id : `${rule.id}-sell`;
    const pair: RuleTemplate[] = [
      { ...draft.entry, id: entryRuleId, name: `${name} · Buy`, revision: rule.side === 'BUY' ? rule.revision : 1 },
      { ...draft.exit, id: exitRuleId, name: `${name} · Sell`, revision: rule.side === 'SELL' ? rule.revision : 1 },
    ];
    templates.splice(templates.findIndex(item => item.id === rule.id), 1, ...pair);
    tradingPlans.push({ id: `strategy-${rule.id}`, name, entryRuleId, exitRuleId, risk: draft.risk, updatedAt: new Date(0).toISOString(), needsReview: !untouchedDemo });
  }
  return { ...workspace, templates, tradingPlans };
}

export function savedStrategyPairs(workspace?: QualificationWorkspace) {
  if (!workspace) return [];
  return (workspace.tradingPlans ?? []).flatMap(plan => {
    const entry = workspace.templates.find(rule => rule.id === plan.entryRuleId && rule.side === 'BUY');
    const exit = workspace.templates.find(rule => rule.id === plan.exitRuleId && rule.side === 'SELL');
    return entry && exit ? [{ plan, entry, exit }] : [];
  });
}
