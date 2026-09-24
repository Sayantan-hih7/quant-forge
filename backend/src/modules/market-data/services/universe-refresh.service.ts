import { jobs, redis } from '../../../shared/redis.js';
import { sourceRuns } from '../repository.js';
import { syncInstruments } from '../imports.js';
import { UNIVERSE_CRON, UNIVERSE_SCHEDULER_ID, UNIVERSE_TIMEZONE, universeCycle } from './universe-calendar.js';
import type { Queue } from 'bullmq';

export const DATA_WORKER_HEARTBEAT = 'quantforge:data-worker:heartbeat';
const retryOptions = { attempts: 5, backoff: { type: 'exponential', delay: 60_000 } };

export async function refreshMonthlyUniverse() {
  const cycle = universeCycle();
  // A successful manual refresh also satisfies this cycle. Retries and startup catch-up are idempotent.
  if (await sourceRuns.exists({ source: 'instruments', status: 'completed', startedAt: { $gte: cycle.dueAt } })) return;
  return syncInstruments();
}

export async function registerUniverseSchedule(queue: Queue = jobs) {
  await queue.upsertJobScheduler(UNIVERSE_SCHEDULER_ID,
    { pattern: UNIVERSE_CRON, tz: UNIVERSE_TIMEZONE },
    { name: 'monthly-universe-refresh', data: {}, opts: retryOptions });
  const cycle = universeCycle();
  if (await sourceRuns.exists({ source: 'instruments', status: 'completed', startedAt: { $gte: cycle.dueAt } })) return;
  const id = `universe-catchup-${cycle.month}`;
  const existing = await queue.getJob(id);
  if (existing) {
    if (await existing.getState() === 'failed') await existing.retry('failed');
    return;
  }
  await queue.add('monthly-universe-refresh', {}, { ...retryOptions, jobId: id });
}

export async function universeRefreshStatus() {
  const [schedule, heartbeat, latest, lastSuccess] = await Promise.all([
    jobs.getJobScheduler(UNIVERSE_SCHEDULER_ID).catch(() => undefined),
    redis.get(DATA_WORKER_HEARTBEAT).catch(() => null),
    sourceRuns.findOne({ source: 'instruments' }).sort({ startedAt: -1 }).lean(),
    sourceRuns.findOne({ source: 'instruments', status: 'completed' }).sort({ startedAt: -1 }).lean(),
  ]);
  return {
    scheduled: !!schedule, workerOnline: !!heartbeat, timezone: UNIVERSE_TIMEZONE,
    schedule: '1st of every month at 02:00 IST',
    nextRunAt: schedule?.next ? new Date(schedule.next).toISOString() : null,
    upToDate: !!lastSuccess && lastSuccess.startedAt >= universeCycle().dueAt,
    lastSuccessAt: lastSuccess?.finishedAt ?? null,
    latestStatus: latest?.status ?? null,
    lastError: latest?.status === 'failed' ? latest.failures[0]?.message : null,
    addedListings: typeof lastSuccess?.details?.addedListings === 'number' ? lastSuccess.details.addedListings : null,
    addedCompanies: typeof lastSuccess?.details?.addedCompanies === 'number' ? lastSuccess.details.addedCompanies : null,
  };
}
