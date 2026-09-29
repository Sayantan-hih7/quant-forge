import { parse } from 'csv-parse/sync';
import { download, numberOrNull } from '../../../shared/http-client.js';
import { invariant } from '../../../shared/errors.js';
import { deliveryUrl, exchangeDate } from '../../market-data/sources/nse-reports.js';
import { withMovement } from '../../stock-details/providers/dhan-quotes.js';
import type { DiscoveryQuote, QuoteSnapshot } from '../types.js';

type Listing = { _id: string; symbol: string; series: string; exchange: string };
export function nsePreviousCloses(csv: string, date: string, stocks: Listing[]) {
  const rows: Record<string, string>[] = parse(csv, { columns: (keys: string[]) => keys.map(key => key.trim()), trim: true, bom: true, skip_empty_lines: true });
  invariant(rows.length && ['SYMBOL', 'SERIES', 'DATE1', 'PREV_CLOSE'].every(key => key in rows[0]), 'NSE reference columns are unavailable');
  const lookup = new Map(stocks.filter(stock => stock.exchange === 'NSE').map(stock => [`${stock.symbol}:${stock.series}`, stock._id]));
  const result = new Map<string, number>();
  for (const row of rows) {
    invariant(exchangeDate(row.DATE1) === date, 'NSE reference belongs to a different session');
    const id = lookup.get(`${row.SYMBOL}:${row.SERIES}`), close = numberOrNull(row.PREV_CLOSE);
    if (id && close !== null && close > 0) { invariant(!result.has(id), 'Duplicate NSE price reference'); result.set(id, close); }
  }
  invariant(result.size, 'No verified NSE price references are available');
  return result;
}
export async function enrichClosingQuotes(quotes: DiscoveryQuote[], stocks: Listing[], session: { date: string; close: number }, cache: QuoteSnapshot | null) {
  if (Date.now() < session.close || !quotes.some(q => q.instrumentId.startsWith('NSE:'))) return { quotes, warning: '' };
  let references = new Map<string, number>();
  if (cache?.sessionDate === session.date) references = new Map(cache.quotes.filter(q => q.changeSource === 'nse-bhavcopy' && q.previousClose !== null).map(q => [q.instrumentId, q.previousClose!]));
  if (!references.size) {
    try { references = nsePreviousCloses((await download(deliveryUrl(session.date), { timeout: 12000 }, 4_000_000)).toString('utf8'), session.date, stocks); }
    catch { /* Provider quote still supplies price/volume; unverified after-close NSE changes remain unavailable. */ }
  }
  let missing = 0;
  const enriched = quotes.map(q => {
    if (!q.instrumentId.startsWith('NSE:')) return q;
    const previousClose = references.get(q.instrumentId);
    if (previousClose !== undefined) return { ...withMovement({ ...q, previousClose }), changeSource: 'nse-bhavcopy' as const };
    if (q.lastTradeAt && new Date(Date.parse(q.lastTradeAt) + 19_800_000).toISOString().slice(0, 10) === session.date) missing++;
    // NSE's after-close quote reset can report zero net change. Do not rank it as unchanged.
    return { ...q, previousClose: null, change: null, percent: null };
  });
  return { quotes: enriched, warning: missing ? `NSE previous-close references are unavailable for ${missing} listings. Their prices and activity remain available; they are excluded from gain/loss groups until verified.` : '' };
}
