import type { TradingPlanDraft } from '../types/tradingPlan';
import type { RuleReviewIssue } from '../types/ruleReview';
const same=(a:object,b:object)=>JSON.stringify(a,Object.keys(a).sort())===JSON.stringify(b,Object.keys(b).sort());

/** A reviewed suggestion changes one draft condition, never saved/running rules. */
export function applyRuleReviewFix(draft:TradingPlanDraft,issue:RuleReviewIssue):TradingPlanDraft|undefined {
  const fix=issue.fix;if(!fix||fix.kind!=='remove-condition')return;
  const {side,group,condition}=fix.location,g=draft[side].groups[group];
  if(!g||g.conditions.length<=1||!g.conditions[condition]||!same(g.conditions[condition],fix.expectedCondition))return;
  const next=structuredClone(draft);next[side].groups[group].conditions.splice(condition,1);return next;
}
