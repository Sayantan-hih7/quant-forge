import type { ChartBar, LiveChartBar, StockChartData, StockQuote } from '../types';
import { barEnd, bucketTime, frameMinutes, isIntraday, istDay } from './chartTime';

export function liveChart(data: StockChartData, live: LiveChartBar[], quote: StockQuote | undefined, now: number) {
  const frame = data.timeframe, history = data.bars;
  if (!isIntraday(frame)) {
    const at = Date.parse(quote?.lastTradeAt ?? ''), day = Number.isFinite(at) ? istDay(at) : '';
    const usable = quote && quote.source !== 'historical-close' && day === istDay(now)
      && at <= now + 2000 && quote.open != null && quote.high != null && quote.low != null && quote.volume != null
      && quote.high >= Math.max(quote.open, quote.price) && quote.low <= Math.min(quote.open, quote.price);
    if (!usable) return { bars: history, partial: false, forming: history.some(b => barEnd(b.time, frame) > now) };
    const stored = data.baseBars ?? (frame === '1d' ? history : []);
    // Confirmed daily history wins after close; a stale quote must not rewrite it.
    if (stored.some(b => b.time.slice(0,10) === day)) return { bars: history, partial: false, forming: history.some(b => barEnd(b.time, frame) > now) };
    const daily = [...stored].filter(b => b.time.slice(0, 10) !== day);
    // Do not replace a weekly/monthly candle if its constituent days are unavailable.
    if (frame !== '1d' && !data.baseBars) return { bars: history, partial: false, forming: false };
    daily.push({ time: day, open: quote.open!, high: quote.high!, low: quote.low!, close: quote.price, volume: quote.volume! });
    const result = aggregate(daily, frame);
    return { bars: result, partial: false, forming: true };
  }
  const base = new Map((data.baseBars ?? (frame === '1m' ? history : [])).map(b => [b.time, { ...b, partial: false }]));
  for (const b of live) {
    const end = Date.parse(b.time) + 60_000;
    // Provider-confirmed minutes supersede preview fragments. Never replace them.
    if (!base.has(b.time)) base.set(b.time, { ...b, partial: b.partial || end <= now && end - Date.parse(b.updatedAt) > 15_000 });
  }
  const groups = new Map<string, { rows: (ChartBar & { partial: boolean })[] }>();
  for (const b of [...base.values()].sort((a,b) => a.time.localeCompare(b.time))) {
    const key = bucketTime(Date.parse(b.time), frame);
    const g = groups.get(key) ?? { rows: [] }; g.rows.push(b); groups.set(key, g);
  }
  const result = new Map(history.map(b => [b.time, b]));
  let partial = false, forming = false;
  for (const [time, { rows }] of groups) {
    const end = barEnd(time, frame), start = Date.parse(time);
    if (end <= now) {
      const complete = rows.length === (end - start) / 60_000 && rows.every(b => !b.partial);
      if (complete) result.set(time, aggregate(rows, frame)[0]);
    } else if (time === bucketTime(now, frame) && rows.length && istDay(start) === istDay(now)) {
      const expected = Math.floor((now - start) / 60_000) + 1;
      const bar = aggregate(rows, frame)[0];
      result.set(time, bar); forming = true;
      partial = rows.some(b => b.partial) || rows.length < Math.min(expected, frameMinutes(frame));
    }
  }
  return { bars: [...result.values()].sort((a,b) => a.time.localeCompare(b.time)), partial, forming };
}
function aggregate(bars: ChartBar[], frame: StockChartData['timeframe']) {
  const groups = new Map<string, ChartBar>();
  for (const bar of [...bars].sort((a,b) => a.time.localeCompare(b.time))) {
    const key = bucketTime(Date.parse(bar.time), frame), old = groups.get(key);
    if (old) { old.high = Math.max(old.high, bar.high); old.low = Math.min(old.low, bar.low); old.close = bar.close; old.volume += bar.volume; }
    else groups.set(key, { ...bar, time: key });
  }
  return [...groups.values()];
}
