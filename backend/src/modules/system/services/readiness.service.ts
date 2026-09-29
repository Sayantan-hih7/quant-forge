import mongoose from 'mongoose';
import { env } from '../../../config/env.js';
import { redis } from '../../../shared/redis.js';
import { marketTime } from '../../../shared/market-calendar.js';
import { validPasswordHash } from '../../workspace/password.js';
import { engineClient } from '../../engine/services/engine.service.js';
import { feedStatus } from '../../market-feed/services/feed.service.js';
import { ConnectionModel } from '../../connections/models/connection.model.js';
import { DATA_WORKER_HEARTBEAT } from '../../market-data/services/universe-refresh.service.js';
import { PAPER_HEARTBEAT } from '../../paper-trading/services/paper.service.js';

export async function deploymentReadiness() {
  const checks: { id: string; label: string; state: 'ready' | 'attention'; message: string }[] = [];
  const add = (id: string, label: string, ok: boolean, message: string) => checks.push({ id, label, state: ok ? 'ready' : 'attention', message });
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  add('database', 'Database transactions', !!hello.setName || hello.msg === 'isdbgrid', 'Paper orders require a MongoDB replica set with transactions.');
  const owner = !!env.OWNER_EMAIL && validPasswordHash(env.OWNER_PASSWORD_HASH);
  add('owner', 'Hosted sign-in', owner, owner ? 'Owner credentials configured.' : 'Run npm run configure:owner before deployment. Local access still works.');
  const https = env.FRONTEND_ORIGIN.startsWith('https://');
  add('https', 'Hosted address', https, https ? 'HTTPS frontend origin configured.' : 'Set FRONTEND_ORIGIN to the deployment HTTPS address when deploying.');
  try { await engineClient.get('/health', { timeout: 5000 }); add('engine', 'Calculation engine', true, 'Python engine reachable.'); }
  catch { add('engine', 'Calculation engine', false, 'The Python engine is unreachable.'); }
  add('jobs', 'Data and backtest worker', !!await redis.exists(DATA_WORKER_HEARTBEAT), 'This worker imports data and runs qualification and backtests.');
  add('paper', 'Paper worker', !!await redis.exists(PAPER_HEARTBEAT), 'This worker monitors saved strategies, refreshes candles and processes paper orders.');
  const feed = await feedStatus();
  add('feed-worker', 'Live feed worker', feed.workerRunning, feed.workerRunning ? 'Live feed worker running.' : 'Start the live feed worker.');
  add('subscriptions', 'Saved live subscriptions', !!feed.enabled, feed.enabled ? 'Subscriptions persist across restarts.' : 'Connect the execution feed for the stocks you will monitor.');
  add('ticks', 'Live tick verification', feed.state === 'live', feed.state === 'live' ? `Fresh ${feed.provider ?? 'provider'} ticks received.` : `${feed.message} Live execution must be verified during market hours.`);
  const dhan = await ConnectionModel.findById('dhan').lean();
  add('dhan', 'Dhan data connection', dhan?.status === 'connected' && Date.parse(dhan.expiresAt ?? '') > Date.now(), dhan?.expiresAt ? `Token expiry: ${dhan.expiresAt}. Auto-renewal: ${dhan.autoRenew ? 'enabled' : 'off'}.` : 'Connect Dhan for history downloads.');
  const renewalReady = !!dhan?.autoRenew && dhan.renewalState === 'scheduled' && Date.parse(dhan.expiresAt ?? '') > Date.now();
  add('dhan-renewal', 'Unattended Dhan renewal', renewalReady, renewalReady ? 'Renewal scheduled before expiry.' : dhan?.renewalError ?? 'Enable automatic renewal with an eligible Dhan Web access token before leaving the app unattended.');
  add('calendar', 'Regular-session calendar', marketTime().knownYear, marketTime().knownYear ? 'Current calendar year configured. Special sessions are excluded.' : 'Load the current year holiday calendar before paper trading.');
  return { execution: 'paper-only', checkedAt: new Date().toISOString(), checks };
}
