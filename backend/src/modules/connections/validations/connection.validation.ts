import { z } from 'zod';

export const dhanConsentSchema = z.object({ tokenId: z.string().trim().min(5).max(4096) }).strict();
export const dhanAccessTokenSchema = z.object({ token: z.string().trim().min(20).max(8192), autoRenew: z.boolean().default(false) }).strict();
export const dhanAutoRenewSchema = z.object({ enabled: z.boolean(), webTokenConfirmed: z.boolean().default(false) }).strict();
