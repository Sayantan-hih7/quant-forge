import { marketTime } from '../../../shared/market-calendar.js';
import type { QuoteSnapshot } from '../types.js';
const refreshMs = 120_000;
export function discoverySession(now = Date.now()) {
  const clock = marketTime(now);
  if (!clock.knownYear) return null;
  for (let day = 0; day < 15; day++) {
    const at = Date.parse(`${clock.date}T15:30:00+05:30`) - day * 86_400_000;
    const candidate = marketTime(at);
    if (candidate.tradingDay && (day > 0 || clock.minute >= 555)) return { date: candidate.date, close: at };
  }
  return null;
}
export function snapshotDue(cache: QuoteSnapshot | null, now = Date.now(), explicit = false) {
  const session = discoverySession(now);
  if (!session || now - Date.parse(cache?.attemptedAt ?? '1970-01-01') < refreshMs) return false;
  // One initial snapshot / one closing update; no automatic weekend or holiday polling.
  return explicit || marketTime(now).open || !cache?.attemptedAt || Date.parse(cache.attemptedAt) < session.close;
}
