import { parse } from 'csv-parse/sync';
import { invariant } from '../../../shared/errors.js';
import { numberOrNull } from '../../../shared/http-client.js';
import type { Instrument } from '../types.js';

export const DHAN_MASTER_URL = 'https://images.dhan.co/api-data/api-scrip-master-detailed.csv';
export function parseDhanMaster(csv: string, observedAt: string): Instrument[] {
  const rows: Record<string, string>[] = parse(csv, { columns: true, bom: true, trim: true, skip_empty_lines: true });
  invariant(rows.length && ['EXCH_ID', 'SEGMENT', 'SECURITY_ID', 'INSTRUMENT_TYPE', 'ISIN', 'UNDERLYING_SYMBOL'].every(k => k in rows[0]), 'Dhan master columns have changed');
  const instruments = new Map<string, Instrument>();
  for (const r of rows) {
    // Dhan labels bonds/ETFs as EQUITY too; ES + corporate ISIN excludes funds and debt.
    if (!['NSE', 'BSE'].includes(r.EXCH_ID) || r.SEGMENT !== 'E' || r.INSTRUMENT !== 'EQUITY'
      || r.INSTRUMENT_TYPE !== 'ES' || !/^INE[A-Z0-9]{9}$/.test(r.ISIN)) continue;
    if (!/^\d+$/.test(r.SECURITY_ID) || !r.UNDERLYING_SYMBOL) continue;
    const _id = `${r.EXCH_ID}:${r.SECURITY_ID}`;
    invariant(!instruments.has(_id), `Duplicate instrument identifier ${_id}`);
    instruments.set(_id, { _id, exchange: r.EXCH_ID as 'NSE' | 'BSE', securityId: r.SECURITY_ID,
      isin: r.ISIN, symbol: r.UNDERLYING_SYMBOL, name: r.SYMBOL_NAME || r.DISPLAY_NAME,
      series: r.SERIES, lotSize: numberOrNull(r.LOT_SIZE) ?? 1,
      active: r.BUY_SELL_INDICATOR !== 'N', primary: false, observedAt });
  }
  invariant(instruments.size > 0, 'No cash equities found in master');
  // One primary listing per ISIN prevents scanning the same company twice. Keep other listings searchable.
  const selected = new Map<string, Instrument>();
  const rank = (x: Instrument) => (x.active ? 0 : 100) + (x.exchange === 'NSE' ? 0 : 10) + (x.series === 'EQ' ? 0 : 1);
  for (const x of instruments.values()) if (!selected.has(x.isin) || rank(x) < rank(selected.get(x.isin)!)) selected.set(x.isin, x);
  for (const x of selected.values()) x.primary = true;
  return [...instruments.values()];
}
