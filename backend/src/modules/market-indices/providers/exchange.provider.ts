import { createHttpClient } from '../../../shared/http-client.js';
import { AppError } from '../../../shared/errors.js';
import { indexInstruments } from '../config/index-catalog.js';
import { bseDailySnapshot, parseBseChart, parseBseSnapshot, parseNseDaily, parseNseSnapshot, parseNiftySnapshot, tradingDate } from './parsers.js';
import type { IndexInstrument, IndexSnapshot } from '../types.js';

const client = createHttpClient();
const nseUrl = 'https://www.nseindia.com/api/allIndices';
const bseUrls = ['https://mservice.bseindia.com/BseIndiaAPI/api/IndexMovers/w', 'https://api.bseindia.com/BseIndiaAPI/api/IndexMovers/w'];
async function get(url: string) {
  // Only fixed public exchange endpoints. BSE occasionally emits invalid legacy response headers;
  // tolerance is scoped to those public HTTPS endpoints, without cookies, credentials or redirects.
  return (await client.get<unknown>(url, { timeout: 8000, maxContentLength: 3_000_000,
    insecureHTTPParser: bseUrls.includes(url), headers: { Referer: url.includes('bse') ? 'https://www.bseindia.com/' : 'https://www.nseindia.com/' } })).data;
}
export async function nseSnapshots() {
  try {
    const quotes = parseNseSnapshot(await get(nseUrl), nseUrl, new Date().toISOString());
    if (quotes.length) return quotes;
  } catch { /* Independent official NSE Indices host is the next source. */ }
  const url = 'https://liveindexsa.niftyindices.com/jsonfiles/LiveIndicesWatch.json';
  const fallback = parseNiftySnapshot(await get(url), url, new Date().toISOString());
  if (!fallback.length) throw new AppError(502,'INDEX_SOURCE_EMPTY','NSE and NSE Indices returned no usable quotes');
  return fallback;
}
export async function bseSnapshots() {
  for (const url of bseUrls) {
    try { const quotes = parseBseSnapshot(await get(url), url, new Date().toISOString()); if (quotes.length) return quotes; } catch { /* Try BSE's other published website host. */ }
  }
  throw new AppError(502,'INDEX_SOURCE_EMPTY','BSE index snapshots are temporarily unavailable');
}
export async function nseDailySnapshots() {
  const now = new Date();
  // Reports may appear after the session. Search dates; do not assume yesterday is a trading day.
  for (let offset = 0; offset < 8; offset++) {
    const date = tradingDate(now.getTime() - offset * 86_400_000);
    if ([0,6].includes(new Date(`${date}T12:00:00+05:30`).getUTCDay())) continue;
    if (offset === 0 && now.getTime() < Date.parse(`${date}T16:30:00+05:30`)) continue;
    const [year, month, day] = date.split('-');
    const url = `https://nsearchives.nseindia.com/content/indices/ind_close_all_${day}${month}${year}.csv`;
    try { const data = await get(url); const quotes = typeof data === 'string' ? parseNseDaily(data, url, new Date().toISOString()) : [];
      if (quotes.length) return quotes;
    } catch (error) {
      // Stop on timeouts instead of making eight slow requests; the saved report remains available.
      if (error instanceof AppError && error.code === 'SOURCE_UNAVAILABLE') break;
    }
  }
  throw new AppError(502,'INDEX_DAILY_UNAVAILABLE','NSE daily index report is unavailable; keeping the last saved report');
}
export const bseChartUrl = (instrument: IndexInstrument, daily: boolean) =>
  `https://www.bseindices.com/AsiaIndexAPI/api/AsiaIndicesGraphData/w?index=${instrument.providerCode}&flag=${daily ? '1M' : '1'}&sector=&seriesid=R&frd=null&tod=null`;
export async function bseChart(instrument: IndexInstrument, daily: boolean) {
  const url = bseChartUrl(instrument, daily);
  return { points: parseBseChart(await get(url), daily), sourceUrl: url };
}
export async function bseDailySnapshots(excluded: string[]) {
  const missing = indexInstruments.filter(i => i.exchange === 'BSE' && !excluded.includes(i.id));
  const result: IndexSnapshot[] = [];
  // Bounded concurrency; don't fan out all index requests at once.
  for (let start = 0; start < missing.length; start += 3) {
    const batch = await Promise.allSettled(missing.slice(start,start+3).map(async i => {
      const chart = await bseChart(i, true); return bseDailySnapshot(i, chart.points, chart.sourceUrl, new Date().toISOString());
    }));
    for (const row of batch) if (row.status === 'fulfilled' && row.value) result.push(row.value);
  }
  return result;
}
