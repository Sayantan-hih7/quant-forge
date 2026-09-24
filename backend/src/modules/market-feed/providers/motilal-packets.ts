import type { FeedInstrument, LiveQuote } from '../types/feed.types.js';

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
