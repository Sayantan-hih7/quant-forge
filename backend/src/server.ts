import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './shared/database.js';
import { redis, jobs } from './shared/redis.js';
import { stockQuoteStream } from './modules/stock-details/services/stream.service.js';
import { startDhanRenewalMonitor } from './modules/connections/services/dhan-renewal.service.js';

await connectDatabase();
if (redis.status === 'wait') await redis.connect();
await redis.ping();
const stopDhanRenewal = startDhanRenewalMonitor();
const server = app.listen(env.PORT, env.HOST, () => console.log(`QuantForge paper API listening on ${env.HOST}:${env.PORT}`));
async function shutdown() { stockQuoteStream.close(); server.close(); await stopDhanRenewal(); await jobs.close(); await redis.quit(); await disconnectDatabase(); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
