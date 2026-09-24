import { parse } from 'csv-parse/sync';
import { numberOrNull, object } from '../../../shared/http-client.js';
import { indexInstruments } from '../config/index-catalog.js';
import type { IndexInstrument, IndexPoint, IndexSnapshot } from '../types.js';

// Ignore spelling/punctuation differences, never match a prefix (NIFTY 50 != NIFTY 500).
export const indexKey = (name: string) => name.toUpperCase().replace(/\bINDEX\b/g, '').replace(/\bAND\b/g, '&').replace(/[^A-Z0-9]/g, '');
const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
export function sourceTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  const named = value.match(/^(?:\w{3}\s+)?(?:(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})|([A-Za-z]{3}) (\d{1,2}) (\d{4}))(?: (\d{2}:\d{2}(?::\d{2})?))?$/);
  if (named) {
    const month = months.indexOf((named[2] ?? named[4]).toLowerCase()) + 1;
    if (!month) return null;
    value = `${named[3] ?? named[6]}-${String(month).padStart(2,'0')}-${(named[1] ?? named[5]).padStart(2,'0')}T${named[7] ?? '00:00:00'}+05:30`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/Z|[+-]\d\d:\d\d$/.test(value)) value += '+05:30';
  else if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
const positive = (value: unknown) => { const n = numberOrNull(value); return n !== null && n > 0 ? n : null; };
function base(instrument: IndexInstrument, last: number, asOf: string, source: string, sourceUrl: string, fetchedAt: string): IndexSnapshot {
  return { id: instrument.id, name: instrument.name, exchange: instrument.exchange, last, asOf, source, sourceUrl, fetchedAt,
    previousClose: null, change: null, percent: null, open: null, high: null, low: null, high52w: null, low52w: null,
    kind: 'snapshot', points: [], chartKind: 'observed' };
}
export function parseNseSnapshot(payload: unknown, url: string, now: string): IndexSnapshot[] {
  const root = object(payload); const asOf = sourceTime(root.timestamp);
  if (!asOf || !Array.isArray(root.data)) return [];
  const byName = new Map(root.data.map(raw => { const r = object(raw); return [indexKey(String(r.index)), r]; }));
  return indexInstruments.filter(i => i.exchange === 'NSE').flatMap(i => {
    const r = byName.get(indexKey(i.providerName ?? i.name)); const last = positive(r?.last);
    if (!r || last === null) return [];
    const dates = object(root.dates);
    const references = [
      ['Previous day', r.previousDayVal, r.previousDay ?? dates.previousDay],
      ['1 week ago', r.oneWeekAgoVal, r.oneWeekAgo ?? dates.oneWeekAgo],
      ['1 month ago', r.oneMonthAgoVal, r.date30dAgo ?? dates.oneMonthAgo],
      ['1 year ago', r.oneYearAgoVal, r.date365dAgo ?? dates.oneYearAgo],
    ].flatMap(([label, value, date]) => { const n = positive(value); const time = sourceTime(date); return n !== null && time ? [{ label: String(label), value: n, date: tradingDate(time) }] : []; });
    return [{ ...base(i, last, asOf, 'NSE website', url, now), references,
      advances: numberOrNull(r.advances), declines: numberOrNull(r.declines), unchanged: numberOrNull(r.unchanged),
      pe: numberOrNull(r.pe), pb: numberOrNull(r.pb), dividendYield: numberOrNull(r.dy), previousClose: positive(r.previousClose),
      change: numberOrNull(r.variation), percent: numberOrNull(r.percentChange), open: positive(r.open), high: positive(r.high),
      low: positive(r.low), high52w: positive(r.yearHigh), low52w: positive(r.yearLow) }];
  });
}
export function parseNseDaily(csv: string, url: string, now: string): IndexSnapshot[] {
  const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  const byName = new Map(rows.map(r => [indexKey(r['Index Name'] ?? ''), r]));
  return indexInstruments.filter(i => i.exchange === 'NSE').flatMap(i => {
    const r = byName.get(indexKey(i.name)); const last = positive(r?.['Closing Index Value']);
    const date = r?.['Index Date']?.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!r || last === null || !date) return [];
    const asOf = sourceTime(`${date[3]}-${date[2]}-${date[1]}T15:30:00`); if (!asOf) return [];
    const change = numberOrNull(r['Points Change']);
    return [{ ...base(i, last, asOf, 'NSE daily report', url, now), kind: 'eod' as const, chartKind: 'daily' as const,
      points: [{ time: Date.parse(asOf), value: last }], change, percent: numberOrNull(r['Change(%)']),
      previousClose: change === null ? null : Math.round((last - change) * 100) / 100,
      open: positive(r['Open Index Value']), high: positive(r['High Index Value']), low: positive(r['Low Index Value']) }];
  });
}
export function parseNiftySnapshot(payload: unknown, url: string, now: string): IndexSnapshot[] {
  const rows = object(payload).data; if (!Array.isArray(rows)) return [];
  const byName = new Map(rows.map(raw => { const r = object(raw); return [indexKey(String(r.indexName)), r]; }));
  return indexInstruments.filter(i => i.exchange === 'NSE').flatMap(i => {
    const r = byName.get(indexKey(i.niftyName ?? i.name)); const last = positive(r?.last); const asOf = sourceTime(r?.timeVal);
    if (!r || last === null || !asOf) return [];
    const previousClose = positive(r.previousClose);
    return [{ ...base(i,last,asOf,'NSE Indices website',url,now), previousClose,
      change: previousClose === null ? null : Math.round((last-previousClose)*100)/100,
      percent: numberOrNull(r.percChange), open: positive(r.open), high: positive(r.high), low: positive(r.low),
      high52w: positive(r.yearHigh), low52w: positive(r.yearLow) }];
  });
}
export function parseBseSnapshot(payload: unknown, url: string, now: string): IndexSnapshot[] {
  const rows = object(payload).Table; if (!Array.isArray(rows)) return [];
  const byCode = new Map(rows.map(raw => { const r = object(raw); return [String(r.code), r]; }));
  return indexInstruments.filter(i => i.exchange === 'BSE').flatMap(i => {
    const r = byCode.get(i.providerCode ?? ''); const last = positive(r?.LTP); const asOf = sourceTime(r?.DT_TM);
    if (!r || last === null || !asOf) return [];
    const change = numberOrNull(r.change);
    return [{ ...base(i, last, asOf, 'BSE website', url, now), change, percent: numberOrNull(r.PERCENTCHG),
      previousClose: change === null ? null : Math.round((last - change) * 100) / 100 }];
  });
}
export function parseBseChart(payload: unknown, daily: boolean): IndexPoint[] {
  if (typeof payload !== 'string' || !payload.includes('#@#')) return [];
  let rows: unknown; try { rows = JSON.parse(payload.split('#@#')[1]); } catch { return []; }
  if (!Array.isArray(rows)) return [];
  const points = rows.flatMap(raw => {
    const r = object(raw); const asOf = sourceTime(r.date); const value = positive(r.value);
    // value1 is the indicative pre-open auction, not regular trading; never mix the two.
    if (!asOf || value === null) return [];
    const time = Date.parse(asOf) + (daily ? (15 * 60 + 30) * 60_000 : 0);
    return [{ time, value }];
  });
  return [...new Map(points.map(p => [p.time, p])).values()].sort((a,b) => a.time-b.time);
}
export function bseDailySnapshot(i: IndexInstrument, points: IndexPoint[], url: string, now: string): IndexSnapshot | null {
  const last = points.at(-1); const previous = points.at(-2); if (!last) return null;
  const change = previous ? Math.round((last.value - previous.value) * 100) / 100 : null;
  return { ...base(i, last.value, new Date(last.time).toISOString(), 'BSE Index Services', url, now), kind: 'eod',
    chartKind: 'daily', points, previousClose: previous?.value ?? null, change,
    percent: previous && change !== null ? Math.round(change / previous.value * 10000) / 100 : null };
}
export function tradingDate(iso: string | number) { return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0,10); }
export function mergeSnapshots(previous: IndexSnapshot[], incoming: IndexSnapshot[]): IndexSnapshot[] {
  const result = new Map(previous.map(q => [q.id, q]));
  for (const next of incoming) {
    const before = result.get(next.id);
    // Reject future provider timestamps and never replace a newer quote with older fallback data.
    if (Date.parse(next.asOf) > Date.parse(next.fetchedAt) + 60_000 || (before && Date.parse(before.asOf) > Date.parse(next.asOf))) continue;
    let points = next.points;
    if (next.kind === 'snapshot') {
      const history = before?.kind === 'snapshot' && before.chartKind === 'observed' ? before.points : [];
      points = [...history.filter(p => tradingDate(p.time) === tradingDate(next.asOf)), { time: Date.parse(next.asOf), value: next.last }];
    } else if (before?.kind === 'eod') points = [...before.points, ...points];
    points = [...new Map(points.map(p => [p.time, p])).values()].sort((a,b) => a.time-b.time).slice(-450);
    result.set(next.id, { ...next, points });
  }
  return [...result.values()];
}
