import { z } from 'zod';
export const watchlistStock = z.object({ instrumentId: z.string().min(1).max(100) });
export const browseStocksSchema = z.object({
  q: z.string().trim().max(100).default(''), exchange: z.enum(['NSE', 'BSE']).optional(), listId: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1), pageSize: z.coerce.number().refine(n => [10, 20, 50, 100].includes(n)).default(20),
  sort: z.enum(['symbol', 'name', 'exchange']).default('symbol'), order: z.enum(['asc', 'desc']).default('asc'),
});
