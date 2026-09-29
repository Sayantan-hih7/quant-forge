import { AppError } from '../../../shared/errors.js';
import { riskSchema, type Risk } from '../../strategies/validations/strategy.validation.js';

type Feature = 'partialExits' | 'breakeven' | 'trailing';
type Decisions = Record<Feature, 'keep' | 'set' | 'remove'>;
function features(risk: Risk) {
  return {
    partialExits: risk.exitTargets?.map(target => ({ basis: target.basis ?? 'percent', value: (target.basis ?? 'percent') === 'percent' ? target.profitPercent : target.value, closePercent: target.closePercent, ...(target.moveStopTo !== undefined ? {moveStopTo:target.moveStopTo} : {}) })) ?? null,
    breakeven: risk.stopManagement?.breakeven ?? (risk.breakevenAfterTarget1 ? { trigger: 'target', at: 1 } : risk.exitTargets?.some(t => t.moveStopTo === 0) ? { targetSteps: risk.exitTargets.flatMap((t,i) => t.moveStopTo === 0 ? [i+1] : []) } : null),
    trailing: risk.stopMode === 'trailing' ? { fromEntryPercent: risk.stopPercent } : risk.stopManagement?.trailing ?? null,
  };
}

export function validateRiskIntent(next: Risk, decisions: Decisions, previous?: unknown) {
  const after = features(next), parsed = riskSchema.safeParse(previous);
  const before = parsed.success ? features(parsed.data) : undefined;
  for (const key of ['partialExits', 'breakeven', 'trailing'] as const) {
    if (decisions[key] === 'set' && !after[key] || decisions[key] === 'remove' && after[key])
      throw new AppError(422, 'AI_MISSING_SETTING', `The confirmed request requires ${key} to be ${decisions[key] === 'set' ? 'configured' : 'removed'} in risk. Include the actual fields, not just an explanation.`);
    if (decisions[key] === 'keep' && before && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      throw new AppError(422, 'AI_CHANGED_SETTING', `Preserve the existing ${key} exactly. The user did not request changing it.`);
  }
}
