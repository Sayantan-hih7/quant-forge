import { invariant } from '../../../shared/errors.js';
import { monthlyCatalog, tradingCatalog } from '../config/rule-catalog.js';
import { monthlyProposalSchema, tradingProposalSchema } from '../validations/ai.validation.js';
import type { ruleCapabilities } from '../../market-data/services/capabilities.service.js';

export type Capabilities = Awaited<ReturnType<typeof ruleCapabilities>>;
export function monthlyDraft(value: unknown, capabilities: Capabilities) {
  const proposal = monthlyProposalSchema.parse(value);
  for (const condition of proposal.conditions) {
    const field = monthlyCatalog[condition.field];
    invariant(capabilities.monthlyFields.includes(condition.field), `No supported source for ${condition.field}`);
    if (field.categorical) {
      invariant(['is', 'isNot', 'in', 'notIn'].includes(condition.operator), 'Category fields require IS/IN operators');
      const options = capabilities.choices[condition.field as keyof typeof capabilities.choices] ?? [];
      invariant(condition.choices.length > 0 && condition.choices.every(choice => options.some(option => option.value === choice)), 'Choose a supported index or imported sector');
      invariant(!['is', 'isNot'].includes(condition.operator) || condition.choices.length === 1, 'IS comparisons require one category');
    } else {
      invariant(!['is', 'isNot', 'in', 'notIn'].includes(condition.operator), 'Numeric fields require numeric operators');
      invariant(!['between', 'notBetween'].includes(condition.operator) || condition.upper >= condition.value, 'Range upper bound must follow lower bound');
      if (['crossAbove', 'crossBelow', 'increasing', 'decreasing'].includes(condition.operator)) invariant(!!field.series && capabilities.technical.includes(condition.field), 'Crossovers and trends require a technical series');
      if (condition.operand === 'field' || ['within', 'aboveBy', 'belowBy'].includes(condition.operator)) {
        const right = monthlyCatalog[condition.compareField];
        invariant(capabilities.monthlyFields.includes(condition.compareField) && field.unit === right.unit && !right.categorical, 'Compare supported monthly fields with matching units');
        if (condition.operator.startsWith('cross')) invariant(!!right.series && capabilities.technical.includes(condition.compareField), 'Crossovers require two technical series');
      }
      if (['within', 'aboveBy', 'belowBy'].includes(condition.operator)) invariant(field.unit === 'price' && condition.operand === 'field', 'Distance conditions need a price and a comparison field');
    }
  }
  return { name: 'Monthly qualification', description: '', timeframe: '1mo' as const, logic: proposal.logic,
    groups: [{ logic: proposal.logic, conditions: proposal.conditions.map(condition => ({ ...condition,
      category: monthlyCatalog[condition.field].category, timeframe: '1mo' as const, text: '',
    })) }] };
}

export function tradingDraft(value: unknown, capabilities: Capabilities) {
  const proposal = tradingProposalSchema.parse(value);
  invariant(proposal.risk.overnight === (proposal.horizon !== 'intraday'), 'Overnight holding must match the trading horizon');
  const allowed = [...capabilities.technical, ...capabilities.snapshotFields];
  for (const side of [proposal.entry, proposal.exit]) for (const group of side.groups) for (const condition of group.conditions) {
    const field = tradingCatalog[condition.left];
    invariant(allowed.includes(condition.left) && field.frames.includes(condition.leftFrame), 'Unsupported trading field or timeframe');
    if (condition.rightType === 'indicator') {
      const right = tradingCatalog[condition.right];
      invariant(allowed.includes(condition.right) && right.frames.includes(condition.rightFrame) && right.unit === field.unit, 'Compare supported indicators with matching units');
    }
    if (condition.operator.startsWith('cross')) invariant(condition.rightType === 'indicator' && condition.leftFrame === condition.rightFrame
      && capabilities.technical.includes(condition.left) && capabilities.technical.includes(condition.right), 'Crossovers need two technical indicators on the same timeframe');
    if (condition.operator === 'within') invariant(condition.rightType === 'indicator', 'Distance conditions need a comparison indicator');
  }
  const side = (direction: 'BUY' | 'SELL') => ({ ...proposal[direction === 'BUY' ? 'entry' : 'exit'],
    name: `${proposal.name.slice(0, 48)} · ${direction === 'BUY' ? 'Buy' : 'Sell'}`, description: '',
    tier: 'tactical' as const, horizon: proposal.horizon, cadence: proposal.cadence, side: direction,
  });
  return { name: proposal.name, entry: side('BUY'), exit: side('SELL'), risk: proposal.risk };
}

/** Only editable rule fields are sent to the provider; never pass arbitrary request properties through. */
export function draftContext(scope: 'monthly' | 'strategy', draft?: Record<string, unknown>) {
  if (!draft) return null;
  const pick = (value: unknown, keys: string[]) => Object.fromEntries(keys.filter(key => value && typeof value === 'object' && key in value).map(key => [key, (value as Record<string, unknown>)[key]]));
  const groups = (value: unknown, monthly: boolean) => Array.isArray(value) ? value.slice(0, 6).map(value => {
    const group = pick(value, ['logic', 'conditions']);
    return { logic: group.logic, conditions: Array.isArray(group.conditions) ? group.conditions.slice(0, 12).map((condition: unknown) => pick(condition,
      monthly ? ['field', 'operator', 'operand', 'value', 'upper', 'compareField', 'multiplier', 'distance', 'lookback', 'choices', 'timeframe']
        : ['left', 'leftFrame', 'operator', 'rightType', 'value', 'right', 'rightFrame', 'multiplier', 'tolerance'])) : [],
    }; }) : [];
  if (scope === 'monthly') return { timeframe: '1mo', logic: draft.logic, groups: groups(draft.groups, true) };
  const side = (value: unknown) => { const base = pick(value, ['horizon', 'cadence', 'logic', 'side', 'groups']); return { ...base, groups: groups(base.groups, false) }; };
  return { name: draft.name, entry: side(draft.entry), exit: side(draft.exit), risk: pick(draft.risk,
    ['initialCapital', 'riskPercent', 'maxPositions', 'timeframe', 'stopMode', 'stopPercent', 'atrPeriod', 'atrMultiplier', 'targetR', 'overnight', 'slippagePercent', 'feePercent']) };
}
