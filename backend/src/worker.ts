import { Worker } from 'bullmq';
import { connectDatabase, disconnectDatabase } from './shared/database.js';
import { redis, jobs } from './shared/redis.js';
import { onShutdown } from './shared/shutdown.js';
import { importSchema } from './modules/market-data/validations/market-data.validation.js';
import { syncDelivery, syncInstruments, syncMotilalMappings, syncMemberships, syncPledge } from './modules/market-data/imports.js';
import { syncFundamentals, syncHistory } from './modules/market-data/services/dhan-import.service.js';
import { AppError } from './shared/errors.js';
import { runQualification } from './modules/qualification/services/qualification.service.js';
import { jobContext } from './shared/job-context.js';
import { runBacktest } from './modules/backtesting/services/backtest.service.js';
import { DATA_WORKER_HEARTBEAT, refreshMonthlyUniverse, registerUniverseSchedule } from './modules/market-data/services/universe-refresh.service.js';

await connectDatabase();
await registerUniverseSchedule();
const workerConnection = redis.duplicate({ maxRetriesPerRequest: null });
const worker = new Worker('quantforge-jobs', job => jobContext.run({ id: job.id! }, async () => {
  if (job.name === 'monthly-universe-refresh') return refreshMonthlyUniverse();
  if (job.name === 'qualification') return runQualification(job.data.runId);
  if (job.name === 'backtest') return runBacktest(job.data.id);
  if (job.name !== 'data-import') throw new AppError(422, 'JOB_UNKNOWN', 'Unknown job type');
  const data = importSchema.parse(job.data);
  switch (data.kind) {
    case 'instruments': return syncInstruments();
    case 'motilal-mappings': return syncMotilalMappings();
    case 'memberships': return syncMemberships();
    case 'pledge': return syncPledge();
    case 'delivery': return syncDelivery(data.month!, data.exchange);
    case 'fundamentals': return syncFundamentals(data.ids);
    case 'history': return syncHistory(data.ids!, data.interval, data.from!, data.to!);
  }
}), { connection: workerConnection, concurrency: 1 });
worker.on('failed', job => console.log(`Job ${job?.id ?? 'unknown'} failed; sanitized details are in source history.`));
worker.on('error', () => console.error('Queue worker connection error'));
console.log('QuantForge data worker started');
const heartbeat = () => redis.set(DATA_WORKER_HEARTBEAT, new Date().toISOString(), 'EX', 35).catch(() => undefined);
await heartbeat();
const heartbeatTimer = setInterval(() => { void heartbeat(); }, 10_000);
heartbeatTimer.unref();
async function shutdown() { clearInterval(heartbeatTimer); await worker.close(); await workerConnection.quit(); await jobs.close(); await redis.quit(); await disconnectDatabase(); }
onShutdown(shutdown);
