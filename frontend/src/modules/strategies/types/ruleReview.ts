import type { TradingPlanDraft } from './tradingPlan';
import type { Condition } from '../../qualification/types';
export interface ConditionLocation { side: 'entry' | 'exit'; group: number; condition: number }
export interface RuleReviewIssue {
  id:string;severity:'error'|'warning'|'suggestion';title:string;explanation:string;recommendation:string;
  section:'entry'|'exit'|'risk'|'setup';locations:ConditionLocation[];
  fix?:{kind:'replace-draft';label:string;expectedDraft:TradingPlanDraft;replacement:TradingPlanDraft}
    | {kind:'remove-condition';label:string;location:ConditionLocation;expectedCondition:Condition}
    | {kind:'replace-condition';label:string;location:ConditionLocation;expectedCondition:Condition;replacement:Condition}
    | {kind:'update-risk';label:string;expectedRisk:TradingPlanDraft['risk'];replacement:TradingPlanDraft['risk']};
}
export interface RuleReviewReport { fingerprint:string;blocked:boolean;issues:RuleReviewIssue[];positives:string[];limitations:string[] }
