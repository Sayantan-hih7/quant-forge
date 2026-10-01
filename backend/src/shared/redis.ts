import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { env } from '../config/env.js';

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 5000 });
redis.on('error', () => { /* Health endpoint reports connectivity; no credentials in connection errors. */ });
export const jobs = new Queue('quantforge-jobs', { connection: redis, defaultJobOptions: {
  attempts: 1, removeOnComplete: { age: 7 * 86400, count: 1000 }, removeOnFail: { age: 14 * 86400 },
} });
/** Scheduled data refreshes. Separate from user jobs so a long refresh never delays a backtest. */
export const maintenance = new Queue('quantforge-maintenance', { connection: redis, defaultJobOptions: {
  attempts: 3, backoff: { type: 'exponential', delay: 10 * 60_000 }, removeOnComplete: { age: 30 * 86400, count: 500 }, removeOnFail: { age: 30 * 86400 },
} });
export async function announce(type: string, data: unknown = {}) {
  // Notifications are expendable; a Pub/Sub outage must not roll back durable database work.
  await redis.publish('quantforge:events', JSON.stringify({ type, data, at: new Date().toISOString() })).catch(() => {});
}
