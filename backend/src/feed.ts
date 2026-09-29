import { randomUUID } from 'node:crypto';
import { onShutdown } from './shared/shutdown.js';
import { redis, jobs, announce } from './shared/redis.js';
import { FEED_KEYS, motilalConfigured, type FeedRequest } from './modules/market-feed/services/feed.service.js';
import { FeedSettingsModel } from './modules/market-feed/models/feed-settings.model.js';
import { syncPaperSubscriptions } from './modules/market-feed/services/paper-subscriptions.service.js';
import { researchDemand } from './modules/market-feed/services/research-demand.js';
import { SharedFeed, currentQuote } from './modules/market-feed/services/shared-feed.js';
import { createQuoteTransport } from './modules/market-feed/providers/transports.js';
import { marketTime } from './shared/market-calendar.js';
import { claimWorkerLease } from './shared/worker-lease.js';
import type { FeedInstrument, FeedStatus, LiveQuote } from './modules/market-feed/types/feed.types.js';
import { CandleBuilder } from './modules/market-feed/services/candle-builder.js';
import { connectDatabase, disconnectDatabase } from './shared/database.js';
import { CandleModel, InstrumentModel } from './modules/market-data/models/market-data.model.js';
import { ConnectionModel } from './modules/connections/models/connection.model.js';
import type { Candle } from './modules/market-data/types.js';
import type { LiveChartBar } from './modules/stock-details/types.js';
import { LiveChartBars } from './modules/stock-details/utils/live-chart-bars.js';
import { sharedStockQuote } from './modules/stock-details/utils/shared-quote.js';

const owner = randomUUID();
await connectDatabase();
if (redis.status === 'wait') await redis.connect();
await claimWorkerLease(FEED_KEYS.lease, owner, 20000);
let stopping = false, shutdownStarted = false, reconciling = false, lastLease = 0, readSettingsAt = 0, connectionDay = '';
let desired: FeedRequest | undefined, stocks: FeedInstrument[] = [], paperIds = new Set<string>(), chartIds = new Set<string>();
let canDhan = false, preference: FeedRequest['provider'] = 'auto';
let state: FeedStatus = { state: 'disconnected', message: 'Waiting for stock subscriptions.', updatedAt: new Date().toISOString() };
const quotes = new Map<string, LiveQuote>(), bars = new Map<string, LiveChartBar>();
const candleBuilder = new CandleBuilder(), chartBuilder = new LiveChartBars();
let pendingCandles: Candle[] = [], pendingTicks: LiveQuote[] = [];
const feed = new SharedFeed(createQuoteTransport, quote => {
  quotes.set(quote.instrumentId, quote);
  if (chartIds.has(quote.instrumentId)) for (const bar of chartBuilder.tick(sharedStockQuote(quote))) bars.set(`${bar.instrumentId}:${bar.time}`, bar);
  if (paperIds.has(quote.instrumentId) && Date.now() - Date.parse(quote.at) <= 15000) {
    candleBuilder.tick(quote); pendingTicks.push(quote);
    if (pendingTicks.length > 100000) { feed.reset(); pendingTicks = []; candleBuilder.reset(); }
  }
});
const subscriber = redis.duplicate(); subscriber.on('error', () => {});
subscriber.on('message', (_channel, raw) => {
  try { const command = JSON.parse(raw); if (command.type === 'otp' && /^\d{6}$/.test(command.value)) feed.otp(command.value); } catch { /* Ignore malformed messages. */ }
});
await subscriber.subscribe(FEED_KEYS.commands);

async function loadDemand() {
  let settings = await FeedSettingsModel.findById('primary').lean();
  if (!settings) {
    const legacy = await redis.get(FEED_KEYS.desired);
    if (legacy) await FeedSettingsModel.updateOne({ _id: 'primary' }, { $setOnInsert: { enabled: true, request: JSON.parse(legacy) } }, { upsert: true });
  }
  await syncPaperSubscriptions(); settings = await FeedSettingsModel.findById('primary').lean();
  const next = settings?.enabled ? settings.request : undefined;
  if (next?.id !== desired?.id) {
    if (next) await redis.set(FEED_KEYS.desired, JSON.stringify(next)); else await redis.del(FEED_KEYS.desired);
  }
  desired = next; paperIds = new Set(next?.instruments.map(s => s.id) ?? []);
  preference = settings?.manualRequest?.provider ?? settings?.request?.provider ?? 'auto';
  const research = await researchDemand();
  const nextCharts = new Set(research.chartIds);
  for (const id of chartIds) if (!nextCharts.has(id)) chartBuilder.remove(id);
  chartIds = nextCharts;
  const visibleIds = [...new Set([...research.chartIds, ...research.ids])].filter(id => !paperIds.has(id));
  const visible = visibleIds.length ? await InstrumentModel.find({ _id: { $in: visibleIds }, active: true }).select('_id symbol exchange securityId motilalCode').lean() : [];
  const lookup = new Map(visible.map(s => [s._id, s]));
  stocks = [...(next?.instruments ?? []), ...visibleIds.flatMap(id => { const s = lookup.get(id); return s ? [{ id, symbol: s.symbol, exchange: s.exchange, securityId: s.securityId, code: s.motilalCode }] : []; })];
  const dhan = await ConnectionModel.findById('dhan').select('status expiresAt').lean();
  canDhan = !!process.env.DHAN_CLIENT_ID && dhan?.status === 'connected' && Date.parse(dhan.expiresAt ?? '') > Date.now();
}
async function reconcile() {
  if (stopping) return;
  if (Date.now() - lastLease > 5000) {
    const renewed = await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],20000) else return 0 end", 1, FEED_KEYS.lease, owner);
    if (!renewed) { stopping = true; feed.reset(); clearInterval(timer); process.exitCode = 1; return; }
    lastLease = Date.now();
  }
  if (Date.now() >= readSettingsAt) { await loadDemand(); readSettingsAt = Date.now() + 2000; }
  const clock = marketTime();
  if (connectionDay !== clock.date) { feed.reset(); chartBuilder.reset(); candleBuilder.reset(); connectionDay = clock.date; }
  if (clock.feedWindow) feed.reconcile(stocks, { preference: preference ?? 'auto', motilal: motilalConfigured(), dhan: canDhan });
  else { feed.reset(); chartBuilder.reset(); candleBuilder.reset(); }
  state = { ...feed.status(), requestId: desired?.id, instruments: stocks, updatedAt: new Date().toISOString(), marketClosed: !clock.open };
  if (!clock.feedWindow) state = { ...state, state: stocks.length ? 'waiting' : 'disconnected', message: clock.knownYear ? 'Market closed. Prices retain their last trade time; streaming resumes next session.' : 'Update the trading calendar before this year can run paper sessions.' };
  await redis.set(FEED_KEYS.status, JSON.stringify(state), 'EX', 30);
  const latest = [...quotes.values()].filter(q => currentQuote(state, q)); quotes.clear();
  const previewBars = [...bars.values()].filter(b => chartIds.has(b.instrumentId) && Object.values(state.connections ?? {}).some(c => ['live', 'waiting'].includes(c.state) && c.session === b.streamSession && c.ids.includes(b.instrumentId))); bars.clear();
  if (latest.length) {
    const pipeline = redis.pipeline();
    for (const quote of latest) {
      pipeline.set(`quantforge:quote:${quote.instrumentId}`, JSON.stringify(quote), 'EX', 120);
      pipeline.set(`quantforge:research:quote:${quote.instrumentId}`, JSON.stringify(sharedStockQuote(quote)), 'EX', 172800);
    }
    const written = await pipeline.exec(); if (written?.some(([error]) => error)) throw new Error('Quote persistence unavailable');
    await announce('market.quotes', latest);
  }
  if (latest.length || previewBars.length) await announce('stock.quotes', { quotes: latest.map(sharedStockQuote), candles: previewBars });
  if (pendingTicks.length) {
    const batch = pendingTicks.splice(0, 5000).filter(q => paperIds.has(q.instrumentId) && currentQuote(state, q)), pipeline = redis.pipeline();
    for (const tick of batch) pipeline.xadd('quantforge:market:ticks', 'MAXLEN', '~', 100000, '*', 'quote', JSON.stringify(tick));
    const written = await pipeline.exec(); if (written?.some(([error]) => error)) throw new Error('Tick persistence unavailable');
    if (batch.length) await announce('paper.ticks');
  }
  pendingCandles.push(...candleBuilder.drain());
  if (pendingCandles.length) {
    const batch = pendingCandles.slice(0, 500);
    await CandleModel.bulkWrite(batch.map(row => ({ updateOne: { filter: { instrumentId: row.instrumentId, interval: row.interval, time: row.time }, update: { $setOnInsert: row }, upsert: true } })));
    pendingCandles = pendingCandles.slice(batch.length); await announce('market.candles', { count: batch.length });
  }
}
const timer = setInterval(() => {
  if (reconciling) return;
  reconciling = true;
  void reconcile().catch(async () => {
    feed.reset(); chartBuilder.reset(); candleBuilder.reset(); pendingTicks = []; quotes.clear(); bars.clear();
    state = { state: 'error', message: 'Feed coordination unavailable. Retrying automatically.', updatedAt: new Date().toISOString() };
    await redis.set(FEED_KEYS.status, JSON.stringify(state), 'EX', 30).catch(() => {});
  }).finally(() => { reconciling = false; if (stopping) void shutdown(); });
}, 500);
console.log('QuantForge shared read-only market-feed worker started');
async function shutdown() {
  if (shutdownStarted) return; shutdownStarted = true; stopping = true; clearInterval(timer); feed.reset();
  while (reconciling) await new Promise(resolve => setTimeout(resolve, 50));
  state = { state: 'disconnected', message: 'Market-feed worker stopped.', updatedAt: new Date().toISOString() };
  await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[2],ARGV[2],'EX',30); return redis.call('DEL',KEYS[1]) else return 0 end", 2, FEED_KEYS.lease, FEED_KEYS.status, owner, JSON.stringify(state)).catch(() => {});
  subscriber.disconnect(); await jobs.close(); await redis.quit(); await disconnectDatabase();
}
onShutdown(shutdown);
