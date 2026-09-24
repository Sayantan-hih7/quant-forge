import { horizonLabels } from '../config/metrics';
import { summarizeCondition } from '../utils/ruleSummary';
import type { RuleDefinition } from '../types';

export function RuleSummary({ rule }: { rule: RuleDefinition }) {
  return <div className="q-rule-summary">
    <span className="q-eyebrow">{rule.tier === 'base' ? 'MONTHLY BASE RULE' : `${horizonLabels[rule.horizon].toUpperCase()} · ${rule.side} SIGNAL`}</span>
    <h3>{rule.name}</h3>
    {rule.description && <p>{rule.description}</p>}
    <p className="q-summary-intro">{rule.tier === 'base' ? 'A stock qualifies' : `Generate a ${rule.side.toLowerCase()} alert`} when {(rule.groups.length === 1 ? rule.groups[0].logic : rule.logic) === 'AND' ? 'all' : 'any'} of the following {rule.groups.length === 1 ? 'conditions are met' : 'groups match'}:</p>
    {rule.groups.map((group, index) => <div className="q-summary-group" key={index}>
      {rule.groups.length > 1 && <strong>Group {index + 1} · {group.logic === 'AND' ? 'Meet every condition' : 'Meet at least one condition'}</strong>}
      {rule.groups.length === 1 && <strong>{group.logic === 'AND' ? 'Meet every condition (AND)' : 'Meet at least one condition (OR)'}</strong>}
      <ul>{group.conditions.map((condition, conditionIndex) => <li key={conditionIndex}>{summarizeCondition(condition)}</li>)}</ul>
    </div>)}
    <div className="q-summary-scope"><span>Applies to</span><strong>{rule.tier === 'base' ? 'Full stock universe · monthly qualification' : 'Published monthly candidates only'}</strong></div>
  </div>;
}
