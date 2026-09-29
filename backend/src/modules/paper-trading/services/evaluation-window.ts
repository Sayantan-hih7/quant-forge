import { marketTime, nextRegularOpen } from '../../../shared/market-calendar.js';

/** A valid buy signal creates a day limit order; signal discovery keeps its
 * shorter evaluation window so missed signals cannot replay all afternoon. */
export function signalOrderExpiry(windowExpiry: string, dayLimit: boolean, overnight: boolean) {
  if (!dayLimit) return windowExpiry;
  const date = marketTime(Date.parse(windowExpiry)).date;
  return new Date(`${date}T${overnight ? '15:30' : '15:15'}:00+05:30`).toISOString();
}

export function evaluationWindow(cadence: string, createdAt: string, now = Date.now()) {
  const clock = marketTime(now);
  if (!clock.knownYear) return null;
  let end: number, expires: number;
  if (cadence === 'daily') {
    end = Date.parse(`${clock.date}T15:30:00+05:30`);
    if (end + 5000 > now) end -= 86_400_000;
    for (let i = 0; i < 370 && !marketTime(end).tradingDay; i++) end -= 86_400_000;
    if (!marketTime(end).tradingDay) return null;
    const nextOpen = nextRegularOpen(end);
    if (!nextOpen) return null;
    expires = nextOpen + 30 * 60_000;
  } else {
    const minutes = ({ '1m': 1, '5m': 5, '15m': 15, '1h': 60 } as Record<string, number>)[cadence];
    if (!minutes || !clock.open) return null;
    const open = Date.parse(`${clock.date}T09:15:00+05:30`);
    end = open + Math.floor((now - open - 5000) / (minutes * 60000)) * minutes * 60000;
    if (end <= open) return null;
    expires = Math.min(end + minutes * 60000, Date.parse(`${clock.date}T15:30:00+05:30`));
  }
  if (end <= Date.parse(createdAt) || expires <= now) return null;
  return { barEnd: new Date(end).toISOString(), expiresAt: new Date(expires).toISOString() };
}
