import { parse } from 'csv-parse/sync';
import { invariant } from '../../../shared/errors.js';
import { numberOrNull, object } from '../../../shared/http-client.js';
import type { DeliveryDay, Fact, Instrument } from '../types.js';

export const NSE_PLEDGE_URL = 'https://www.nseindia.com/api/corporate-pledgedata?index=equities';
export const NSE_EQUITIES_URL = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';
export const NSE_HOLIDAYS_URL = 'https://www.nseindia.com/api/holiday-master?type=trading';
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function exchangeDate(input: string): string {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(input.trim());
  invariant(m && months.includes(m[2].toLowerCase()), 'Invalid exchange report date');
  const result = `${m[3]}-${String(months.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  invariant(new Date(result).toISOString().slice(0, 10) === result, 'Invalid exchange report date');
  return result;
}
export function deliveryUrl(date: string) {
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)), 'Invalid delivery date');
  return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${date.slice(8)}${date.slice(5, 7)}${date.slice(0, 4)}.csv`;
}
export function parseNseDelivery(csv: string, date: string, instruments: Instrument[], observedAt: string): DeliveryDay[] {
  const rows: Record<string, string>[] = parse(csv, { columns: (keys: string[]) => keys.map(k => k.trim()), trim: true, bom: true, skip_empty_lines: true });
  invariant(rows.length && ['SYMBOL', 'SERIES', 'DATE1', 'TTL_TRD_QNTY', 'TURNOVER_LACS', 'DELIV_QTY'].every(k => k in rows[0]), 'NSE delivery columns have changed');
  const lookup = new Map(instruments.filter(x => x.exchange === 'NSE').map(x => [`${x.symbol}:${x.series}`, x]));
  const output = new Map<string, DeliveryDay>();
  for (const r of rows) {
    invariant(exchangeDate(r.DATE1) === date, 'Delivery report contains a different trading date');
    const instrument = lookup.get(`${r.SYMBOL}:${r.SERIES}`);
    if (!instrument) continue;
    const volume = numberOrNull(r.TTL_TRD_QNTY), turnover = numberOrNull(r.TURNOVER_LACS), deliverable = numberOrNull(r.DELIV_QTY);
    invariant(volume !== null && volume >= 0 && turnover !== null && turnover >= 0, 'Invalid delivery volume/turnover');
    invariant(deliverable === null || deliverable >= 0 && deliverable <= volume, 'Invalid deliverable quantity');
    invariant(!output.has(instrument._id), 'Duplicate stock in delivery report');
    output.set(instrument._id, { _id: `nse:${instrument._id}:${date}`, instrumentId: instrument._id, date, volume,
      deliverable, turnoverCr: turnover / 100, source: 'nse-delivery', sourceUrl: deliveryUrl(date), observedAt,
      // Download date is the earliest availability we can verify. Do not invent a historical publication time.
      knownAt: observedAt });
  }
  invariant(output.size, 'NSE delivery report did not match any imported instruments');
  return [...output.values()];
}
export function monthlyDelivery(days: DeliveryDay[], month: string, expectedDates: string[], observedAt: string): Fact[] {
  invariant(expectedDates.length > 0 && expectedDates.every(x => x.startsWith(month)), 'Month needs a verified session list');
  const byStock = new Map<string, DeliveryDay[]>();
  for (const day of days.filter(d => expectedDates.includes(d.date))) byStock.set(day.instrumentId, [...byStock.get(day.instrumentId) ?? [], day]);
  const facts: Fact[] = [];
  for (const [instrumentId, records] of byStock) {
    // Missing trading sessions or delivery values must not turn into an apparently complete monthly metric.
    if (new Set(records.map(r => r.date)).size !== expectedDates.length) continue;
    const totalVolume = records.reduce((s, r) => s + r.volume, 0);
    const values: Record<string, number> = { tradedValue: records.reduce((s, r) => s + r.turnoverCr, 0),
      turnover: records.reduce((s, r) => s + r.turnoverCr, 0) / records.length };
    if (totalVolume > 0 && records.every(r => r.deliverable !== null)) values.delivery = 100 * records.reduce((s, r) => s + r.deliverable!, 0) / totalVolume;
    const [y, m] = month.split('-').map(Number);
    for (const [field, value] of Object.entries(values)) facts.push({
      _id: `nse-month:${instrumentId}:${field}:${month}`, instrumentId, field, value, source: 'nse-monthly-delivery',
      sourceUrl: 'https://www.nseindia.com/all-reports', observedAt, knownAt: observedAt, period: month,
      validUntil: new Date(Date.UTC(y, m + 1, 1) - 19800000).toISOString(), basis: 'derived',
    });
  }
  return facts;
}
export function companyNameKey(value: string) {
  return value.toUpperCase().replace(/\bLIMITED\b/g, 'LTD').replace(/\bAND\b/g, '&').replace(/[^A-Z0-9]/g, '');
}
export function parseNsePledge(payload: unknown, equityCsv: string, instruments: Instrument[], observedAt: string) {
  const rows = object(payload).data;
  invariant(Array.isArray(rows), 'NSE pledge response format changed');
  const companies: Record<string, string>[] = parse(equityCsv, { columns: (keys: string[]) => keys.map(k => k.trim()), trim: true, bom: true });
  invariant(companies.length && 'NAME OF COMPANY' in companies[0] && 'ISIN NUMBER' in companies[0], 'NSE company master columns changed');
  const names = new Map<string, Set<string>>();
  for (const c of companies) {
    const name = companyNameKey(c['NAME OF COMPANY']);
    names.set(name, new Set([...(names.get(name) ?? []), c['ISIN NUMBER']]));
  }
  const facts: Fact[] = []; let unmatched = 0;
  for (const item of rows) {
    const r = object(item), isin = names.get(companyNameKey(String(r.comName ?? '')));
    if (!isin || isin.size !== 1) { unmatched++; continue; } // No fuzzy joins on similar company names.
    const value = numberOrNull(r.percPromoterShares);
    if (value === null || value < 0 || value > 100 || typeof r.shp !== 'string') continue;
    const period = exchangeDate(r.shp);
    if (Date.parse(period) > Date.parse(observedAt)) continue;
    for (const instrument of instruments.filter(x => isin.has(x.isin))) facts.push({
      _id: `nse-pledge:${instrument._id}:${observedAt}`, instrumentId: instrument._id, field: 'pledge', value,
      source: 'nse-pledge', sourceUrl: NSE_PLEDGE_URL, observedAt, knownAt: observedAt, period,
      validUntil: new Date(Date.parse(period) + 150 * 86400000).toISOString(), basis: 'observed-snapshot',
    });
  }
  return { facts, unmatched, reported: rows.length };
}
export function regularNseSessions(payload: unknown, month: string) {
  invariant(/^\d{4}-\d{2}$/.test(month), 'Invalid month');
  const rows = object(payload).CM;
  invariant(Array.isArray(rows) && rows.length, 'NSE cash-market calendar is unavailable');
  const dates = rows.map(x => exchangeDate(String(object(x).tradingDate)));
  invariant(dates.some(x => x.startsWith(month.slice(0, 4))), 'Exchange calendar does not cover the requested year');
  const holidays = new Set(dates);
  const [y, m] = month.split('-').map(Number);
  const result: string[] = [];
  for (let d = new Date(Date.UTC(y, m - 1, 1)); d.getUTCMonth() === m - 1; d = new Date(d.getTime() + 86400000)) {
    const date = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidays.has(date)) result.push(date);
  }
  // This calendar covers regular sessions. Special weekend/Muhurat sessions need an explicit exchange calendar import.
  return result;
}
