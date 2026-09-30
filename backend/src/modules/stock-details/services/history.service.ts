import { redis } from '../../../shared/redis.js';
import { AppError } from '../../../shared/errors.js';
import { dhanRequest } from '../../connections/services/dhan.service.js';
import { parseDhanHistory } from '../../market-data/sources/dhan-history.js';
import { ensureMonthlyHistory } from '../../market-data/services/dhan-cache.service.js';
import { ensureIntradayHistory } from '../../market-data/services/intraday-history.service.js';
import { chartHistoryPlan, type ChartHistoryOptions } from '../utils/history-plan.js';
import { CandleModel } from '../../market-data/models/market-data.model.js';
import type { Instrument } from '../../market-data/types.js';
import type { StockTimeframe } from '../types.js';

import { aggregateBars, indianDate } from '../utils/chart-bars.js';
import { marketTime } from '../../../shared/market-calendar.js';

const active = new Map<string, Promise<unknown>>();
export async function stockHistory(stock: Instrument, frame: StockTimeframe, dependencies = { daily: ensureMonthlyHistory, intraday: dhanRequest }, options: ChartHistoryOptions = {}) {
  const now = options.at ? Math.min(Date.now(), Date.parse(options.at)) : Date.now();
  const { intraday, base, from, today, warning } = chartHistoryPlan(frame, now, options);
  const cacheKey = `quantforge:research:history:${stock._id}:${base}:${today}:${from}${options.at ? `:review:${options.at}` : ''}`;
  let message: string | undefined = stock.active ? undefined : 'This listing is inactive. Previously stored chart history is shown.';
  if (stock.active && !await redis.exists(cacheKey)) {
    try {
      let request = active.get(cacheKey);
      if (!request) {
        request = (async () => {
          if (intraday) {
            // Refresh only the current session; reuse completed historical ranges
            // shared with backtesting, even when the chart's lookback changes.
            const open = Date.parse(`${today}T03:45:00Z`);
            const calendar = marketTime(now);
            let currentError: unknown;
            let rows: ReturnType<typeof parseDhanHistory> = [];
            try {
              if (now > open + 60_000 && (!calendar.knownYear || calendar.tradingDay)) {
                const payload = await dependencies.intraday('/charts/intraday', { securityId: stock.securityId, exchangeSegment: `${stock.exchange}_EQ`, instrument: 'EQUITY', interval: '1', oi: false,
                  fromDate: `${today} 09:15:00`, toDate: new Date(now + 19_800_000).toISOString().slice(0, 19).replace('T', ' ') }, { maxWaitMs: 30_000 });
                rows = parseDhanHistory(payload, stock, '1m', new Date().toISOString()).filter(row => indianDate(row.time) === today);
              }
            } catch (error) { currentError = error; }
            for (let offset = 0; offset < rows.length; offset += 500) await CandleModel.bulkWrite(rows.slice(offset, offset + 500).map(row => ({ updateOne: {
              filter: { instrumentId: row.instrumentId, interval: '1m', time: row.time }, update: { $set: row }, upsert: true,
            } })));
            await ensureIntradayHistory(stock, from, today, { maxWaitMs: 30_000 }, dependencies.intraday);
            if (currentError) throw currentError;
          } else {
            // Always refresh recent sessions first. A missing older interval
            // must not leave current candles stuck at the monthly scan cutoff.
            await dependencies.daily(stock, indianDate(now - 30 * 86400000), today, { maxWaitMs: 30_000 });
            await dependencies.daily(stock, from, today, { maxWaitMs: 30_000 });
          }
          await redis.set(cacheKey, '1', 'EX', options.at ? 3600 : intraday ? 45 : 3600);
        })().finally(() => active.delete(cacheKey));
        active.set(cacheKey, request);
      }
      await request;
    } catch (error) { message = error instanceof AppError ? error.message : 'Chart history could not be refreshed. Stored candles are shown where available.'; }
  }
  const rows = await CandleModel.find({ instrumentId: stock._id, interval: base, time: { $gte: `${from}T00:00:00.000Z`, $lte: new Date(now).toISOString() } })
    .sort({ time: 1 }).select('time open high low close volume -_id').lean();
  // Larger intraday buckets are shown only after they close. Never invent an
  // opening/high/low from a single tick received halfway through a candle.
  const minutes = Number(frame.slice(0, -1)) * (frame.endsWith('h') ? 60 : 1);
  let incompleteBuckets = 0;
  const counts = new Map<string, number>();
  if (intraday) for (const row of rows) { const key = aggregateBars([row], frame)[0].time; counts.set(key, (counts.get(key) ?? 0) + 1); }
  const bars = aggregateBars(rows, frame).filter(bar => {
    if (!intraday) return true;
    const end = Math.min(Date.parse(bar.time) + minutes * 60_000, Date.parse(`${indianDate(bar.time)}T10:00:00Z`));
    if (end > now) return false;
    if (counts.get(bar.time) !== (end - Date.parse(bar.time)) / 60_000) { incompleteBuckets++; return false; }
    return true;
  });
  if (incompleteBuckets) message = [message, `${incompleteBuckets} incomplete candle intervals were omitted because provider minutes are missing.`].filter(Boolean).join(' ');
  if (warning) message = [message, warning].filter(Boolean).join(' ');
  // Aggregated history is sufficient for older bars. Only the last session's
  // minutes are needed to merge the live preview, keeping large responses small.
  const lastDay = rows.length ? indianDate(rows.at(-1)!.time) : today;
  const baseBars = intraday ? rows.filter(row => indianDate(row.time) === lastDay) : rows;
  return { instrumentId: stock._id, timeframe: frame, bars, baseBars, requestedFrom: from, historyVerified: !message, message, incompleteBuckets, latestCandleAt: rows.at(-1)?.time ?? null,
    refreshedAt: new Date().toISOString(), source: 'Dhan historical candles', timezone: 'Asia/Kolkata' };
}
