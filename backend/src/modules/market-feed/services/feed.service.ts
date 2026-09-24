import { randomUUID } from 'node:crypto';
import { redis } from '../../../shared/redis.js';
import { invariant } from '../../../shared/errors.js';
import { instruments } from '../../market-data/repository.js';
import type { FeedInstrument, FeedStatus, LiveQuote } from '../types/feed.types.js';

export const FEED_KEYS = { lease: 'quantforge:feed:lease', desired: 'quantforge:feed:desired', status: 'quantforge:feed:status', commands: 'quantforge:feed:commands' };
export interface FeedRequest { id: string; instruments: FeedInstrument[] }
export async function feedStatus() {
  const [raw, worker] = await Promise.all([redis.get(FEED_KEYS.status), redis.exists(FEED_KEYS.lease)]);
  const status: FeedStatus = raw && worker ? JSON.parse(raw) : { state: 'disconnected', updatedAt: new Date().toISOString(), message: worker ? 'Choose stocks and connect Motilal.' : 'The market-feed worker is not running.' };
  const request = await redis.get(FEED_KEYS.desired);
  const session = request ? (JSON.parse(request) as FeedRequest).id : undefined;
  const ids = status.instruments?.map(x => x.id) ?? [];
  const values = ids.length ? await redis.mget(ids.map(id => `quantforge:quote:${id}`)) : [];
  const now = Date.now();
  const quotes = values.filter((x): x is string => !!x).map(x => JSON.parse(x) as LiveQuote).filter(x => x.session === session).map(x => ({ ...x, fresh: status.state === 'live' && now - Date.parse(x.at) >= -1000 && now - Date.parse(x.at) < 15000 }));
  if (status.state === 'live' && !quotes.some(x => x.fresh)) { status.state = 'waiting'; status.message = 'No fresh ticks. The market may be closed or the stream may be delayed.'; }
  return { ...status, workerRunning: !!worker, quotes, configured: ['MO_CLIENT_CODE', 'MO_PASSWORD', 'MO_2FA', 'MO_API_KEY', 'MO_API_SECRET_KEY'].every(key => !!process.env[key]) };
}
export async function connectFeed(ids: string[]) {
  invariant(await redis.exists(FEED_KEYS.lease), 'Start the market-feed worker before connecting');
  invariant(['MO_CLIENT_CODE', 'MO_PASSWORD', 'MO_2FA', 'MO_API_KEY', 'MO_API_SECRET_KEY'].every(key => !!process.env[key]), 'Configure Motilal credentials in backend/.env');
  const stocks = await instruments.find({ _id: { $in: ids }, active: true, motilalCode: { $exists: true } }).lean();
  invariant(stocks.length === new Set(ids).size, 'Import Motilal mappings first. Every selected stock must have a verified broker code.');
  const request: FeedRequest = { id: randomUUID(), instruments: stocks.map(x => ({ id: x._id, symbol: x.symbol, exchange: x.exchange, code: x.motilalCode! })) };
  await redis.set(FEED_KEYS.desired, JSON.stringify(request), 'EX', 8 * 3600);
  return { state: 'connecting' };
}
export async function disconnectFeed() { await redis.del(FEED_KEYS.desired); }
export async function submitFeedOtp(otp: string) {
  const status = await feedStatus(); invariant(status.workerRunning && status.state === 'otp-required', 'No active Motilal OTP challenge');
  await redis.publish(FEED_KEYS.commands, JSON.stringify({ type: 'otp', value: otp }));
}
