import type { StockQuote } from '../types.js';
import { indianDate } from './chart-bars.js';
import { withMovement } from '../providers/dhan-quotes.js';

/** Snapshots fill missing company quote fields without replacing a healthy stream's price or clock. */
export function mergeQuote(previous: StockQuote | undefined, incoming: StockQuote, now = Date.now()): StockQuote {
  if (!previous) return incoming;
  const older = previous.lastTradeAt && (!incoming.lastTradeAt || previous.lastTradeAt > incoming.lastTradeAt)
    || previous.lastTradeAt === incoming.lastTradeAt && previous.receivedAt > incoming.receivedAt;
  const streaming = previous.source.endsWith('-stream') && now - Date.parse(previous.receivedAt) < 20000;
  const keep = older || streaming && !incoming.source.endsWith('-stream');
  const winner = keep ? previous : incoming, other = keep ? incoming : previous;
  const newest=(a?:StockQuote['depth'],b?:StockQuote['depth'])=>[a,b].filter(x=>!!x).sort((x,y)=>y!.receivedAt.localeCompare(x!.receivedAt))[0];
  // Depth has its own receipt clock; a thinly traded stock can have new orders with an old last-trade time.
  // Snapshot depth and the streamed book are kept apart: a partial stream must not hide the full snapshot.
  const depth=newest(previous.depth,incoming.depth), liveDepth=newest(previous.liveDepth,incoming.liveDepth);
  const result = { ...winner, ...(depth?{depth}:{}), ...(liveDepth?{liveDepth}:{}) };
  if (!winner.lastTradeAt || !other.lastTradeAt || indianDate(winner.lastTradeAt) !== indianDate(other.lastTradeAt)) return result;
  for (const field of ['previousClose', 'open', 'high', 'low', 'averagePrice', 'lowerCircuit', 'upperCircuit'] as const) result[field] ??= other[field];
  // Never borrow cumulative volume across providers; chart deltas depend on its source.
  return withMovement(result);
}
