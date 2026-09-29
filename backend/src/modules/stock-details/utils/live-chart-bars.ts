import type { LiveChartBar, StockQuote } from '../types.js';

/** Research-only minute previews, built BEFORE stream messages are coalesced.
 * A late subscription/reconnect never claims to know the missing candle open.
 * These previews are never written to the execution candle collection. */
export class LiveChartBars {
  private states = new Map<string, { quote: StockQuote; bar?: LiveChartBar }>();
  reset() { this.states.clear(); }
  remove(id: string) { this.states.delete(id); }
  tick(q: StockQuote): LiveChartBar[] {
    if (!q.lastTradeAt || !['dhan-stream', 'motilal-stream'].includes(q.source)) return [];
    const at = Date.parse(q.lastTradeAt), received = Date.parse(q.receivedAt);
    if (!Number.isFinite(at) || at > received + 2000 || received - at > 15_000) return [];
    const local = new Date(at + 19_800_000), minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (minute < 555 || minute >= 930 || q.volume === null) return [];
    const previous = this.states.get(q.instrumentId), oldAt = Date.parse(previous?.quote.lastTradeAt ?? '');
    if (at < oldAt) return [];
    const start = Math.floor(at / 60_000) * 60_000, time = new Date(start).toISOString();
    const sameSource = previous?.quote.source === q.source && previous.quote.streamSession === q.streamSession;
    const delta = previous?.quote.volume == null || !sameSource ? NaN : q.volume - previous.quote.volume;
    const continuous = at - oldAt <= 15_000 && at >= oldAt && delta >= 0
      && q.lastTradeAt.slice(0, 10) === previous?.quote.lastTradeAt?.slice(0, 10);
    const old = sameSource ? previous?.bar : undefined;
    const changed: LiveChartBar[] = [];
    if (old && old.time !== time) changed.push({ ...old, partial: old.partial || !continuous || start - oldAt > 15_000 });
    const bar: LiveChartBar = old?.time === time ? { ...old } : {
      instrumentId: q.instrumentId, time, open: q.price, high: q.price, low: q.price, close: q.price,
      volume: 0, partial: !continuous || oldAt >= start || start - oldAt > 15_000, updatedAt: q.lastTradeAt, streamSession: q.streamSession,
    };
    bar.high = Math.max(bar.high, q.price); bar.low = Math.min(bar.low, q.price); bar.close = q.price;
    bar.volume += Number.isFinite(delta) && delta >= 0 ? delta : 0;
    bar.partial ||= !continuous; bar.updatedAt = q.lastTradeAt;
    this.states.set(q.instrumentId, { quote: q, bar });
    return [...changed, bar];
  }
}
