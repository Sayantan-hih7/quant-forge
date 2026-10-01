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
  // Size tiers: official exchange classification beyond the top 500.
  nse('nifty-midcap-150', 'NIFTY MIDCAP 150', 'ind_niftymidcap150list'), nse('nifty-smallcap-250', 'NIFTY SMALLCAP 250', 'ind_niftysmallcap250list'),
  nse('nifty-microcap-250', 'NIFTY MICROCAP 250', 'ind_niftymicrocap250_list'), nse('nifty-total-market', 'NIFTY TOTAL MARKET', 'ind_niftytotalmarket_list'),
  nse('nifty-oil-gas', 'NIFTY OIL & GAS', 'ind_niftyoilgaslist'), nse('nifty-energy', 'NIFTY ENERGY', 'ind_niftyenergylist'),
  nse('nifty-healthcare', 'NIFTY HEALTHCARE', 'ind_niftyhealthcarelist'), nse('nifty-financial-services', 'NIFTY FINANCIAL SERVICES', 'ind_niftyfinancelist'),
  nse('nifty-psu-bank', 'NIFTY PSU BANK', 'ind_niftypsubanklist'), nse('nifty-private-bank', 'NIFTY PRIVATE BANK', 'ind_nifty_privatebanklist'),
  nse('nifty-consumer-durables', 'NIFTY CONSUMER DURABLES', 'ind_niftyconsumerdurableslist'), nse('nifty-media', 'NIFTY MEDIA', 'ind_niftymedialist'),
  nse('nifty-chemicals', 'NIFTY CHEMICALS', 'ind_niftychemicals_list'), nse('nifty-infrastructure', 'NIFTY INFRASTRUCTURE', 'ind_niftyinfralist'),
  nse('nifty-pse', 'NIFTY PSE', 'ind_niftypselist'), nse('nifty-cpse', 'NIFTY CPSE', 'ind_niftycpselist'),
  nse('nifty-india-defence', 'NIFTY INDIA DEFENCE', 'ind_niftyindiadefence_list'), nse('nifty-capital-markets', 'NIFTY CAPITAL MARKETS', 'ind_niftycapitalmarkets_list'),
  nse('nifty-housing', 'NIFTY HOUSING', 'ind_niftyhousing_list'), nse('nifty-india-manufacturing', 'NIFTY INDIA MANUFACTURING', 'ind_niftyindiamanufacturing_list'),
  bse('bse-sensex', 'BSE SENSEX', 16), bse('bse-100', 'BSE 100', 22), bse('bse-200', 'BSE 200', 23),
  bse('bse-500', 'BSE 500', 17), bse('bse-bankex', 'BSE BANKEX', 53), bse('bse-auto', 'BSE AUTO', 42),
  bse('bse-it', 'BSE Information Technology', 85), bse('bse-healthcare', 'BSE Healthcare', 84),
  bse('bse-metal', 'BSE METAL', 35), bse('bse-capital-goods', 'BSE CAPITAL GOODS', 25),
];
export function parseNiftyMembers(csv: string): Membership[] {
  const rows: Record<string, string>[] = parse(csv, { columns: true, trim: true, bom: true, skip_empty_lines: true });
  invariant(rows.length && ['ISIN Code', 'Symbol', 'Industry'].every(k => k in rows[0]), 'NIFTY constituent columns changed');
  // Exchange files can contain explicitly labelled dummy constituents (demerger placeholders)
  // with DUM.../DU1... identifiers. They are not tradable ISINs and never become a stock.
  const tradable = rows.filter(r => !(r['ISIN Code'].startsWith('DU') && /^Dummy\b/i.test(r['Company Name'] ?? r.Company ?? '')));
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
