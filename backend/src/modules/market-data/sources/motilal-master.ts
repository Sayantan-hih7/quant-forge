import { parse } from 'csv-parse/sync';
import { invariant } from '../../../shared/errors.js';
import type { Instrument } from '../types.js';

export const motilalMasterUrl = (exchange: 'NSE' | 'BSE') => `https://openapi.motilaloswal.com/getscripmastercsv?name=${exchange}`;
export function parseMotilalMappings(csv: string, exchange: 'NSE' | 'BSE', stocks: Instrument[]) {
  const rows: Record<string, string>[] = parse(csv, { columns: true, bom: true, trim: true, skip_empty_lines: true });
  invariant(rows.length && ['exchangename', 'scripcode', 'scripisinno', 'issuspended'].every(key => key in rows[0]), 'Motilal instrument columns changed');
  const byIsin = new Map<string, number[]>();
  for (const row of rows) {
    const code = Number(row.scripcode);
    if (row.exchangename !== exchange || row.issuspended !== 'N' || !Number.isSafeInteger(code) || code <= 0 || !/^INE[A-Z0-9]{9}$/.test(row.scripisinno)) continue;
    byIsin.set(row.scripisinno, [...byIsin.get(row.scripisinno) ?? [], code]);
  }
  return stocks.filter(x => x.exchange === exchange).flatMap(stock => {
    const codes = [...new Set(byIsin.get(stock.isin) ?? [])];
    const code = codes.includes(Number(stock.securityId)) ? Number(stock.securityId) : codes.length === 1 ? codes[0] : undefined;
    return code ? [{ id: stock._id, code }] : [];
  });
}
