import { z } from 'zod';
import { exitTargetSchema, validateExitTargets } from './exit-targets.js';
import { stopManagementSchema, validateStopSettings } from './stop-settings.js';
export const riskSchema = z.object({
  initialCapital: z.number().min(1000).max(100000000), riskPercent: z.number().min(0.1).max(5),
  maxPositions: z.number().int().min(1).max(20), timeframe: z.enum(['1m', '5m', '15m', '1h', '1d']),
  stopMode: z.enum(['fixed', 'ATR', 'trailing', 'amount', 'price', 'candleLow']), stopPercent: z.number().min(0.1).max(25),
  stopValue: z.number().finite().min(0.01).max(10000000).optional(),
  maxStopPercent: z.number().finite().min(0.1).max(25).optional(),
  entryOrderType: z.enum(['market', 'limit']).optional(),
  entryLimitPrice: z.number().finite().min(0.01).max(10000000).optional(),
  stopManagement: stopManagementSchema.optional(),
  atrPeriod: z.number().int().min(2).max(100), atrMultiplier: z.number().min(0.5).max(10),
  targetR: z.number().min(0.5).max(10), overnight: z.boolean(),
  exitTargets: z.array(exitTargetSchema).min(2).max(5).optional(),
  breakevenAfterTarget1: z.boolean().optional(),
  slippagePercent: z.number().min(0).max(2), feePercent: z.number().min(0).max(2),
}).strict().superRefine(validateExitTargets).superRefine(validateStopSettings).refine(x => x.timeframe !== '1d' || x.overnight, 'Daily strategies must allow overnight holding');
export const strategySchema = z.object({ name: z.string().trim().min(2).max(50), entry: z.record(z.unknown()), exit: z.record(z.unknown()), risk: riskSchema }).strict();
export const saveStrategySchema = z.object({ draft: strategySchema, expectedRevision: z.number().int().min(0) }).strict();
export type StrategyDraft = z.infer<typeof strategySchema>;
export type Risk = z.infer<typeof riskSchema>;
