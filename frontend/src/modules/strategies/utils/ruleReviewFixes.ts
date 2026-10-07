import type { TradingPlanDraft } from '../types/tradingPlan';
import type { RuleReviewIssue } from '../types/ruleReview';
import { tradingPlanSchema } from '../schemas/tradingPlanSchema';
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])) : value;
const same=(a:object,b:object)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

/** Applies a reviewed, stale-checked change to a clone. Never saves or changes a session. */
export function applyRuleReviewFix(draft:TradingPlanDraft,issue:RuleReviewIssue):TradingPlanDraft|undefined {
  const fix=issue.fix;if(!fix)return;
  if(fix.kind==='replace-draft'){
    if(!same(draft,fix.expectedDraft)||!tradingPlanSchema.safeParse(fix.replacement).success)return;
    return structuredClone(fix.replacement);
  }
  const next=structuredClone(draft);
  if(fix.kind==='update-risk') {
    if(!same(draft.risk,fix.expectedRisk))return;
    next.risk=structuredClone(fix.replacement);
  } else {
    const {side,group,condition}=fix.location,g=draft[side].groups[group];
    if(!g?.conditions[condition]||!same(g.conditions[condition],fix.expectedCondition))return;
    if(fix.kind==='remove-condition') {
      if(g.conditions.length<=1)return;
      next[side].groups[group].conditions.splice(condition,1);
    } else next[side].groups[group].conditions[condition]=structuredClone(fix.replacement);
  }
  return tradingPlanSchema.safeParse(next).success?next:undefined;
}
