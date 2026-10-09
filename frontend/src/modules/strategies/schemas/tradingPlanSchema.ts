import { z } from 'zod';
import { ruleSchema } from '../../qualification/schemas/ruleSchema';
import { backtestSchema } from '../../backtesting/schemas/backtestSchema';
import { validateExitTargets } from './exitTargetsSchema';
import { validateStopSettings } from './stopSettingsSchema';

export const strategyRiskSchema = backtestSchema.innerType().pick({
  signalRanking:true,reentryCooldownMinutes:true,maxEntriesPerStockPerDay:true,dailyLossLimitPercent:true,maxEntryDeviationPercent:true,entryCutoffMinute:true,costModel:true,exchangeFeePercent:true,initialCapital: true, riskPercent: true, maxPositions: true, timeframe: true,
  stopMode: true, stopPercent: true, atrPeriod: true, atrMultiplier: true,
  maxStopPercent: true,
  targetR: true, overnight: true, slippagePercent: true, feePercent: true,
  exitTargets: true, breakevenAfterTarget1: true,
  stopValue: true, stopManagement: true, entryOrderType: true, entryLimitPrice: true,
}).superRefine(validateExitTargets).superRefine(validateStopSettings).refine((risk) => risk.timeframe !== '1d' || risk.overnight, { path: ['overnight'], message: 'Daily execution requires overnight holding.' }).transform(risk => {
  // Hidden RHF controls can retain saved defaults during mode changes. Send only
  // values belonging to the selected mode; never submit an inactive price.
  const active = { ...risk };
  if (active.maxStopPercent == null) delete active.maxStopPercent;
  if (active.exitTargets) active.exitTargets = active.exitTargets.map(target => {
    const next = { ...target };
    if (next.moveStopTo === null) delete next.moveStopTo;
    return next;
  });
  if (active.entryOrderType !== 'limit') delete active.entryLimitPrice;
  if (active.stopMode !== 'price' && active.stopMode !== 'amount') delete active.stopValue;
  return active;
});
export type StrategyRisk = z.infer<typeof strategyRiskSchema>;
export const tradingPlanSchema = z.object({ name: z.string().trim().min(3).max(50), entry: ruleSchema, exit: ruleSchema, risk: strategyRiskSchema }).superRefine((plan, ctx) => {
  if (plan.entry.side !== 'BUY' || plan.exit.side !== 'SELL' || plan.entry.tier !== 'tactical' || plan.exit.tier !== 'tactical') ctx.addIssue({ code: 'custom', message: 'A strategy needs a tactical buy entry and sell exit.' });
  if (plan.entry.horizon !== plan.exit.horizon) ctx.addIssue({ code: 'custom', message: 'Buy and sell rules must use the same trading horizon.' });
  if (plan.entry.cadence !== plan.exit.cadence) ctx.addIssue({ code: 'custom', path: ['entry', 'cadence'], message: 'Buy and sell rules must use the same check frequency.' });
  if (plan.entry.horizon === 'intraday' && plan.entry.cadence === 'daily') ctx.addIssue({ code: 'custom', path: ['entry', 'cadence'], message: 'Intraday strategies need a check frequency within the session.' });
  if (plan.entry.horizon === 'intraday' && plan.risk.overnight) ctx.addIssue({ code: 'custom', path: ['risk', 'overnight'], message: 'Intraday strategies must close within the session.' });
  if (plan.entry.horizon !== 'intraday' && !plan.risk.overnight) ctx.addIssue({ code: 'custom', path: ['risk', 'overnight'], message: 'Swing and long-term strategies require overnight holding.' });
});
export const strategyPromptSchema = z.object({ prompt: z.string().trim().min(3, 'Describe what you would like to change.').max(1200, 'Keep your request under 1,200 characters.') });
