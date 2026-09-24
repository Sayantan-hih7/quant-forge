import { z } from 'zod';
import { ruleSchema } from '../../qualification/schemas/ruleSchema';
import { backtestSchema } from '../../backtesting/schemas/backtestSchema';

export const strategyRiskSchema = backtestSchema.innerType().pick({
  initialCapital: true, riskPercent: true, maxPositions: true, timeframe: true,
  stopMode: true, stopPercent: true, atrPeriod: true, atrMultiplier: true,
  targetR: true, overnight: true, slippagePercent: true, feePercent: true,
}).refine((risk) => risk.timeframe !== '1d' || risk.overnight, { path: ['overnight'], message: 'Daily execution requires overnight holding.' });
export type StrategyRisk = z.infer<typeof strategyRiskSchema>;
export const tradingPlanSchema = z.object({ name: z.string().trim().min(3).max(50), entry: ruleSchema, exit: ruleSchema, risk: strategyRiskSchema }).superRefine((plan, ctx) => {
  if (plan.entry.side !== 'BUY' || plan.exit.side !== 'SELL' || plan.entry.tier !== 'tactical' || plan.exit.tier !== 'tactical') ctx.addIssue({ code: 'custom', message: 'A strategy needs a tactical buy entry and sell exit.' });
  if (plan.entry.horizon !== plan.exit.horizon) ctx.addIssue({ code: 'custom', message: 'Buy and sell rules must use the same trading horizon.' });
  if (plan.entry.horizon === 'intraday' && plan.risk.overnight) ctx.addIssue({ code: 'custom', path: ['risk', 'overnight'], message: 'Intraday strategies must close within the session.' });
  if (plan.entry.horizon !== 'intraday' && !plan.risk.overnight) ctx.addIssue({ code: 'custom', path: ['risk', 'overnight'], message: 'Swing and long-term strategies require overnight holding.' });
});
export const strategyPromptSchema = z.object({ prompt: z.string().trim().min(3, 'Describe what you would like to change.').max(1200, 'Keep your request under 1,200 characters.') });
