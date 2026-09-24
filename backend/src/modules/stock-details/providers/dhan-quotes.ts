import { numberOrNull, object } from '../../../shared/http-client.js';
import type { StockQuote } from '../types.js';

const IST = 19_800_000;
export const positive = (value: unknown) => { const n = numberOrNull(value); return n !== null && n > 0 ? n : null; };
export function indianTradeTime(value: unknown, now = Date.now()): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const local = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`;
  const time = Date.parse(`${local}+05:30`);
  if (!Number.isFinite(time) || time < Date.UTC(2000, 0) || time > now + 60_000
    || new Date(time + IST).toISOString().slice(0, 19) !== local) return null;
  return new Date(time).toISOString();
}
export function withMovement<T extends StockQuote>(quote: T): T {
  const change = quote.previousClose !== null && quote.previousClose > 0 ? quote.price - quote.previousClose : null;
  return { ...quote, change, percent: change === null ? null : change / quote.previousClose! * 100 };
}
export function parseSnapshot(id: string, input: unknown, at: string): StockQuote | null {
  const data = object(input), price = positive(data.last_price);
  if (price === null) return null;
  const ohlc = object(data.ohlc), net = numberOrNull(data.net_change);
  const previousClose = net === null ? null : positive(price - net);
  const volume = numberOrNull(data.volume);
  return withMovement({ instrumentId: id, price, previousClose, change: null, percent: null,
    open: positive(ohlc.open), high: positive(ohlc.high), low: positive(ohlc.low), volume: volume !== null && volume >= 0 ? volume : null,
    averagePrice: positive(data.average_price), lowerCircuit: positive(data.lower_circuit_limit), upperCircuit: positive(data.upper_circuit_limit),
    lastTradeAt: indianTradeTime(data.last_trade_time, Date.parse(at)), receivedAt: at, source: 'dhan-snapshot' });
}

// Dhan's live NSE sample encodes IST wall-clock seconds; REST supplies explicit
// Indian dates. Calibrate against that timestamp when possible, never label a future timestamp live.
export function streamTradeTime(seconds: number, receivedAt: string, reference?: string | null): string | null {
  const now = Date.parse(receivedAt), raw = seconds * 1000;
  const candidates = [raw, raw - IST].filter(x => x >= Date.UTC(2000, 0) && x <= now + 2000);
  const anchor = reference ? Date.parse(reference) : NaN;
  const matching = candidates.filter(x => Number.isFinite(anchor) && Math.abs(x - anchor) < 300_000).sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor));
  const fresh = candidates.filter(x => Math.abs(now - x) < 60_000);
  const time = matching[0] ?? (fresh.length === 1 ? fresh[0] : undefined);
  return time === undefined ? null : new Date(time).toISOString();
}
export type DhanPacket = { kind: 'close'; id: string; previousClose: number }
  | { kind: 'quote'; id: string; price: number; seconds: number; open: number | null; high: number | null; low: number | null; volume: number; averagePrice: number | null }
  | { kind: 'disconnect'; code: number };
export function parseQuotePackets(buffer: Buffer): DhanPacket[] {
  const packets: DhanPacket[] = [];
  for (let offset = 0; offset + 8 <= buffer.length;) {
    const length = buffer.readUInt16LE(offset + 1), code = buffer[offset];
    if (length < 8 || offset + length > buffer.length) break;
    const b = buffer.subarray(offset, offset + length); offset += length;
    if (code === 50 && length >= 10) { packets.push({ kind: 'disconnect', code: b.readUInt16LE(8) }); continue; }
    const exchange = b[3] === 1 ? 'NSE' : b[3] === 4 ? 'BSE' : null;
    if (!exchange) continue;
    const id = `${exchange}:${b.readUInt32LE(4)}`;
    if (code === 6 && length >= 16) { const price = positive(b.readFloatLE(8)); if (price !== null) packets.push({ kind: 'close', id, previousClose: price }); }
    if (code === 4 && length >= 50) {
      const price = positive(b.readFloatLE(8));
      if (price === null) continue;
      packets.push({ kind: 'quote', id, price: Math.round(price * 100) / 100, seconds: b.readUInt32LE(14), averagePrice: positive(b.readFloatLE(18)),
        volume: b.readUInt32LE(22), open: positive(b.readFloatLE(34)), high: positive(b.readFloatLE(42)), low: positive(b.readFloatLE(46)) });
    }
  }
  return packets;
}
