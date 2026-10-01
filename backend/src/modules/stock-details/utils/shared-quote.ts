import type { LiveBook, LiveQuote } from '../../market-feed/types/feed.types.js';
import type { StockDepth, StockQuote } from '../types.js';
import { withMovement } from '../providers/dhan-quotes.js';

/** A depth-only book counts while it keeps arriving; older books fall back to the price feed's own book. */
export const DEPTH_FRESH_MS = 10_000;
const asDepth = (book: Omit<LiveBook, 'session'>): StockDepth => ({ bids: book.bids ?? [], asks: book.asks ?? [], totalBuy: book.totalBuy ?? null, totalSell: book.totalSell ?? null,
  receivedAt: book.receivedAt, source: book.source === 'motilal' ? 'Motilal stream' : 'Dhan stream', ...(book.levels ? { levels: book.levels } : {}) });

/**
 * `book` comes from the price feed itself and must share the tick's stream session.
 * `depthBook` comes from the separate Dhan Full-mode depth connection and is judged by its own freshness.
 */
export function sharedStockQuote(tick: LiveQuote, book?: LiveBook, depthBook?: Omit<LiveBook, 'session'>, now = Date.now()): StockQuote {
  // A book from another stream session (reconnect, provider switch) is never attached.
  const sameBook = book && book.instrumentId === tick.instrumentId && book.session === tick.session ? book : undefined;
  const fullBook = depthBook && depthBook.instrumentId === tick.instrumentId && now - Date.parse(depthBook.receivedAt) < DEPTH_FRESH_MS ? depthBook : undefined;
  const live = fullBook ?? (sameBook?.bids && sameBook.asks ? sameBook : undefined);
  return withMovement({ instrumentId: tick.instrumentId, price: tick.price, previousClose: tick.details?.previousClose ?? null,
    change: null, percent: null, open: tick.details?.open ?? null, high: tick.details?.high ?? null, low: tick.details?.low ?? null,
    volume: tick.cumulativeVolume, averagePrice: tick.details?.averagePrice ?? null,
    lowerCircuit: sameBook?.lowerCircuit ?? null, upperCircuit: sameBook?.upperCircuit ?? null,
    ...(live ? { liveDepth: asDepth(live) } : {}),
    lastTradeAt: tick.at, receivedAt: tick.receivedAt, source: tick.source === 'motilal' ? 'motilal-stream' : 'dhan-stream', streamSession: tick.session });
}
