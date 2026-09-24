import { parse } from 'csv-parse/sync';
import { invariant } from '../../../shared/errors.js';
import { numberOrNull, object } from '../../../shared/http-client.js';
import type { DeliveryDay, Fact, Instrument } from '../types.js';

export const BSE_PLEDGE_URL = 'https://api.bseindia.com/BseIndiaAPI/api/ConsolidatePledge/w?flag=&scripcode=';
export function parseBsePledge(payload: unknown, instruments: Instrument[], observedAt: string) {
  const rows = object(payload).Table;
  invariant(Array.isArray(rows) && rows.length, 'BSE pledge response format changed');
  const lookup = new Map(instruments.filter(x => x.exchange === 'BSE').map(x => [x.securityId, x.isin]));
  const facts: Fact[] = []; let unmatched = 0;
  for (const item of rows) {
    const r = object(item), isin = lookup.get(String(r.Fld_ScripCode));
    if (!isin) { unmatched++; continue; }
    const value = numberOrNull(r.PROMOTEREncum_Percof_PromoterShares);
    const rawPeriod = String(r.Fld_EndDate ?? '');
    if (value === null || value < 0 || value > 100 || !/^\d{8}$/.test(rawPeriod)) continue;
    const period = `${rawPeriod.slice(0, 4)}-${rawPeriod.slice(4, 6)}-${rawPeriod.slice(6)}`;
    if (!Number.isFinite(Date.parse(period)) || Date.parse(period) > Date.parse(observedAt)) continue;
    for (const instrument of instruments.filter(x => x.isin === isin)) facts.push({
      _id: `bse-pledge:${instrument._id}:${observedAt}`, instrumentId: instrument._id, field: 'pledge', value,
      source: 'bse-pledge', sourceUrl: BSE_PLEDGE_URL, period, observedAt, knownAt: observedAt,
      validUntil: new Date(Date.parse(period) + 150 * 86400000).toISOString(), basis: 'observed-snapshot',
    });
  }
  return { facts, reported: rows.length, unmatched };
}

export function bseDeliveryUrl(date: string) {
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)), 'Invalid report date');
  return `https://www.bseindia.com/BSEDATA/gross/${date.slice(0, 4)}/SCBSEALL${date.slice(8)}${date.slice(5, 7)}.TXT`;
}
export function parseBseDelivery(text: string, date: string, instruments: Instrument[], observedAt: string): DeliveryDay[] {
  const rows: Record<string, string>[] = parse(text.replace(/\r+/g, '\n'), { delimiter: '|', columns: true, bom: true, trim: true, skip_empty_lines: true });
  invariant(rows.length && ['DATE', 'SCRIP CODE', 'DELIVERY QTY', "DAY'S VOLUME", "DAY'S TURNOVER"].every(k => k in rows[0]), 'BSE delivery columns changed');
  const lookup = new Map(instruments.filter(x => x.exchange === 'BSE').map(x => [x.securityId, x]));
  const output = new Map<string, DeliveryDay>();
  for (const r of rows) {
    invariant(r.DATE === `${date.slice(8)}${date.slice(5, 7)}${date.slice(0, 4)}`, 'BSE report contains a different date');
    const x = lookup.get(r['SCRIP CODE']);
    if (!x) continue;
    const volume = numberOrNull(r["DAY'S VOLUME"]), deliverable = numberOrNull(r['DELIVERY QTY']), turnover = numberOrNull(r["DAY'S TURNOVER"]);
    invariant(volume !== null && volume >= 0 && turnover !== null && turnover >= 0, 'Invalid BSE volume/turnover');
    invariant(deliverable === null || deliverable >= 0 && deliverable <= volume, 'Invalid BSE deliverable quantity');
    invariant(!output.has(x._id), 'Duplicate BSE delivery instrument');
    output.set(x._id, { _id: `bse:${x._id}:${date}`, instrumentId: x._id, date, volume, deliverable,
      turnoverCr: turnover / 10_000_000, source: 'bse-delivery', sourceUrl: bseDeliveryUrl(date), observedAt, knownAt: observedAt });
  }
  invariant(output.size, 'BSE delivery report did not match imported instruments');
  return [...output.values()];
}
