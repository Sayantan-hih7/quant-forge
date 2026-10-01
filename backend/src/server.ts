import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './shared/database.js';
import { redis, jobs, maintenance } from './shared/redis.js';
import { stockQuoteStream } from './modules/stock-details/services/stream.service.js';
import { startDhanRenewalMonitor } from './modules/connections/services/dhan-renewal.service.js';
import { assertHostedLoginConfigured } from './middleware/workspace.js';
import { onShutdown } from './shared/shutdown.js';

assertHostedLoginConfigured();
await connectDatabase();
if (redis.status === 'wait') await redis.connect();
await redis.ping();
const stopDhanRenewal = startDhanRenewalMonitor();
const server = app.listen(env.PORT, env.HOST, () => console.log(`QuantForge paper API listening on ${env.HOST}:${env.PORT}`));
async function shutdown() {
  stockQuoteStream.close();
  await new Promise<void>(resolve => {
    const deadline = setTimeout(() => server.closeAllConnections(), 30000);
    deadline.unref();
    server.close(() => { clearTimeout(deadline); resolve(); });
  });
  await stopDhanRenewal(); await jobs.close(); await maintenance.close(); await redis.quit(); await disconnectDatabase();
}
onShutdown(shutdown);
