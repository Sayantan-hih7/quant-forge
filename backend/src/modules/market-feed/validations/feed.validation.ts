import { z } from 'zod';
import { instrumentIdSchema } from '../../market-data/validations/market-data.validation.js';
export const feedConnectSchema = z.object({ ids: z.array(instrumentIdSchema).min(1).max(200) }).strict();
export const feedOtpSchema = z.object({ otp: z.string().regex(/^\d{6}$/, 'Enter the six-digit OTP') }).strict();
