import { z } from 'zod';
import { instrumentIdSchema } from '../../market-data/validations/market-data.validation.js';
export const feedConnectSchema = z.object({ ids: z.array(instrumentIdSchema).max(5000), provider: z.enum(['auto', 'motilal', 'dhan']).default('auto') }).strict();
export const feedOtpSchema = z.object({ otp: z.string().regex(/^\d{6}$/, 'Enter the six-digit OTP') }).strict();
