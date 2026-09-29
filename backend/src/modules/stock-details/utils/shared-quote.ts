import type { LiveQuote } from '../../market-feed/types/feed.types.js';
import type { StockQuote } from '../types.js';
import { withMovement } from '../providers/dhan-quotes.js';
export function sharedStockQuote(tick: LiveQuote): StockQuote {
  return withMovement({ instrumentId: tick.instrumentId, price: tick.price, previousClose: tick.details?.previousClose ?? null,
    change: null, percent: null, open: tick.details?.open ?? null, high: tick.details?.high ?? null, low: tick.details?.low ?? null,
    volume: tick.cumulativeVolume, averagePrice: tick.details?.averagePrice ?? null, lowerCircuit: null, upperCircuit: null,
    lastTradeAt: tick.at, receivedAt: tick.receivedAt, source: tick.source === 'motilal' ? 'motilal-stream' : 'dhan-stream', streamSession: tick.session });
}
