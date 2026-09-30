import { CandleModel } from '../../market-data/models/market-data.model.js';
import type { StockQuote } from '../types.js';
import { closingReferenceDay, withClosingChange, type ClosingCandle } from '../utils/closing-change.js';

export async function closingQuoteChanges(quotes: StockQuote[], now = Date.now()) {
  const days = new Map(quotes.flatMap(q => {
    const day = closingReferenceDay(q, now);
    return day ? [[q.instrumentId, day] as const] : [];
  }));
  if (!days.size) return quotes;
  let candles: ClosingCandle[] = [];
  try {
    // One indexed, batched read; no historical downloads or new broker requests.
    candles = await CandleModel.find({ interval: '1d', $or: [...days].map(([instrumentId, day]) => ({
      instrumentId, time: { $gte: day, $lt: new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10) },
    })) }).select('instrumentId time close -_id').lean();
  } catch { /* Keep the price if history is unavailable; do not show a false zero. */ }
  return quotes.map(q => days.has(q.instrumentId) ? withClosingChange(q, days.get(q.instrumentId)!, candles) : q);
}
