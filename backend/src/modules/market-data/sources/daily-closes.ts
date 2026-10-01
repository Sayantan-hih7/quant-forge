import { parse } from 'csv-parse/sync';
import { AppError, invariant } from '../../../shared/errors.js';
import { numberOrNull } from '../../../shared/http-client.js';
import type { DailyClose, Instrument } from '../types.js';
import { deliveryUrl, exchangeDate } from './nse-reports.js';

export const nseClosesUrl = deliveryUrl;
export function bseClosesUrl(date: string) {
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)), 'Invalid report date');
  return `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${date.replaceAll('-', '')}_F_0000.CSV`;
}
/** A report that exists but belongs to another session (BSE serves one for closed days). */
export const noSession = (date: string) => new AppError(404, 'NO_SESSION', `No exchange session on ${date}`);
const price = (value: unknown) => { const n = numberOrNull(value); return n !== null && n > 0 ? n : null; };

/** NSE sec_bhavdata_full: the same file as delivery, matched to listings by symbol and series. */
export function parseNseCloses(csv: string, date: string, stocks: Instrument[], observedAt: string): DailyClose[] {
  const rows: Record<string, string>[] = parse(csv, { columns: (keys: string[]) => keys.map(k => k.trim()), trim: true, bom: true, skip_empty_lines: true });
  invariant(rows.length && ['SYMBOL', 'SERIES', 'DATE1', 'CLOSE_PRICE', 'PREV_CLOSE'].every(k => k in rows[0]), 'NSE price report columns have changed');
  if (exchangeDate(rows[0].DATE1) !== date) throw noSession(date);
  const lookup = new Map(stocks.filter(x => x.exchange === 'NSE').map(x => [`${x.symbol}:${x.series}`, x]));
  const output = new Map<string, DailyClose>();
  for (const r of rows) {
    invariant(exchangeDate(r.DATE1) === date, 'NSE price report contains a different trading date');
    const stock = lookup.get(`${r.SYMBOL}:${r.SERIES}`), close = price(r.CLOSE_PRICE);
    if (!stock?.isin || close === null) continue;
    // One series per company: the primary listing wins over trade-for-trade duplicates.
    if (output.has(stock.isin) && !stock.primary) continue;
    output.set(stock.isin, { _id: `${stock.isin}:${date}`, isin: stock.isin, date, close, prevClose: price(r.PREV_CLOSE),
      exchange: 'NSE', source: 'nse-bhavcopy', sourceUrl: nseClosesUrl(date), observedAt });
  }
  invariant(output.size, 'NSE price report did not match any imported instruments');
  return [...output.values()];
}

/** BSE UDiFF bhavcopy: carries ISIN directly. Only listed equities we track are kept. */
export function parseBseCloses(csv: string, date: string, isins: Set<string>, observedAt: string): DailyClose[] {
  if (!/^\s*TradDt,/.test(csv)) throw noSession(date);
  const rows: Record<string, string>[] = parse(csv, { columns: true, trim: true, bom: true, skip_empty_lines: true, relax_column_count: true });
  invariant(rows.length && ['TradDt', 'FinInstrmTp', 'ISIN', 'ClsPric', 'PrvsClsgPric'].every(k => k in rows[0]), 'BSE price report columns have changed');
  if (rows[0].TradDt !== date) throw noSession(date);
  const output = new Map<string, DailyClose>();
  for (const r of rows) {
    invariant(r.TradDt === date, 'BSE price report contains a different trading date');
    const close = price(r.ClsPric);
    if (r.FinInstrmTp !== 'STK' || !isins.has(r.ISIN) || close === null || output.has(r.ISIN)) continue;
    output.set(r.ISIN, { _id: `${r.ISIN}:${date}`, isin: r.ISIN, date, close, prevClose: price(r.PrvsClsgPric),
      exchange: 'BSE', source: 'bse-bhavcopy', sourceUrl: bseClosesUrl(date), observedAt });
  }
  invariant(output.size, 'BSE price report did not match any imported instruments');
  return [...output.values()];
}
