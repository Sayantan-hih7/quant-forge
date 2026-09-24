import { z } from 'zod';
import { instrumentIdSchema } from '../../market-data/validations/market-data.validation.js';

export const saveMonthlyRuleSchema = z.object({ rule: z.record(z.unknown()), expectedRevision: z.number().int().min(0) }).strict();
export const runIdSchema = z.string().uuid();
export const resultQuerySchema = z.object({ status: z.enum(['qualified', 'rejected', 'unavailable']).optional(), page: z.coerce.number().int().min(1).max(10000).default(1) });
export const publishSchema = z.object({ acknowledgeMissingData: z.boolean().default(false) }).strict();
export const manualStockSchema = z.object({ instrumentId: instrumentIdSchema, note: z.string().trim().min(1).max(500) }).strict();
