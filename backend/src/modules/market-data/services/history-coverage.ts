export interface HistoryRange { from: string; to: string }

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
