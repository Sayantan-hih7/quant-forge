import { z } from 'zod';

export const exitTargetSchema = z.object({
  basis: z.enum(['percent', 'amount', 'price', 'risk']).optional(),
  // InputNumber uses null for an explicitly cleared value. The refinement rejects
  // it before save; undefined would let RHF restore an old saved default.
  profitPercent: z.number().finite().min(0.1).max(1000).nullable().optional(),
  value: z.number().finite().min(0.01).max(10000000).nullable().optional(),
  closePercent: z.number().finite().min(1).max(99),
  // Explicit null prevents RHF from restoring a previously saved selection.
  // The strategy save transform omits the cleared setting from the payload.
  moveStopTo: z.number().int().min(0).max(4).nullable().optional(),
}).strict();

export type ExitTarget = z.infer<typeof exitTargetSchema>;
export type TargetBasis = NonNullable<ExitTarget['basis']>;
export const targetBasis = (target: ExitTarget): TargetBasis => target.basis ?? 'percent';
export const targetValue = (target: ExitTarget) => targetBasis(target) === 'percent' ? target.profitPercent : target.value;

export function validateExitTargets(risk: { exitTargets?: ExitTarget[]; breakevenAfterTarget1?: boolean }, ctx: z.RefinementCtx) {
  const targets = risk.exitTargets;
  if (targets?.length) {
    if (Math.abs(targets.reduce((sum, target) => sum + target.closePercent, 0) - 100) > 0.000001)
      ctx.addIssue({ code: 'custom', path: ['exitTargets'], message: 'Exit percentages must total 100% of the original position.' });
    targets.forEach((target, index) => {
      const basis = targetBasis(target), value = targetValue(target);
      const field = basis === 'percent' ? 'profitPercent' : 'value';
      const issue = (message: string, key = field) => ctx.addIssue({ code: 'custom', path: ['exitTargets', index, key], message });
      if (target.moveStopTo != null && (index === targets.length - 1 || target.moveStopTo > index))
        issue('Choose entry or an earlier target after a partial exit only.', 'moveStopTo');
      if (basis === 'risk' && value != null && (value < 0.1 || value > 20)) issue('Use a target between 0.1R and 20R.');
      if (basis !== targetBasis(targets[0])) issue('Use the same target unit for every level.', 'basis');
      if (value == null) issue(basis === 'percent' ? 'Enter a percentage gain.' : basis === 'risk' ? 'Enter a risk multiple.' : 'Enter a rupee value.');
      if (basis === 'percent' ? target.value !== undefined : target.profitPercent !== undefined)
        issue('Enter only the value for the selected target unit.');
      if ((basis === 'amount' || basis === 'price') && value != null && Math.abs(value * 100 - Math.round(value * 100)) > 0.000001)
        issue('Use at most two decimal places for rupees.');
      const previous = index ? targetValue(targets[index - 1]) : undefined;
      if (previous != null && value != null && value <= previous)
        issue('Each target must be higher than the previous target.');
    });
  } else if (risk.breakevenAfterTarget1) ctx.addIssue({ code: 'custom', path: ['breakevenAfterTarget1'], message: 'Breakeven after Target 1 requires partial exits.' });
}
