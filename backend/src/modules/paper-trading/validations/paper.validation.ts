import { z } from 'zod';
import { instrumentIdSchema } from '../../market-data/validations/market-data.validation.js';
export const runnerScopeSchema = z.object({strategyId:z.string().uuid(),expectedRevision:z.number().int().positive().optional(),ids:z.array(instrumentIdSchema).min(1).max(100)}).strict();
export const sessionSchema = runnerScopeSchema.extend({mode:z.enum(['automatic','confirmation'])}).strict();
export const orderSchema = z.object({id:z.string().uuid(),sessionId:z.string().uuid(),instrumentId:instrumentIdSchema,side:z.enum(['BUY','SELL']),quantity:z.number().int().min(1).max(1000000)}).strict();
export const controlSchema = z.object({entriesPaused:z.boolean()}).strict();
