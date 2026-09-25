import { monthlyConditionSummary } from '../utils/monthlySummary';
import type { MonthlyRuleDefinition } from '../types/monthly';
import '../../../styles/scan-jobs.css';

export function MonthlyRuleSummary({ rule }: { rule: MonthlyRuleDefinition }) {
  return <div className="q-rule-summary"><span className="q-eyebrow">MONTHLY QUALIFICATION · COMPLETED CANDLES ONLY</span><h3>Qualification conditions</h3><p className="q-summary-intro">A stock qualifies when {(rule.groups.length === 1 ? rule.groups[0].logic : rule.logic) === 'AND' ? 'all' : 'any'} {rule.groups.length === 1 ? 'conditions' : 'condition groups'} match.</p>
    {rule.groups.map((group, index) => <div className="q-summary-group" key={index}><strong>{rule.groups.length > 1 ? `Group ${index + 1} · ` : ''}{group.logic === 'AND' ? 'Meet every condition (AND)' : 'Meet at least one condition (OR)'}</strong><ul>{group.conditions.map((condition, ci) => <li key={ci}>{monthlyConditionSummary(condition)}</li>)}</ul></div>)}
    <p className="q-summary-note">Technical rules use completed monthly candles. Company and exchange filters use dated observations available at the scan cutoff. This summary does not scan stocks.</p>
    {rule.groups.some(group => group.conditions.some(condition => condition.field === 'pledge')) && <p className="q-summary-note">Promoter pledge limits include all reported promoter encumbrances. A verified company with no promoters meets a nonnegative maximum limit; its percentage is shown as not applicable. Missing filings never count as zero.</p>}
  </div>;
}
