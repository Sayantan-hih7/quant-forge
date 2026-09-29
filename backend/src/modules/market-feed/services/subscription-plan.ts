import type { FeedInstrument, FeedProvider } from '../types/feed.types.js';

export const MOTILAL_CAPACITY = 200;
export const DHAN_CAPACITY = 5000;
// Reserve enough Dhan capacity for complete failover, including Motilal's stocks.
export const WORKSPACE_FEED_CAPACITY = DHAN_CAPACITY;
export type Provider = 'motilal' | 'dhan';
export interface SubscriptionPlan { motilal: FeedInstrument[]; dhan: FeedInstrument[]; unavailable: string[] }
export function subscriptionPlan(stocks: FeedInstrument[], options: {
  preference: FeedProvider; motilal: boolean; dhan: boolean; motilalFailed?: boolean; motilalLimit?: number;
}): SubscriptionPlan {
  const result: SubscriptionPlan = { motilal: [], dhan: [], unavailable: [] };
  const unique = new Map(stocks.map(s => [s.id, s]));
  const moLimit = Math.min(MOTILAL_CAPACITY, options.motilalLimit ?? MOTILAL_CAPACITY);
  for (const stock of unique.values()) {
    if (result.motilal.length + result.dhan.length >= WORKSPACE_FEED_CAPACITY) { result.unavailable.push(stock.id); continue; }
    if (options.preference !== 'dhan' && options.motilal && !options.motilalFailed && stock.code !== undefined && result.motilal.length < moLimit) result.motilal.push(stock);
    else if (options.preference !== 'motilal' && options.dhan && stock.securityId && result.dhan.length < DHAN_CAPACITY) result.dhan.push(stock);
    else result.unavailable.push(stock.id);
  }
  return result;
}

export const subscriptionSignature = (stocks: FeedInstrument[]) => JSON.stringify(stocks.map(s => [s.id, s.symbol, s.exchange, s.securityId, s.code ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
