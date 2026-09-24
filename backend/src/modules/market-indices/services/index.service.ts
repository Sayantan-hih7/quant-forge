import { randomUUID } from 'node:crypto';
import { redis } from '../../../shared/redis.js';
import { AppError } from '../../../shared/errors.js';
import { IndexCacheModel, IndexChartModel, type IndexCache } from '../models/index-cache.model.js';
import { indexInstruments } from '../config/index-catalog.js';
import { bseChart, bseDailySnapshots, bseSnapshots, nseDailySnapshots, nseSnapshots } from '../providers/exchange.provider.js';
import { mergeSnapshots, tradingDate } from '../providers/parsers.js';
import type { IndexExchange, IndexSnapshot } from '../types.js';

// Shared cooldown across every browser; public snapshots are never presented as a tick feed.
const refreshMs = 15_000;
const inFlight = new Map<string, Promise<void>>();
const stale = (asOf?: string, ms = refreshMs) => !asOf || Date.now() - Date.parse(asOf) >= ms;
const unlock = async (key: string, owner: string) => {
  await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, owner);
};
async function refreshExchange(exchange: IndexExchange, cached: IndexCache | null) {
  const key = `quantforge:indices:refresh:${exchange}`; const owner = randomUUID();
  if (!(await redis.set(key, owner, 'PX', 180_000, 'NX'))) return;
  try {
    const now = new Date().toISOString(); const dailyDue = stale(cached?.dailyAttemptedAt, 3_600_000);
    await IndexCacheModel.updateOne({ _id: exchange }, { $set: { attemptedAt: now, ...(dailyDue ? { dailyAttemptedAt: now } : {}) } }, { upsert: true });
    const results = await Promise.allSettled([
      exchange === 'NSE' ? nseSnapshots() : bseSnapshots(),
      exchange === 'NSE' && dailyDue ? nseDailySnapshots() : Promise.resolve([] as IndexSnapshot[]),
    ]);
    let incoming = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    let quotes = mergeSnapshots(cached?.quotes ?? [], incoming);
    const warnings = results.filter(r => r.status === 'rejected').map(r => (r.reason as Error).message);
    // Publish successful exchange data immediately; slower daily-only indices follow separately.
    await IndexCacheModel.updateOne({ _id: exchange }, { $set: { quotes, warning: warnings.join('. '), ...(incoming.length ? { succeededAt: now } : {}) } });
    if (exchange === 'BSE' && dailyDue) {
      const excluded = quotes.filter(q => q.kind === 'snapshot').map(q => q.id);
      incoming = await bseDailySnapshots(excluded);
      quotes = mergeSnapshots(quotes, incoming);
      await IndexCacheModel.updateOne({ _id: exchange }, { $set: { quotes } });
    }
  } catch {
    await IndexCacheModel.updateOne({ _id: exchange }, { $set: { warning: 'Index refresh failed. Showing the last saved exchange data.' } }).catch(() => {});
  } finally { await unlock(key, owner).catch(() => {}); }
}
export async function indexQuotes() {
  const caches = await IndexCacheModel.find().lean();
  const sources = [];
  for (const exchange of ['NSE','BSE'] as const) {
    const cache = caches.find(c => c._id === exchange) ?? null;
    if (stale(cache?.attemptedAt) && !inFlight.has(exchange)) {
      const promise = refreshExchange(exchange, cache).catch(() => {}).finally(() => inFlight.delete(exchange));
      inFlight.set(exchange, promise);
    }
    sources.push({ exchange, refreshing: inFlight.has(exchange) || !!(await redis.exists(`quantforge:indices:refresh:${exchange}`)),
      checkedAt: cache?.attemptedAt ?? null, warning: cache?.warning || null });
  }
  const quotes = caches.flatMap(c => c.quotes.map(q => ({ ...q,
    status: q.kind === 'eod' ? 'eod' : (stale(q.asOf, 10 * 60_000) || stale(q.fetchedAt, 180_000)) ? 'stale' : 'snapshot' } as const)));
  return { quotes, sources, refreshAfterMs: sources.some(s => s.refreshing) ? 3000 : refreshMs, servedAt: new Date().toISOString() };
}
const chartRequests = new Map<string, Promise<unknown>>();
export async function indexChart(id: string) {
  const i = indexInstruments.find(i => i.id === id); if (!i) throw new AppError(404,'INDEX_UNKNOWN','Index not found');
  const cache = await IndexCacheModel.findById(i.exchange).lean(); const quote = cache?.quotes.find(q => q.id === id);
  const fallback = { points: quote?.points ?? [], chartKind: quote?.chartKind ?? 'observed', sourceUrl: quote?.sourceUrl ?? null, warning: null as string | null };
  if (i.exchange !== 'BSE' || !i.providerCode || quote?.kind === 'eod') return fallback;
  const saved = await IndexChartModel.findById(id).lean();
  const sameDate = (points: {time:number}[]) => !quote || points.every(p => tradingDate(p.time) === tradingDate(quote.asOf));
  if (saved && !stale(saved.fetchedAt, 60_000) && sameDate(saved.points)) return { ...saved, chartKind: 'intraday' };
  const existing = chartRequests.get(id); if (existing) return existing;
  const request = (async () => {
    try {
      const chart = await bseChart(i, false);
      if (chart.points.length > 1 && sameDate(chart.points) && chart.points.at(-1)!.time <= Date.now() + 60_000) {
        await IndexChartModel.updateOne({ _id: id }, { $set: { ...chart, fetchedAt: new Date().toISOString() } }, { upsert: true });
        return { ...chart, chartKind: 'intraday' };
      }
    } catch { /* Collected real snapshots remain a useful explicitly labelled fallback. */ }
    if (saved && sameDate(saved.points)) return { ...saved, chartKind: 'intraday', warning: 'Chart refresh unavailable. Showing saved chart points.' };
    return fallback;
  })().finally(() => chartRequests.delete(id));
  chartRequests.set(id, request); return request;
}
