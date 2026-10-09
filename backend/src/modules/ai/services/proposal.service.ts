import { parameterError } from '../../../shared/rule-fields.js';
import { AppError, invariant } from '../../../shared/errors.js';
import { monthlyCatalog, tradingCatalog } from '../config/rule-catalog.js';
import { monthlyProposalSchema, tradingProposalSchema, riskProposalSchema } from '../validations/ai.validation.js';
import type { ruleCapabilities } from '../../market-data/services/capabilities.service.js';

export type Capabilities = Awaited<ReturnType<typeof ruleCapabilities>>;
export function monthlyDraft(value: unknown, capabilities: Capabilities) {
  const proposal = monthlyProposalSchema.parse(value);
  for (const condition of proposal.conditions) {
    const field = monthlyCatalog[condition.field];
    for (const [id, period, offset, settings] of [[condition.field, condition.period, condition.offset, condition.settings], ...(condition.operand === 'field' ? [[condition.compareField, condition.comparePeriod, condition.compareOffset, condition.compareSettings]] : [])] as [string, number | undefined, number | undefined, import('../../../shared/indicator-settings.js').CalculationSettings | undefined][]) {
      const error = parameterError(id, period, offset, settings); invariant(!error, error ?? 'Invalid parameters');
    }
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
  const ruleErrors: string[] = [];
  for (const [sideName, side] of [['Buy',proposal.entry],['Sell',proposal.exit]] as const) for (const [groupIndex, group] of (side.enabled === false ? [] : side.groups).entries()) for (const [conditionIndex, condition] of group.conditions.entries()) {
    const requireRule = (valid: unknown, reason: string, suggestion: string) => { if (!valid) ruleErrors.push(`${sideName} rule, group ${groupIndex+1}, condition ${conditionIndex+1}: ${reason} ${suggestion}`); };
    const field = tradingCatalog[condition.left];
    for (const [id, period, offset, settings] of [[condition.left, condition.leftPeriod, condition.leftOffset, condition.leftSettings], ...(condition.rightType === 'indicator' ? [[condition.right, condition.rightPeriod, condition.rightOffset, condition.rightSettings]] : [])] as [string, number | undefined, number | undefined, import('../../../shared/indicator-settings.js').CalculationSettings | undefined][]) {
      const error = parameterError(id, period, offset, settings); requireRule(!error, error ?? 'Invalid indicator parameters.', 'Use only the parameters supported by that field; price fields have no moving-average period.');
    }
    requireRule(allowed.includes(condition.left), `${field.label} has no supported data source in this workspace.`, 'Choose an available field or configure its data source.');
    requireRule(field.frames.includes(condition.leftFrame), `${field.label} cannot use ${condition.leftFrame} candles. Supported intervals: ${field.frames.join(', ')}.`, 'Choose one of those intervals; an intraday strategy can use a completed daily filter.');
    if (condition.rightType === 'indicator') {
      const right = tradingCatalog[condition.right];
      requireRule(allowed.includes(condition.right), `${right.label} has no supported data source.`, 'Choose an available comparison field.');
      requireRule(right.frames.includes(condition.rightFrame), `${right.label} cannot use ${condition.rightFrame} candles. Supported intervals: ${right.frames.join(', ')}.`, 'Choose a supported comparison interval.');
      requireRule(right.unit === field.unit, `${field.label} (${field.unit}) cannot be compared directly with ${right.label} (${right.unit}).`, 'Compare measurements with the same units, or give each its own numeric threshold.');
    }
    if (condition.operator.startsWith('cross')) requireRule(capabilities.technical.includes(condition.left) && (condition.rightType === 'value' ||
      condition.leftFrame === condition.rightFrame && capabilities.technical.includes(condition.right)), 'This crossover needs a technical series and a fixed threshold or another series on the same timeframe.', 'Use matching intervals for a crossover, or choose an above/below comparison if that matches your intended rule.');
    if (['within', 'aboveBy', 'belowBy'].includes(condition.operator)) invariant(condition.rightType === 'indicator', 'Distance conditions need a comparison indicator');
    if (['between', 'notBetween'].includes(condition.operator)) invariant(condition.rightType === 'value' && condition.upper !== undefined && condition.upper > condition.value, 'Range conditions need a fixed lower and upper value');
    if (['increasing', 'decreasing'].includes(condition.operator)) invariant((condition.lookback ?? 0) >= 2, 'Trend conditions need a candle lookback of at least 2');
  }
  if (ruleErrors.length) throw new AppError(422, 'AI_RULE_CONSTRAINT', ruleErrors.slice(0,8).join('\n'));
  const side = (direction: 'BUY' | 'SELL') => ({ ...proposal[direction === 'BUY' ? 'entry' : 'exit'],
    name: `${proposal.name.slice(0, 48)} · ${direction === 'BUY' ? 'Buy' : 'Sell'}`, description: '',
    tier: 'tactical' as const, horizon: proposal.horizon, cadence: proposal.cadence, side: direction,
  });
  return { name: proposal.name, entry: side('BUY'), exit: side('SELL'), risk: proposal.risk };
}

export function riskDraft(value: unknown, currentDraft?: Record<string, unknown>) {
  const proposal = riskProposalSchema.parse(value);
  const horizon = (currentDraft?.entry as { horizon?: unknown } | undefined)?.horizon;
  invariant(['intraday', 'swing', 'long-term'].includes(String(horizon)), 'Choose a trading horizon in Setup first');
  invariant(proposal.risk.overnight === (horizon !== 'intraday'), 'Risk assistance must preserve the holding horizon from Setup');
  // No buy/sell/name fields exist in this schema: even a model error cannot edit them.
  return proposal;
}

/** Only editable rule fields are sent to the provider; never pass arbitrary request properties through. */
export function draftContext(scope: 'monthly' | 'strategy', draft?: Record<string, unknown>) {
  if (!draft) return null;
  const pick = (value: unknown, keys: string[]) => Object.fromEntries(keys.filter(key => value && typeof value === 'object' && key in value).map(key => [key, (value as Record<string, unknown>)[key]]));
  const groups = (value: unknown, monthly: boolean) => Array.isArray(value) ? value.slice(0, 6).map(value => {
    const group = pick(value, ['logic', 'conditions']);
    return { logic: group.logic, conditions: Array.isArray(group.conditions) ? group.conditions.slice(0, 12).map((condition: unknown) => pick(condition,
      monthly ? ['settings', 'compareSettings', 'period', 'offset', 'comparePeriod', 'compareOffset', 'field', 'operator', 'operand', 'value', 'upper', 'compareField', 'multiplier', 'distance', 'lookback', 'choices', 'timeframe']
        : ['leftSettings', 'rightSettings', 'leftPeriod', 'leftOffset', 'rightPeriod', 'rightOffset', 'left', 'leftFrame', 'operator', 'rightType', 'value', 'upper', 'lookback', 'right', 'rightFrame', 'multiplier', 'tolerance'])) : [],
    }; }) : [];
  if (scope === 'monthly') return { timeframe: '1mo', logic: draft.logic, groups: groups(draft.groups, true) };
  const side = (value: unknown) => { const base = pick(value, ['enabled', 'horizon', 'cadence', 'logic', 'side', 'groups']); return { ...base, groups: groups(base.groups, false) }; };
  const risk = pick(draft.risk, ['signalRanking', 'costModel', 'exchangeFeePercent', 'entryCutoffMinute', 'reentryCooldownMinutes', 'maxEntriesPerStockPerDay', 'dailyLossLimitPercent', 'maxEntryDeviationPercent', 'initialCapital', 'riskPercent', 'maxPositions', 'timeframe', 'stopMode', 'stopPercent', 'maxStopPercent', 'atrPeriod', 'atrMultiplier', 'stopValue', 'stopManagement', 'entryOrderType', 'entryLimitPrice', 'targetR', 'exitTargets', 'breakevenAfterTarget1', 'overnight', 'slippagePercent', 'feePercent']);
  if (risk.stopManagement && typeof risk.stopManagement === 'object') {
    const settings = risk.stopManagement as Record<string, unknown>;
    risk.stopManagement = { ...(settings.breakeven ? { breakeven: pick(settings.breakeven, ['trigger', 'at']) } : {}), ...(settings.trailing ? { trailing: pick(settings.trailing, ['trigger', 'at', 'distanceR']) } : {}) };
  }
  if (Array.isArray(risk.exitTargets)) risk.exitTargets = risk.exitTargets.slice(0, 5).map(target => pick(target, ['basis', 'profitPercent', 'value', 'closePercent', 'moveStopTo']));
  return { name: draft.name, entry: side(draft.entry), exit: side(draft.exit), risk };
}
