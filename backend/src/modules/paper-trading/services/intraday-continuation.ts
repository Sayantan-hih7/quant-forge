import { marketTime, marketSession } from '../../../shared/market-calendar.js';
import { entryCutoffMinute } from './entry-safety.js';

export function carriedIntradayPositions(overnight: boolean, positions: { openedAt: string }[], now: number) {
  if (overnight) return [];
  const today = marketTime(now).date;
  return positions.filter(p => !Number.isFinite(Date.parse(p.openedAt)) || marketTime(Date.parse(p.openedAt)).date < today);
}

/** Derived from persisted controls and the server calendar; never resets the account. */
export function intradayContinuation(session: {
  active: boolean; entriesPaused: boolean; lossLimitDate?: string;
  strategy: { risk: { overnight: boolean; entryCutoffMinute?: number } };
}, positions: { openedAt: string; instrumentId: string }[], eligibleIds: string[], now = Date.now()) {
  if (session.strategy.risk.overnight) return undefined;
  const clock = marketTime(now), calendar = marketSession(now);
  const carried = carriedIntradayPositions(false, positions, now).length;
  const unfinished = carried || (!clock.open || positions.every(p => clock.minute >= entryCutoffMinute(session.strategy.risk, p.instrumentId, now)) ? positions.length : 0);
  const entryWindow = clock.open && eligibleIds.some(id => clock.minute < entryCutoffMinute(session.strategy.risk, id, now));
  return {
    date: clock.date, nextOpenAt: calendar.nextOpenAt, calendarKnown: clock.knownYear,
    continuation: !session.active ? 'stopped' : session.entriesPaused ? 'paused' : 'automatic',
    phase: !session.active ? 'stopped' : unfinished ? 'unfinished-exits' : session.entriesPaused ? 'paused'
      : !clock.knownYear ? 'calendar-unavailable' : !eligibleIds.length ? 'qualification-required'
      : session.lossLimitDate === clock.date ? 'daily-loss-limit' : entryWindow ? 'monitoring' : 'waiting-session',
    unfinishedPositions: unfinished, eligibleStocks: eligibleIds.length,
  };
}
