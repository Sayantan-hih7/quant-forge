import { refreshQualifiedResearch } from '../../qualification/services/research-refresh.service.js';
import type { Queue } from 'bullmq';
import { maintenance } from '../../../shared/redis.js';
import { facts, sourceRuns } from '../repository.js';
import { syncDelivery, syncMemberships, syncPledge } from '../imports.js';
import { syncFundamentals } from './dhan-import.service.js';
import { syncDailyCloses } from './daily-closes.service.js';
import { syncNews } from '../../news/news.service.js';

const TZ = 'Asia/Kolkata';
const DAY = 86_400_000;
const previousMonth = (now = Date.now()) => { const d = new Date(now + 19_800_000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7); };
const sinceDays = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const ranSince = (source: string, since: string, extra: Record<string, unknown> = {}) =>
  sourceRuns.exists({ source, status: { $in: ['completed', 'partial'] }, startedAt: { $gte: since }, ...extra }).then(Boolean);

/**
 * Every dataset the research pages depend on, with how often it is refreshed and how to
 * tell at startup that a run was missed (worker offline, provider outage, new install).
 */
export const MAINTENANCE_TASKS = [
  { name: 'qualified-research', schedule: 'Weekdays 18:00 IST', pattern: '0 0 18 * * 1-5', data: {},
    run: () => refreshQualifiedResearch(), catchUp: async () => await ranSince('qualified-research', sinceDays(1)) ? null : {} },
  { name: 'daily-closes', schedule: 'Weekdays 19:30 IST', pattern: '0 30 19 * * 1-5', data: { days: 10 },
    run: (data: { days?: number }) => syncDailyCloses(data.days ?? 10),
    // The first run backfills a year of closes; afterwards only recent sessions are checked.
    catchUp: async () => !await ranSince('daily-closes', sinceDays(400), { 'details.from': { $lte: sinceDays(360).slice(0, 10) } }) ? { days: 400 }
      : !await ranSince('daily-closes', sinceDays(2)) ? { days: 10 } : null },
  { name: 'memberships', schedule: 'Mondays 07:00 IST', pattern: '0 0 7 * * 1', data: {},
    run: () => syncMemberships(),
    catchUp: async () => await facts.exists({ field: 'index', validUntil: { $gte: new Date(Date.now() + 2 * DAY).toISOString() } }) ? null : {} },
  { name: 'fundamentals', schedule: 'Saturdays 02:00 IST', pattern: '0 0 2 * * 6', data: {},
    run: () => syncFundamentals(),
    catchUp: async () => await ranSince('fundamentals', sinceDays(8)) ? null : {} },
  { name: 'news', schedule: 'Every 30 minutes, 06:00–23:30 IST', pattern: '0 0,30 6-23 * * *', data: {},
    run: () => syncNews(),
    catchUp: async () => await ranSince('news', new Date(Date.now() - 3600_000).toISOString()) ? null : {} },
  { name: 'pledge', schedule: 'Sundays 08:00 IST', pattern: '0 0 8 * * 0', data: {},
    run: () => syncPledge(),
    catchUp: async () => await ranSince('pledge', sinceDays(8)) ? null : {} },
  // Monthly turnover/delivery facts expire when the next month ends; publish them on the 1st.
  ...(['NSE', 'BSE'] as const).map(exchange => ({ name: `delivery-${exchange.toLowerCase()}`, schedule: '1st of every month 06:00 IST', pattern: '0 0 6 1 * *', data: {},
    run: () => syncDelivery(previousMonth(), exchange),
    catchUp: async () => await facts.exists({ source: `${exchange.toLowerCase()}-monthly-delivery`, period: previousMonth() }) ? null : {} })),
] as const;
type Task = (typeof MAINTENANCE_TASKS)[number];

export async function runMaintenance(name: string, data: Record<string, unknown>) {
  const task = MAINTENANCE_TASKS.find(x => x.name === name);
  if (!task) throw new Error(`Unknown maintenance task ${name}`);
  return (task.run as (data: Record<string, unknown>) => Promise<unknown>)(data);
}

export async function registerMaintenanceSchedules(queue: Queue = maintenance) {
  for (const task of MAINTENANCE_TASKS) {
    await queue.upsertJobScheduler(`maintenance:${task.name}`, { pattern: task.pattern, tz: TZ }, { name: task.name, data: task.data });
  }
  // Catch up anything missed while the worker was offline. Stable ids stop duplicate catch-ups
  // across restarts on the same day; the jobs themselves are idempotent.
  const day = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
  for (const task of MAINTENANCE_TASKS as readonly Task[]) {
    let data: Record<string, unknown> | null;
    try { data = await task.catchUp(); } catch { continue; }
    if (!data) continue;
    const id = `catchup-${task.name}-${day}`, existing = await queue.getJob(id);
    if (existing) { if (await existing.getState() === 'failed') await existing.retry('failed'); continue; }
    await queue.add(task.name, data, { jobId: id });
  }
}

export async function maintenanceStatus(queue: Queue = maintenance) {
  const sources = MAINTENANCE_TASKS.map(task => task.name.startsWith('delivery-') ? `${task.name.slice(9)}-delivery` : task.name);
  const [schedulers, latest] = await Promise.all([
    queue.getJobSchedulers().catch(() => []),
    sourceRuns.aggregate<{ _id: string; status: string; startedAt: string; finishedAt?: string; failure?: string }>([
      { $match: { source: { $in: sources } } }, { $sort: { startedAt: -1 } },
      { $group: { _id: '$source', status: { $first: '$status' }, startedAt: { $first: '$startedAt' }, finishedAt: { $first: '$finishedAt' }, failure: { $first: { $arrayElemAt: ['$failures.message', 0] } } } },
    ]),
  ]);
  return MAINTENANCE_TASKS.map((task, i) => {
    const scheduler = schedulers.find(s => s.key === `maintenance:${task.name}` || s.id === `maintenance:${task.name}`);
    const run = latest.find(r => r._id === sources[i]);
    return { task: task.name, schedule: task.schedule, nextRunAt: scheduler?.next ? new Date(scheduler.next).toISOString() : null,
      lastStatus: run?.status ?? null, lastStartedAt: run?.startedAt ?? null, lastFinishedAt: run?.finishedAt ?? null, lastError: run?.status === 'failed' ? run.failure ?? null : null };
  });
}
