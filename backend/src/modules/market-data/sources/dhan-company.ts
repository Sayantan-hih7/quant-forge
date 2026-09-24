import { invariant } from '../../../shared/errors.js';
import { numberOrNull, object } from '../../../shared/http-client.js';
import type { Fact, Instrument } from '../types.js';

export const DHAN_COMPANY_URL = 'https://api.dhan.co/v2/data/companyinfo';
const fields: Record<string, Record<string, string>> = {
  CO: { MARKET_CAP: 'marketCap', SECTOR: 'sector', INDUSTRY: 'industry', EPS: 'eps', BOOK_VALUE: 'bookValue' },
  RATIOS: { DEBT_TO_EQUITY: 'debtEquity', ROE: 'roe', ROCE: 'roce', PE_RATIO: 'pe', PB_RATIO: 'pb' },
  SHP: { PROMOTER_HOLDING: 'promoterHolding', FII_HOLDING: 'fiiHolding', DII_HOLDING: 'diiHolding',
    CHANGE_IN_FII_HOLDING: 'fiiChange', CHANGE_IN_DII_HOLDING: 'diiChange' },
};
function reportingDate(raw: unknown) {
  const text = String(raw ?? '').replaceAll('-', '');
  if (!/^\d{6}(\d{2})?$/.test(text)) return undefined;
  const year = Number(text.slice(0, 4)), month = Number(text.slice(4, 6));
  if (year < 2000 || month < 1 || month > 12) return undefined;
  const date = text.length === 6 ? new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) : `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`;
  return Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : undefined;
}
export function parseDhanCompany(payload: unknown, instrument: Instrument, observedAt: string): Fact[] {
  const root = object(payload);
  invariant(String(root.securityId) === instrument.securityId, 'Dhan company response instrument mismatch');
  const data = object(root.data);
  invariant(Object.keys(fields).some(k => k in data), 'Dhan company response has no documented sections');
  const facts: Fact[] = [];
  for (const [section, keys] of Object.entries(fields)) {
    const values = object(data[section]);
    const period = section === 'SHP' ? reportingDate(values.REPORTING_PERIOD) : undefined;
    if (section === 'SHP' && (!period || Date.parse(period) > Date.parse(observedAt))) continue;
    for (const [key, field] of Object.entries(keys)) {
      const value = ['sector', 'industry'].includes(field) ? (typeof values[key] === 'string' && String(values[key]).trim() || null) : numberOrNull(values[key]);
      if (value === null) continue;
      if (['marketCap', 'promoterHolding', 'fiiHolding', 'diiHolding'].includes(field) && (Number(value) < 0 || field !== 'marketCap' && Number(value) > 100)) continue;
      facts.push({ _id: `dhan:${instrument._id}:${field}:${observedAt}`, instrumentId: instrument._id,
        field, value, source: 'dhan-company', sourceUrl: DHAN_COMPANY_URL, observedAt, knownAt: observedAt,
        period,
        validUntil: new Date(section === 'SHP' ? Date.parse(period!) + 150 * 86400000 : Date.parse(observedAt) + 35 * 86400000).toISOString(),
        basis: 'observed-snapshot' });
    }
  }
  invariant(facts.length, 'Dhan returned no usable company metrics');
  // The endpoint has no historical as-of argument or publication timestamp. Never backdate this snapshot.
  return facts;
}
