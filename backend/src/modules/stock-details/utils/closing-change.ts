import { marketTime } from '../../../shared/market-calendar.js';
import { withMovement } from '../providers/dhan-quotes.js';
import type { StockQuote } from '../types.js';

/** Dhan can reset net_change to zero after close. Resolve against the quote's
 * own session, never against today's date or the nearest older saved candle. */
export function closingReferenceDay(quote: StockQuote, now = Date.now()): string | undefined {
  if (quote.source !== 'dhan-snapshot' || !quote.lastTradeAt || quote.change !== 0 && quote.change !== null) return;
  const tradedAt = Date.parse(quote.lastTradeAt), receivedAt = Date.parse(quote.receivedAt);
  if (!Number.isFinite(tradedAt) || !Number.isFinite(receivedAt) || tradedAt > now || receivedAt > now) return;
  const session = marketTime(tradedAt), close = Date.parse(`${session.date}T15:30:00+05:30`);
  if (!session.tradingDay || receivedAt < close || now < close) return;
  for (let offset = 1; offset <= 15; offset++) {
    const previous = marketTime(close - offset * 86400000);
    if (!previous.knownYear) return;
    if (previous.tradingDay) return previous.date;
  }
}

export type ClosingCandle = { instrumentId: string; time: string; close: number };
export function withClosingChange(quote: StockQuote, day: string, candles: ClosingCandle[]): StockQuote {
  const matches = candles.filter(c => c.instrumentId === quote.instrumentId && c.time.slice(0, 10) === day && Number.isFinite(c.close) && c.close > 0);
  const closes = new Set(matches.map(c => c.close));
  // A gap or conflicting candles is unknown, not a genuine 0% session.
  return withMovement({ ...quote, previousClose: closes.size === 1 ? matches[0].close : null });
}
