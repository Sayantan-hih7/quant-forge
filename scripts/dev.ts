import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Processes, localConfig, portOpen, require, root, run, waitForHttp } from './runtime.js';
import { setup } from './setup.js';

const processes = new Processes();
const stopped = new Error('Stopped by user');
const stop = () => processes.abort.abort(stopped);
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
// Allows an owning terminal/test harness to request the same shutdown on Windows.
process.on('message', (message: unknown) => {
  if (message && typeof message === 'object' && 'type' in message && message.type === 'quantforge.shutdown') stop();
});

try {
  await setup();
  const config = await localConfig();
  const apiPort = Number(config.PORT ?? 4100);
  const engineUrl = new URL(config.ENGINE_URL ?? 'http://127.0.0.1:8100');
  if (!['127.0.0.1', 'localhost'].includes(engineUrl.hostname)) throw new Error('The local launcher needs a loopback ENGINE_URL. Use the individual service commands for a remote engine.');
  const enginePort = Number(engineUrl.port || 8100);
  for (const [name, port] of [['frontend', 5173], ['API', apiPort], ['engine', enginePort]] as const) {
    if (await portOpen(port) || await portOpen(port, '::1')) throw new Error(`${name} port ${port} is already in use. Stop its old terminal, then run npm run dev again.`);
  }
  const mongoUrl = new URL(config.MONGODB_URI!);
  const redisUrl = new URL(config.REDIS_URL!);
  const databasesReady = await portOpen(Number(mongoUrl.port || 27017), mongoUrl.hostname)
    && await portOpen(Number(redisUrl.port || 6379), redisUrl.hostname);
  if (!databasesReady) {
    if (!['localhost', '127.0.0.1'].includes(mongoUrl.hostname) || mongoUrl.port !== '27019'
      || !['localhost', '127.0.0.1'].includes(redisUrl.hostname) || redisUrl.port !== '6381') {
      throw new Error('Your configured MongoDB or Redis server is unavailable. Start it first, or use the local ports from backend/.env.example.');
    }
    console.log('[startup] Starting MongoDB and Redis with persistent Docker volumes…');
    try { await run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '120']); }
    catch { throw new Error('MongoDB/Redis could not start. Open Docker Desktop, wait until it is ready, then run npm run dev again.'); }
  } else console.log('[startup] Using the running MongoDB and Redis services.');

  const tsx = require.resolve('tsx/cli');
  processes.start('engine', process.execPath, ['--import', 'tsx', 'backend/scripts/run-engine.ts', '--reload']);
  await waitForHttp(new URL('/health', engineUrl).href, processes.abort.signal, 45_000, 'python-engine');
  processes.start('api', process.execPath, [tsx, 'watch', 'src/server.ts'], resolve(root, 'backend'));
  await waitForHttp(`http://127.0.0.1:${apiPort}/health`, processes.abort.signal);
  for (const entry of ['worker', 'feed', 'paper']) {
    // Workers do not hot-reload: editing UI/API files must not interrupt a long import.
    processes.start(entry, process.execPath, ['--import', 'tsx', `src/${entry}.ts`], resolve(root, 'backend'), process.env, true);
  }
  const vite = resolve(require.resolve('vite/package.json'), '../bin/vite.js');
  console.log('[startup] Starting the frontend. Its first launch may take longer while dependencies compile.');
  processes.start('frontend', process.execPath, [vite, '--host', '127.0.0.1'], resolve(root, 'frontend'), { ...process.env, API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` });
  await waitForHttp('http://127.0.0.1:5173', processes.abort.signal, 120_000);
  await delay(1500, undefined, { signal: processes.abort.signal });
  console.log('\nQuantForge is ready: http://localhost:5173\nAPI, engine, data/feed/paper workers and frontend are running.\nCtrl+C stops the app processes. Your database stays running and keeps its data.\n');
  await new Promise<void>((_, reject) => {
    if (processes.abort.signal.aborted) reject(processes.abort.signal.reason);
    else processes.abort.signal.addEventListener('abort', () => reject(processes.abort.signal.reason), { once: true });
  });
} catch (error) {
  if (processes.abort.signal.reason !== stopped) {
    console.error(`[startup] ${error instanceof Error ? error.message : 'Could not start the workspace.'}`);
    process.exitCode = 1;
  }
} finally {
  await processes.stop();
  if (process.connected) process.disconnect();
  console.log('[startup] App processes stopped. Use npm run infra:down to stop the local databases.');
}
