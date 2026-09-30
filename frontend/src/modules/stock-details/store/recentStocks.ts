import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { z } from 'zod';
import type { StockListing } from '../types';

const recentSchema = z.object({
  _id: z.string().regex(/^(NSE|BSE):\d+$/), symbol: z.string().min(1).max(100), name: z.string().max(250).optional(),
  exchange: z.enum(['NSE', 'BSE']), isin: z.string().max(30), active: z.boolean(), viewedAt: z.string().datetime(),
}).refine(stock => stock._id.startsWith(`${stock.exchange}:`));
export type RecentStock = z.infer<typeof recentSchema>;
export function recordRecentStock(items: RecentStock[], stock: StockListing, at = new Date().toISOString()): RecentStock[] {
  const parsed = recentSchema.safeParse({ ...stock, viewedAt: at });
  if (!parsed.success) return items;
  return [parsed.data, ...items.filter(item => item._id !== stock._id && (!stock.isin || item.isin !== stock.isin))].slice(0, 10);
}
interface RecentStocks { items: RecentStock[]; record: (stock: StockListing) => void; clear: () => void }
export const useRecentStocks = create<RecentStocks>()(persist(set => ({
  items: [], record: stock => set(state => ({ items: recordRecentStock(state.items, stock) })), clear: () => set({ items: [] }),
}), {
  name: 'quantforge-recent-stocks', version: 1, partialize: state => ({ items: state.items }),
  merge: (persisted, current) => {
    const parsed = z.object({ items: z.array(recentSchema).max(10) }).safeParse(persisted);
    if (!parsed.success) return current;
    const items = [...parsed.data.items].sort((a, b) => a.viewedAt.localeCompare(b.viewedAt))
      .reduce<RecentStock[]>((result, stock) => recordRecentStock(result, stock, stock.viewedAt), []);
    return { ...current, items };
  },
}));
