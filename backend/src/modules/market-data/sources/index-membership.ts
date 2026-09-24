import { parse } from 'csv-parse/sync';
import { invariant } from '../../../shared/errors.js';
import { object } from '../../../shared/http-client.js';

export interface Membership { isin?: string; securityId?: string; symbol?: string; industry: string; period?: string }
export interface IndexSource { id: string; name: string; exchange: 'NSE' | 'BSE'; url: string }
const nse = (id: string, name: string, file: string): IndexSource => ({ id, name, exchange: 'NSE', url: `https://www.niftyindices.com/IndexConstituent/${file}.csv` });
const bse = (id: string, name: string, code: number): IndexSource => ({ id, name, exchange: 'BSE', url: `https://www.bseindices.com/AsiaIndexAPI/api/Codewise_Indices/w?code=${code}` });
export const INDEX_SOURCES: IndexSource[] = [
  nse('nifty-50', 'NIFTY 50', 'ind_nifty50list'), nse('nifty-next-50', 'NIFTY NEXT 50', 'ind_niftynext50list'),
  nse('nifty-100', 'NIFTY 100', 'ind_nifty100list'), nse('nifty-200', 'NIFTY 200', 'ind_nifty200list'),
  nse('nifty-500', 'NIFTY 500', 'ind_nifty500list'), nse('nifty-bank', 'NIFTY BANK', 'ind_niftybanklist'),
  nse('nifty-it', 'NIFTY IT', 'ind_niftyitlist'), nse('nifty-auto', 'NIFTY AUTO', 'ind_niftyautolist'),
  nse('nifty-pharma', 'NIFTY PHARMA', 'ind_niftypharmalist'), nse('nifty-fmcg', 'NIFTY FMCG', 'ind_niftyfmcglist'),
  nse('nifty-metal', 'NIFTY METAL', 'ind_niftymetallist'), nse('nifty-realty', 'NIFTY REALTY', 'ind_niftyrealtylist'),
  bse('bse-sensex', 'BSE SENSEX', 16), bse('bse-100', 'BSE 100', 22), bse('bse-200', 'BSE 200', 23),
  bse('bse-500', 'BSE 500', 17), bse('bse-bankex', 'BSE BANKEX', 53), bse('bse-auto', 'BSE AUTO', 42),
  bse('bse-it', 'BSE Information Technology', 85), bse('bse-healthcare', 'BSE Healthcare', 84),
  bse('bse-metal', 'BSE METAL', 35), bse('bse-capital-goods', 'BSE CAPITAL GOODS', 25),
];
export function parseNiftyMembers(csv: string): Membership[] {
  const rows: Record<string, string>[] = parse(csv, { columns: true, trim: true, bom: true, skip_empty_lines: true });
  invariant(rows.length && ['ISIN Code', 'Symbol', 'Industry'].every(k => k in rows[0]), 'NIFTY constituent columns changed');
  // Exchange files can contain explicitly labelled dummy constituents with DUM... identifiers.
  // They are not exchange-tradable ISINs and must never become a stock in the universe.
  const tradable = rows.filter(r => !(r['ISIN Code'].startsWith('DUM') && /^Dummy\b/i.test(r['Company Name'])));
  invariant(tradable.every(r => /^IN[A-Z0-9]{10}$/.test(r['ISIN Code'])), 'Invalid ISIN in NIFTY file');
  return tradable.map(r => ({ isin: r['ISIN Code'], symbol: r.Symbol, industry: r.Industry }));
}
export function parseBseMembers(payload: unknown): Membership[] {
  const rows = object(payload).Table;
  invariant(Array.isArray(rows) && rows.length > 0, 'BSE constituents are unavailable');
  return rows.map(item => {
    const r = object(item); invariant(/^\d+$/.test(String(r.SCRIP_CODE)), 'Invalid BSE constituent security code');
    return { securityId: String(r.SCRIP_CODE), industry: String(r.Industry_name ?? ''), period: String(r.TransDate ?? '') };
  });
}
