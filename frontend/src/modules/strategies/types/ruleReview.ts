import type { Condition } from '../../qualification/types';
export interface ConditionLocation { side: 'entry' | 'exit'; group: number; condition: number }
export interface RuleReviewIssue {
  id:string;severity:'error'|'warning'|'suggestion';title:string;explanation:string;recommendation:string;
  section:'entry'|'exit'|'risk'|'setup';locations:ConditionLocation[];
  fix?:{kind:'remove-condition';label:string;location:ConditionLocation;expectedCondition:Condition};
}
export interface RuleReviewReport { fingerprint:string;blocked:boolean;issues:RuleReviewIssue[];positives:string[];limitations:string[] }
