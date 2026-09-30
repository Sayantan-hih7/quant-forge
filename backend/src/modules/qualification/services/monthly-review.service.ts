import { z } from 'zod';
import { reviewStrategy } from '../../strategies/services/rule-review.service.js';
import { ruleFields } from '../../../shared/rule-fields.js';
import { monthlyHistoryRequirements } from './history-requirements.js';

const condition = z.object({ field:z.string(),timeframe:z.literal('1mo').default('1mo'),operator:z.string(),operand:z.enum(['value','field']).default('value'),value:z.number().finite().default(0),compareField:z.string().default('close'),multiplier:z.number().positive().default(1),distance:z.number().default(0),lookback:z.number().default(1) }).passthrough();
export const monthlyReviewSchema = z.object({timeframe:z.literal('1mo'),logic:z.enum(['AND','OR']),groups:z.array(z.object({logic:z.enum(['AND','OR']),conditions:z.array(condition).min(1).max(12)})).min(1).max(6)}).passthrough();

export function reviewMonthlyRule(input: unknown) {
  const rule=monthlyReviewSchema.parse(input);
  const entry={logic:rule.logic,groups:rule.groups.map(g=>({...g,conditions:g.conditions.map(c=>({
    left:ruleFields[c.field]?.unit==='category'?`category:${JSON.stringify(c)}`:c.field,leftFrame:'1mo',leftPeriod:c.period,leftOffset:c.offset,leftSettings:c.settings,
    operator:c.operator,rightType:c.operand==='field'?'indicator':'value',value:c.value,upper:c.upper,lookback:c.lookback,right:c.compareField,rightFrame:'1mo',rightPeriod:c.comparePeriod,rightOffset:c.compareOffset,rightSettings:c.compareSettings,multiplier:c.multiplier,tolerance:c.distance,
  }))}))};
  const report=reviewStrategy({entry,exit:{enabled:false,groups:[]}});
  const monthly=(s:string)=>s.replace(/Buy rules/g,'Monthly rules').replace(/buy path/g,'qualification path').replace(/buy\/sell/g,'rule').replace(/Buy group/g,'Condition group').replace(/Buy/g,'Monthly');
  return {...report,issues:report.issues.map(i=>({...i,title:monthly(i.title),explanation:monthly(i.explanation),recommendation:monthly(i.recommendation),fix:i.fix?{...i.fix,expectedCondition:rule.groups[i.fix.location.group].conditions[i.fix.location.condition]}:undefined})),
    history:monthlyHistoryRequirements(rule,new Date(Date.now()+19800000).toISOString().slice(0,7)),
    positives:report.positives.map(monthly),limitations:['Checks numeric conflicts, duplicate conditions and redundant thresholds. This does not predict returns or guarantee complete company data. Technical periods always count completed months.'],
  };
}
