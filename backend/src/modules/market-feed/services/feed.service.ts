import { randomUUID } from 'node:crypto';
import { redis } from '../../../shared/redis.js';
import { invariant } from '../../../shared/errors.js';
import { instruments } from '../../market-data/repository.js';
import type { FeedInstrument, FeedStatus, LiveQuote, FeedProvider } from '../types/feed.types.js';
import { FeedSettingsModel } from '../models/feed-settings.model.js';
import { motilalConfigured } from './recovery.js';
import { syncPaperSubscriptions } from './paper-subscriptions.service.js';
import { ConnectionModel } from '../../connections/models/connection.model.js';
import { currentQuote } from './shared-feed.js';

export const FEED_KEYS = { lease: 'quantforge:feed:lease', desired: 'quantforge:feed:desired', status: 'quantforge:feed:status', commands: 'quantforge:feed:commands' };
export interface FeedRequest { id: string; instruments: FeedInstrument[]; provider?: FeedProvider }
export { motilalConfigured } from './recovery.js';
export async function feedStatus() {
  const [raw, worker] = await Promise.all([redis.get(FEED_KEYS.status), redis.exists(FEED_KEYS.lease)]);
  const status: FeedStatus = raw && worker ? JSON.parse(raw) : { state: 'disconnected', updatedAt: new Date().toISOString(), message: worker ? 'Live data connects automatically when paper monitoring starts.' : 'The market-feed worker is not running.' };
  const request = await redis.get(FEED_KEYS.desired);
  const settings = await FeedSettingsModel.findById('primary').lean();
  const desired = request ? JSON.parse(request) as FeedRequest : undefined;
  const enabled = settings?.enabled ?? !!desired;
  const saved = settings?.request ?? desired;
  const activeRequest = !!desired && (!settings || settings.request?.id === desired.id)
    && (status.requestId === desired.id || (!status.requestId && !status.session));
  const ids = saved?.instruments.map(x => x.id) ?? [];
  const values = ids.length ? await redis.mget(ids.map(id => `quantforge:quote:${id}`)) : [];
  const now = Date.now();
  const quotes = values.filter((x): x is string => !!x).map(x => JSON.parse(x) as LiveQuote).map(x => ({ ...x, fresh: enabled && activeRequest && !!worker && currentQuote(status, x) && now - Date.parse(x.at) >= -1000 && now - Date.parse(x.at) < 15000 }));
  if (!enabled) { status.state = 'disconnected'; status.message = !worker ? 'The market-feed worker is not running.' : settings?.automation?.message ?? 'Live data connects automatically when paper monitoring starts.'; }
  if (status.state === 'live' && !quotes.some(x => x.fresh)) { status.state = 'waiting'; status.message = 'No fresh ticks. The market may be closed or the stream may be delayed.'; }
  return { ...status, instruments: saved?.instruments ?? status.instruments, workerRunning: !!worker, quotes, configured: motilalConfigured() || !!process.env.DHAN_CLIENT_ID, enabled, automation: settings?.automation, manualIds: settings?.paperManaged ? settings.manualRequest?.instruments.map(s => s.id) ?? [] : ids, preference: saved?.provider ?? 'auto' };
}
export async function connectFeed(ids: string[], provider: FeedProvider = 'auto') {
  invariant(await redis.exists(FEED_KEYS.lease), 'Start the market-feed worker before connecting');
  const stocks = await instruments.find({ _id: { $in: ids }, active: true }).lean();
  invariant(stocks.length === new Set(ids).size, 'Choose active imported cash equities');
  const dhan = await ConnectionModel.findById('dhan').lean();
  const canDhan = !!process.env.DHAN_CLIENT_ID && dhan?.status === 'connected' && Date.parse(dhan.expiresAt ?? '') > Date.now();
  const canMotilal = motilalConfigured() && stocks.every(s => s.motilalCode !== undefined);
  invariant(provider === 'motilal' ? canMotilal : provider === 'dhan' ? canDhan : canMotilal || canDhan, provider === 'motilal' ? 'Configure Motilal credentials and import mappings for every selected stock' : 'Connect Dhan or configure Motilal with stock mappings first');
  const request: FeedRequest = { id: randomUUID(), provider, instruments: stocks.map(x => ({ id: x._id, symbol: x.symbol, exchange: x.exchange, code: x.motilalCode, securityId: x.securityId })) };
  await FeedSettingsModel.updateOne({ _id: 'primary' }, { $set: { manualRequest: request, manualEnabled: true, paperManaged: true, automationPaused: false }, $inc: { revision: 1 } }, { upsert: true });
  await syncPaperSubscriptions();
  return { state: 'connecting' };
}
export async function disconnectFeed() {
  await FeedSettingsModel.updateOne({ _id: 'primary' }, { $set: { enabled: false, manualEnabled: false, paperManaged: true, automationPaused: true, automation: { state: 'paused', message: 'Execution feed was paused in connection settings. Starting or resuming paper monitoring enables it again.', paperIds: [], unavailableIds: [] } }, $inc: { revision: 1 } }, { upsert: true });
  await redis.del(FEED_KEYS.desired);
}
export async function submitFeedOtp(otp: string) {
  const status = await feedStatus(); invariant(status.workerRunning && (status.state === 'otp-required' || status.connections?.motilal?.state === 'otp-required'), 'No active Motilal OTP challenge');
  await redis.publish(FEED_KEYS.commands, JSON.stringify({ type: 'otp', value: otp }));
}
