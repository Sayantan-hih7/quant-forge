import type { BookLevel, FeedInstrument, LiveQuote } from '../types/feed.types.js';

const positive = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; };
const count = (value: unknown) => { const n = Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : null; };
/** One MarketDepth packet carries one level of both sides. Levels may be numbered 1–5 or 0–4. */
export function parseDepthLevel(message: Record<string, unknown>): { index: number; bid: BookLevel | null; ask: BookLevel | null } | null {
  if (message.Type !== 'MarketDepth') return null;
  const level = Number(message.Level);
  if (!Number.isInteger(level) || level < 0 || level > 5) return null;
  const side = (rate: unknown, qty: unknown, orders: unknown): BookLevel | null => {
    const price = positive(rate), quantity = count(qty);
    return price !== null && quantity !== null && quantity > 0 ? { price, quantity, orders: count(orders) } : null;
  };
  return { index: level >= 1 ? level - 1 : level, bid: side(message.BidRate, message.BidQty, message.BidOrder), ask: side(message.OfferRate, message.OfferQty, message.OfferOrder) };
}
export function parseCircuits(message: Record<string, unknown>) {
  if (message.Type !== 'DPR') return null;
  const upper = positive(message.UpperCktLimit), lower = positive(message.LowerCktLimit);
  return upper !== null && lower !== null && upper >= lower ? { upperCircuit: upper, lowerCircuit: lower } : null;
}

export function exchangeTimestamp(message: Record<string, unknown>, now = Date.now()): string | null {
  let time: number;
  if (typeof message.EpochTime === 'number' && Number.isFinite(message.EpochTime) && message.EpochTime > 0) {
    // SDK 3.1 uses a host-local 1980 epoch. Undo that conversion, then apply the exchange's IST offset.
    time = message.EpochTime * 1000 - new Date(1980, 0, 1).getTime() + Date.UTC(1980, 0, 1) - 19800000;
  } else {
    const raw = String(message.Time ?? '').replace(' ', 'T');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) return null;
    time = Date.parse(`${raw}+05:30`);
    if (!Number.isFinite(time) || new Date(time + 19800000).toISOString().slice(0, 19) !== raw) return null;
  }
  return Number.isFinite(time) && time > 0 && time <= now + 60000 ? new Date(time).toISOString() : null;
}
export function parseTick(message: Record<string, unknown>, instrument: FeedInstrument, now = Date.now()): Omit<LiveQuote, 'session'> | null {
  if (message.Type !== 'LTP') return null;
  const exchange = ['N', 'NSE', 'NSECASH'].includes(String(message.Exchange)) ? 'NSE' : ['B', 'BSE', 'BSECASH'].includes(String(message.Exchange)) ? 'BSE' : null;
  const code = Number(message['Scrip Code'] ?? message.ScripCode ?? message.scripcode);
  if (exchange !== instrument.exchange || code !== instrument.code) return null;
  const price = Number(message.LTP_Rate), at = exchangeTimestamp(message, now);
  if (!Number.isFinite(price) || price <= 0 || !at) return null;
  const volume = message.LTP_Cumulative_Qty ?? message['LTP_Cumulative Qty'];
  return { instrumentId: instrument.id, symbol: instrument.symbol, exchange, price, at, receivedAt: new Date(now).toISOString(), source: 'motilal',
    cumulativeVolume: volume !== undefined && volume !== null && volume !== '' && Number.isSafeInteger(Number(volume)) && Number(volume) >= 0 ? Number(volume) : null };
}
