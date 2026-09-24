import { z } from 'zod';
export const riskSchema = z.object({
  initialCapital: z.number().min(1000).max(100000000), riskPercent: z.number().min(0.1).max(5),
  maxPositions: z.number().int().min(1).max(20), timeframe: z.enum(['1m', '5m', '15m', '1h', '1d']),
  stopMode: z.enum(['fixed', 'ATR', 'trailing']), stopPercent: z.number().min(0.1).max(25),
  atrPeriod: z.number().int().min(2).max(100), atrMultiplier: z.number().min(0.5).max(10),
  targetR: z.number().min(0.5).max(10), overnight: z.boolean(),
  slippagePercent: z.number().min(0).max(2), feePercent: z.number().min(0).max(2),
}).strict().refine(x => x.timeframe !== '1d' || x.overnight, 'Daily strategies must allow overnight holding');
export const strategySchema = z.object({ name: z.string().trim().min(2).max(50), entry: z.record(z.unknown()), exit: z.record(z.unknown()), risk: riskSchema }).strict();
export const saveStrategySchema = z.object({ draft: strategySchema, expectedRevision: z.number().int().min(0) }).strict();
export type StrategyDraft = z.infer<typeof strategySchema>;
export type Risk = z.infer<typeof riskSchema>;
