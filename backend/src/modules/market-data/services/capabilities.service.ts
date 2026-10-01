import { invariant } from '../../../shared/errors.js';
import { engineClient } from '../../engine/services/engine.service.js';
import { facts, sourceRuns } from '../repository.js';
import { INDEX_SOURCES } from '../sources/index-membership.js';
import { ruleFields } from '../../../shared/rule-fields.js';

const sourcedFacts = ['marketCap', 'debtEquity', 'pledge', 'delivery', 'roe', 'roce', 'pe', 'promoterHolding', 'fiiChange', 'diiChange', 'sector', 'index', 'turnover', 'tradedValue',
  'newsSentiment7d', 'newsSentiment30d', 'newsCount7d', 'newsPositive30d', 'newsNegative30d', 'newsMood7d'];
const NEWS_MOODS = ['Positive', 'Neutral', 'Negative', 'No coverage'].map(value => ({ value, label: value }));
type Choice = { value: string; label: string };
export interface RuleCapabilities { technical: string[]; snapshotFields: string[]; monthlyFields: string[]; choices: { index: Choice[]; sector: Choice[]; newsMood7d?: Choice[] } }
export async function ruleCapabilities(): Promise<RuleCapabilities> {
  const { data } = await engineClient.get<{ technical: string[]; datedFacts: string[] }>('/capabilities');
  const snapshotFields = data.datedFacts.filter(field => sourcedFacts.includes(field));
  const [sectors, membership] = await Promise.all([
    facts.distinct('value', { field: 'sector', validUntil: { $gte: new Date().toISOString() } }),
    sourceRuns.findOne({ source: 'memberships', status: { $in: ['completed', 'partial'] } }).sort({ startedAt: -1 }).select('details').lean(),
  ]);
  // Only indices with verified constituents in the latest snapshot can be chosen.
  const covered = Array.isArray(membership?.details?.coverage) ? membership.details.coverage as string[] : null;
  return { technical: data.technical, snapshotFields,
    monthlyFields: [...data.technical, ...snapshotFields].filter(field => ruleFields[field]?.monthly),
    choices: { index: INDEX_SOURCES.filter(x => !covered || covered.includes(x.id)).map(x => ({ value: x.id, label: x.name })), sector: sectors.filter(x => typeof x === 'string').sort().map(x => ({ value: x, label: x })), newsMood7d: NEWS_MOODS },
  };
}
export async function validateSourcedRule(rule: Record<string, unknown>) {
  await engineClient.post('/validate-rule', rule);
  if (rule.enabled === false) return;
  const capabilities = await ruleCapabilities();
  const allowed = rule.timeframe === '1mo' ? capabilities.monthlyFields : [...capabilities.technical, ...capabilities.snapshotFields];
  for (const group of rule.groups as { conditions: Record<string, unknown>[] }[]) for (const condition of group.conditions) {
    const field = String(condition.field ?? condition.left);
    invariant(allowed.includes(field), `A verified data source is not yet available for ${field}`);
    if (condition.operand === 'field' || condition.rightType === 'indicator') {
      const right = String(condition.compareField ?? condition.right);
      invariant(allowed.includes(right), `A verified data source is not yet available for ${right}`);
    }
    if (field === 'index') invariant((condition.choices as string[]).every(id => capabilities.choices.index.some(x => x.value === id)), 'Choose an index from the imported catalogue');
    if (field === 'sector') invariant((condition.choices as string[]).every(value => capabilities.choices.sector.some(x => x.value === value)), 'Import company sectors, then choose a reported sector');
  }
}
