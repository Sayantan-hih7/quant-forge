import { AppError, invariant } from '../../../shared/errors.js';
import { numberOrNull, object } from '../../../shared/http-client.js';
import type { Fact, Instrument } from '../types.js';

export const DHAN_PUBLIC_SEARCH_URL = 'https://openweb-search.dhan.co/DhanSearch';
export const dhanPublicFields = new Set(['roe', 'roce']);
export const dhanPublicParserVersion = 2;
const day = 86_400_000;

export function dhanCompanyPage(slug: string) {
  invariant(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length < 200, 'Invalid Dhan company page');
  return `https://dhan.co/stocks/${slug}-share-price/`;
}

export function findDhanCompanyPage(payload: unknown, isin: string): string | undefined {
  const root = object(payload);
  invariant(String(root.code) === '0', 'Dhan public stock search is unavailable');
  if (root.data == null) return undefined;
  invariant(Array.isArray(root.data), 'Dhan public stock search format changed');
  const slugs = new Set(root.data.map(object)
    .filter(row => row.ISIN_code_s === isin && row.exchInstname_s === 'EQUITY')
    .map(row => String(row.Seo_symbol_s ?? '')));
  // Never accept the first search result or guess from a similarly named company.
  if (slugs.size !== 1) return undefined;
  return dhanCompanyPage([...slugs][0]);
}

function reportDate(value: unknown, observedAt: string) {
  const text = String(value ?? '');
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(text)) return undefined;
  const at = Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4)), 0);
  if (at > Date.parse(observedAt) || Date.parse(observedAt) - at > 550 * day) return undefined;
  return new Date(at).toISOString().slice(0, 10);
}

function annualValue(section: unknown, field: string, year: string) {
  const data = object(section), years = String(data.YEAR ?? '').split('|');
  const values = String(data[field] ?? '').split('|');
  if (years.length !== values.length || new Set(years).size !== years.length) return null;
  const index = years.indexOf(year);
  return index < 0 ? null : numberOrNull(values[index]);
}

export function parseDhanPublicCompany(html: string, stock: Instrument, sourceUrl: string, observedAt: string): Fact[] {
  invariant(/^https:\/\/dhan\.co\/stocks\/[a-z0-9-]+-share-price\/$/.test(sourceUrl), 'Invalid Dhan public source URL');
  // Read embedded JSON only; never execute a provider's script or HTML.
  const json = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i)?.[1];
  if (!json) throw new AppError(502, 'DHAN_PUBLIC_FORMAT', 'Dhan company page no longer contains readable financial data');
  let root: Record<string, unknown>;
  try { root = object(JSON.parse(json)); }
  catch { throw new AppError(502, 'DHAN_PUBLIC_FORMAT', 'Dhan company page contains invalid financial data'); }
  const props = object(object(root.props).pageProps), financials = object(props.fundamentalsData);
  invariant(Array.isArray(props.stock_data) && props.stock_data.some(row => object(row).CSM_ISIN_CODE === stock.isin)
    && financials.isin === stock.isin, 'Dhan public financial data does not match this company ISIN');
  const ratios = object(financials.roce_roe);
  const statementBasis = ratios.TYPES_OF_COMPANY === 'CONSOLIDATED' ? 'consolidated'
    : ratios.TYPES_OF_COMPANY === 'STANDALONE' ? 'standalone' : undefined;
  const rows: Fact[] = [];
  function add(field: string, value: number, year: string, accounting: 'consolidated' | 'standalone', calculation?: Fact['calculation']) {
    const period = reportDate(year, observedAt);
    if (!period || !Number.isFinite(value)) return;
    rows.push({ _id: `dhan-public:${stock._id}:${field}:${observedAt}`, instrumentId: stock._id, field, value,
      source: 'dhan-public-company', sourceUrl, observedAt, knownAt: observedAt, period, statementBasis: accounting,
      validUntil: new Date(Math.min(Date.parse(observedAt) + 7 * day, Date.parse(period) + 550 * day)).toISOString(),
      basis: calculation ? 'derived' : 'observed-snapshot', ...(calculation ? { calculation } : {}) });
  }
  if (statementBasis) for (const [key, field] of [['ROE', 'roe'], ['ROCE', 'roce']]) {
    const value = numberOrNull(ratios[key]);
    if (value !== null) add(field, value, String(ratios.YEAR ?? ''), statementBasis);
  }
  if (!rows.some(row => row.field === 'roe')) {
    // Closing total equity matches the website's annual ROE convention. Do not
    // substitute EPS/book value, mix statement bases, or use a forming quarter.
    for (const [suffix, accounting] of [['c', 'consolidated'], ['s', 'standalone']] as const) {
      const income = object(financials[`incomeStat_${suffix}y`]), balance = object(financials[`bs_${suffix}`]);
      const years = String(income.YEAR ?? '').split('|').filter(year => reportDate(year, observedAt)).sort().reverse();
      const year = years[0];
      // An obsolete consolidated ratio must not suppress current standalone
      // annual statements. Both calculation operands still use the same basis.
      const currentRatioBasis = reportDate(ratios.YEAR, observedAt) ? statementBasis : undefined;
      if (!year || currentRatioBasis && currentRatioBasis !== accounting) continue;
      const netIncome = annualValue(income, 'NET_PROFIT', year), equity = annualValue(balance, 'TOTAL_EQUITY', year);
      if (netIncome === null || equity === null || equity <= 0) continue;
      add('roe', netIncome / equity * 100, year, accounting,
        { method: 'annual-net-profit / closing-total-equity * 100', netIncome, equity, unit: 'INR crore' });
      break;
    }
  }
  // Periods describe the statements, not when we knew the values. These current
  // website snapshots must never be backdated into historical backtests.
  return rows;
}
