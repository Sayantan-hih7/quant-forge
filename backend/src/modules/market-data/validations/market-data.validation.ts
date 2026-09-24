import { z } from 'zod';
export const instrumentIdSchema = z.string().regex(/^(NSE|BSE):\d+$/);
export const importSchema = z.object({
  kind: z.enum(['instruments', 'motilal-mappings', 'memberships', 'pledge', 'delivery', 'fundamentals', 'history']),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  exchange: z.enum(['NSE', 'BSE']).default('NSE'),
  ids: z.array(instrumentIdSchema).max(10_000).optional(),
  interval: z.enum(['1d', '1m']).default('1d'),
  from: z.string().date().optional(), to: z.string().date().optional(),
}).strict().superRefine((v, ctx) => {
  if (v.kind === 'delivery' && !v.month) ctx.addIssue({ code: 'custom', message: 'Month is required', path: ['month'] });
  if (v.kind === 'history' && (!v.ids?.length || !v.from || !v.to)) ctx.addIssue({ code: 'custom', message: 'History needs instruments and dates', path: ['ids'] });
});
export type ImportRequest = z.infer<typeof importSchema>;
