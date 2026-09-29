import { z } from 'zod';

const triggerSchema = z.object({
  trigger: z.enum(['risk', 'target']),
  at: z.number().finite().min(0.1).max(20),
}).strict();
export const stopManagementSchema = z.object({
  breakeven: triggerSchema.optional(),
  trailing: triggerSchema.extend({ distanceR: z.number().finite().min(0.1).max(20) }).optional(),
}).strict();
export type StopManagement = z.infer<typeof stopManagementSchema>;
type Settings = { stopMode: string; stopValue?: number | null; entryOrderType?: string; entryLimitPrice?: number | null; stopManagement?: StopManagement; breakevenAfterTarget1?: boolean; exitTargets?: unknown[] };

export function validateStopSettings(risk: Settings, ctx: z.RefinementCtx) {
  for (const [field, needed] of [['stopValue', ['amount', 'price'].includes(risk.stopMode)], ['entryLimitPrice', risk.entryOrderType === 'limit']] as const) {
    const value = risk[field];
    if (needed && (value == null || !Number.isFinite(value) || value <= 0))
      ctx.addIssue({ code: 'custom', path: [field], message: 'Enter a positive rupee value.' });
    if (value != null && Math.abs(value * 100 - Math.round(value * 100)) > 0.000001)
      ctx.addIssue({ code: 'custom', path: [field], message: 'Use at most two decimal places for rupees.' });
  }
  if (risk.entryOrderType === 'limit' && ['price', 'amount'].includes(risk.stopMode) && risk.stopValue != null && risk.entryLimitPrice != null && risk.stopValue >= risk.entryLimitPrice)
    ctx.addIssue({ code: 'custom', path: ['stopValue'], message: 'The initial stop price or distance must be below the maximum entry price.' });
  const management = risk.stopManagement;
  if (!management) return;
  if (!management.breakeven && !management.trailing)
    ctx.addIssue({ code: 'custom', path: ['stopManagement'], message: 'Choose a stop adjustment or turn stop management off.' });
  if (risk.breakevenAfterTarget1)
    ctx.addIssue({ code: 'custom', path: ['stopManagement'], message: 'Use either the legacy breakeven option or the new stop management settings.' });
  if (management.trailing && risk.stopMode === 'trailing')
    ctx.addIssue({ code: 'custom', path: ['stopManagement', 'trailing'], message: 'Choose an initial fixed, rupee or ATR stop before configuring delayed trailing.' });
  for (const key of ['breakeven', 'trailing'] as const) {
    const rule = management[key];
    if (rule?.trigger === 'target' && (!Number.isInteger(rule.at) || rule.at < 1 || rule.at >= (risk.exitTargets?.length ?? 0)))
      ctx.addIssue({ code: 'custom', path: ['stopManagement', key, 'at'], message: 'Choose a partial target before the final exit.' });
  }
}
