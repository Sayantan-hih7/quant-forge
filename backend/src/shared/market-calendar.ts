// Regular cash sessions only. Special sessions require explicit configuration.
// NSE capital-market circular CMTR71775 (12 Dec 2025).
export const CALENDAR_SOURCE = 'https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf';
const holidays2026 = ['01-26', '03-03', '03-26', '03-31', '04-03', '04-14', '05-01', '05-28', '06-26', '09-14', '10-02', '10-20', '11-10', '11-24', '12-25'];
const holidays = new Set(holidays2026.map(day => `2026-${day}`));
export function marketTime(now = Date.now()) {
  const local = new Date(now + 19_800_000), date = local.toISOString().slice(0, 10);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const configured = (process.env.MARKET_HOLIDAYS ?? '').split(',').map(x => x.trim());
  const knownYear = local.getUTCFullYear() === 2026 || (process.env.MARKET_CALENDAR_YEARS ?? '').split(',').includes(String(local.getUTCFullYear()));
  const tradingDay = knownYear && local.getUTCDay() > 0 && local.getUTCDay() < 6 && !holidays.has(date) && !configured.includes(date);
  return { date, minute, knownYear, tradingDay, open: tradingDay && minute >= 555 && minute < 930, feedWindow: tradingDay && minute >= 540 && minute < 960 };
}
export function nextRegularOpen(after: number) {
  const date = marketTime(after).date;
  for (let offset = 0; offset < 370; offset++) {
    const at = Date.parse(`${date}T09:15:00+05:30`) + offset * 86_400_000;
    if (at > after && marketTime(at).open) return at;
  }
  return null;
}

/** Serializable session boundaries let browsers pause without copying the holiday calendar. */
export function marketSession(now = Date.now()) {
  const clock = marketTime(now), weekday = new Date(now + 19800000).getUTCDay();
  const reason = !clock.knownYear ? 'Calendar unavailable' : clock.open ? 'Market open' : !weekday || weekday === 6 ? 'Weekend' : !clock.tradingDay ? 'Market holiday' : clock.minute < 555 ? 'Before market open' : 'Market closed';
  return { open: clock.open, reason, date: clock.date, knownYear: clock.knownYear,
    closesAt: new Date(`${clock.date}T15:30:00+05:30`).toISOString(),
    nextOpenAt: clock.knownYear ? (() => { const next = nextRegularOpen(now); return next ? new Date(next).toISOString() : null; })() : null };
}
