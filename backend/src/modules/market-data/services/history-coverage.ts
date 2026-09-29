import { marketTime } from '../../../shared/market-calendar.js';
export interface HistoryRange { from: string; to: string }

/** Only skip days the configured regular-session calendar can establish as closed. */
export function isClosedHistoryRange(from: string, to: string) {
  const start = Date.parse(`${from}T09:15:00+05:30`), end = Date.parse(`${to}T09:15:00+05:30`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return false;
  for (let at = start; at < end; at += 86_400_000) {
    const day = marketTime(at);
    if (!day.knownYear || day.tradingDay) return false;
  }
  return true;
}

/** Half-open calendar ranges, matching Dhan's inclusive from / exclusive to. */
export function missingHistoryRanges(from: string, to: string, covered: HistoryRange[]): HistoryRange[] {
  if (from >= to) return [];
  const missing: HistoryRange[] = [];
  let cursor = from;
  for (const range of [...covered].sort((a, b) => a.from.localeCompare(b.from))) {
    if (range.to <= cursor || range.from >= to) continue;
    if (range.from > cursor) missing.push({ from: cursor, to: range.from });
    cursor = range.to > cursor ? range.to : cursor;
    if (cursor >= to) break;
  }
  if (cursor < to) missing.push({ from: cursor, to });
  return missing;
}
