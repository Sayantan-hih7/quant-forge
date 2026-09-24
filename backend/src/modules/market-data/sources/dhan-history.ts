import { invariant } from '../../../shared/errors.js';
import { object } from '../../../shared/http-client.js';
import type { Candle, Instrument } from '../types.js';

export function parseDhanHistory(payload: unknown, instrument: Instrument, interval: '1d' | '1m', observedAt: string): Candle[] {
  const data = object(payload), keys = ['timestamp', 'open', 'high', 'low', 'close', 'volume'];
  invariant(keys.every(k => Array.isArray(data[k])), 'Dhan history response has no OHLCV arrays');
  const times = data.timestamp as unknown[];
  invariant(keys.every(k => (data[k] as unknown[]).length === times.length), 'Dhan history arrays have unequal lengths');
  const rows = new Map<string, Candle>();
  for (let i = 0; i < times.length; i++) {
    const values = keys.map(k => (data[k] as unknown[])[i]);
    invariant(values.every(x => typeof x === 'number' && Number.isFinite(x)), 'Dhan candle contains invalid numeric data');
    const [timestamp, open, high, low, close, volume] = values as number[];
    invariant(timestamp > 0 && min(open, high, low, close) > 0 && volume >= 0 && high >= Math.max(open, low, close) && low <= Math.min(open, close), 'Invalid Dhan OHLCV candle');
    const instant = new Date(timestamp * 1000);
    const local = new Date(instant.getTime() + 19800000);
    const date = local.toISOString().slice(0, 10);
    const time = interval === '1d' ? `${date}T03:45:00.000Z` : instant.toISOString();
    const end = interval === '1d' ? Date.parse(`${date}T10:00:00Z`) : timestamp * 1000 + 60_000;
    if (end > Date.parse(observedAt)) continue;
    if (interval === '1m') {
      const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
      // Extended/special sessions require an explicit calendar; do not mix them into normal intraday signals.
      if (minute < 555 || minute >= 930 || local.getUTCSeconds() !== 0) continue;
    }
    const row: Candle = { instrumentId: instrument._id, interval, time, open, high, low, close, volume, source: 'dhan', observedAt };
    const previous = rows.get(time);
    invariant(!previous || ['open', 'high', 'low', 'close', 'volume'].every(k => previous[k as keyof Candle] === row[k as keyof Candle]), 'Conflicting Dhan candles');
    rows.set(time, row);
  }
  return [...rows.values()].sort((a, b) => a.time.localeCompare(b.time));
}
const min = Math.min;
export function historyWindows(from: string, to: string, interval: '1d' | '1m') {
  const start = Date.parse(from), end = Date.parse(to);
  invariant(Number.isFinite(start) && Number.isFinite(end) && start < end, 'Invalid history dates');
  const windows: { from: string; to: string }[] = [];
  // To-date is exclusive. Smaller windows permit resumable imports and bounded response sizes.
  const size = (interval === '1d' ? 365 : 30) * 86400000;
  for (let cursor = start; cursor < end; cursor += size) windows.push({ from: new Date(cursor).toISOString().slice(0, 10), to: new Date(Math.min(cursor + size, end)).toISOString().slice(0, 10) });
  return windows;
}
