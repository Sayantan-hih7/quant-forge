const IST_OFFSET = 330 * 60_000;
export const UNIVERSE_SCHEDULER_ID = 'monthly-stock-universe';
export const UNIVERSE_CRON = '0 0 2 1 * *';
export const UNIVERSE_TIMEZONE = 'Asia/Kolkata';

/** Before 02:00 on the first, the previous month's cycle is still current. */
export function universeCycle(now = new Date()) {
  const local = new Date(now.getTime() + IST_OFFSET);
  let due = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 2) - IST_OFFSET;
  if (now.getTime() < due) due = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1, 2) - IST_OFFSET;
  const cycleLocal = new Date(due + IST_OFFSET);
  return { month: cycleLocal.toISOString().slice(0, 7), dueAt: new Date(due).toISOString() };
}
