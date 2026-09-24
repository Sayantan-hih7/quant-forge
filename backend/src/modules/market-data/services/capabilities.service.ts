import { invariant } from '../../../shared/errors.js';
import { engineClient } from '../../engine/services/engine.service.js';
import { facts } from '../repository.js';
import { INDEX_SOURCES } from '../sources/index-membership.js';

const sourcedFacts = ['marketCap', 'debtEquity', 'pledge', 'delivery', 'roe', 'roce', 'pe', 'promoterHolding', 'fiiChange', 'diiChange', 'sector', 'index', 'turnover', 'tradedValue'];
export async function ruleCapabilities() {
  const { data } = await engineClient.get<{ technical: string[]; datedFacts: string[] }>('/capabilities');
  const snapshotFields = data.datedFacts.filter(field => sourcedFacts.includes(field));
  const sectors = await facts.distinct('value', { field: 'sector', validUntil: { $gte: new Date().toISOString() } });
  return { technical: data.technical, snapshotFields,
    monthlyFields: [...data.technical.filter(field => field !== 'vwap'), ...snapshotFields],
    choices: { index: INDEX_SOURCES.map(x => ({ value: x.id, label: x.name })), sector: sectors.filter(x => typeof x === 'string').sort().map(x => ({ value: x, label: x })) },
  };
}
export async function validateSourcedRule(rule: Record<string, unknown>) {
  await engineClient.post('/validate-rule', rule);
  const capabilities = await ruleCapabilities();
  const allowed = rule.timeframe === '1mo' ? capabilities.monthlyFields : [...capabilities.technical, ...capabilities.snapshotFields];
  for (const group of rule.groups as { conditions: Record<string, unknown>[] }[]) for (const condition of group.conditions) {
    const field = String(condition.field ?? condition.left);
    invariant(allowed.includes(field), `A verified data source is not yet available for ${field}`);
    if (condition.operand === 'field' || condition.rightType === 'indicator') {
      const right = String(condition.compareField ?? condition.right);
      invariant(allowed.includes(right), `A verified data source is not yet available for ${right}`);
    }
    if (field === 'index') invariant((condition.choices as string[]).every(id => INDEX_SOURCES.some(x => x.id === id)), 'Choose an index from the imported catalogue');
    if (field === 'sector') invariant((condition.choices as string[]).every(value => capabilities.choices.sector.some(x => x.value === value)), 'Import company sectors, then choose a reported sector');
  }
}
