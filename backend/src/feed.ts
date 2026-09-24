import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { onShutdown } from './shared/shutdown.js';
import { redis, jobs, announce } from './shared/redis.js';
import { FEED_KEYS, type FeedRequest } from './modules/market-feed/services/feed.service.js';
import type { ChildEvent, FeedStatus, LiveQuote } from './modules/market-feed/types/feed.types.js';
import { CandleBuilder } from './modules/market-feed/services/candle-builder.js';
import { connectDatabase, disconnectDatabase } from './shared/database.js';
import { CandleModel } from './modules/market-data/models/market-data.model.js';
import type { Candle } from './modules/market-data/types.js';

const owner = randomUUID();
await connectDatabase();
if (redis.status === 'wait') await redis.connect();
if (!await redis.set(FEED_KEYS.lease, owner, 'PX', 20000, 'NX')) throw new Error('Another market-feed worker owns the connection');
let child: ChildProcess | undefined, desired: FeedRequest | undefined, stopping = false;
let state: FeedStatus = { state: 'disconnected', message: 'Choose stocks and connect Motilal.', updatedAt: new Date().toISOString() };
const quotes = new Map<string, LiveQuote>();
const candleBuilder=new CandleBuilder();
let pendingCandles:Candle[]=[];
let pendingTicks:LiveQuote[]=[];
async function persist() { await redis.set(FEED_KEYS.status, JSON.stringify(state), 'EX', 30); }
function stopChild() { const previous = child; child = undefined; previous?.kill(); quotes.clear(); candleBuilder.reset(); pendingTicks=[]; }
function start(request: FeedRequest) {
  const allowed = ['PATH', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'MO_ENV', 'MO_CLIENT_CODE', 'MO_PASSWORD', 'MO_2FA', 'MO_VENDOR_INFO', 'MO_TOTP_SECRET', 'MO_API_KEY', 'MO_API_SECRET_KEY', 'MO_DEVICE_MODEL', 'MO_MANUFACTURER'];
  const processEnv = Object.fromEntries(allowed.filter(key => process.env[key]).map(key => [key, process.env[key]! ]));
  const active = fork(new URL('./modules/market-feed/providers/motilal-child.js', import.meta.url), [], { env: processEnv, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
  child = active;
  state = { state: 'connecting', message: 'Authenticating with Motilal.', instruments: request.instruments, updatedAt: new Date().toISOString() };
  active.on('message', (event: ChildEvent) => {
    if (child !== active) return;
    if (event.type === 'status') state = { ...state, ...event, updatedAt: new Date().toISOString() };
    else if (event.type === 'tick') {
      const quote = { ...event.quote, session: request.id };
      candleBuilder.tick(quote);
      pendingTicks.push(quote);
      if(pendingTicks.length>10000){stopChild();state={...state,state:'error',message:'Tick persistence fell behind; feed stopped. Reconnect after checking Redis.',updatedAt:new Date().toISOString()};return;}
      if ((quotes.get(quote.instrumentId)?.at ?? '') > quote.at) return;
      quotes.set(quote.instrumentId, quote);
      state = { ...state, state: 'live', message: 'Receiving Motilal market ticks.', lastTickAt: quote.at, updatedAt: new Date().toISOString() };
    }
  });
  active.on('error', () => { if (child === active) state = { ...state, state: 'error', message: 'Could not start the isolated Motilal process.', updatedAt: new Date().toISOString() }; });
  active.on('exit', () => { if (child === active) { child = undefined; if (state.state !== 'error') state = { ...state, state: 'error', message: 'Motilal feed stopped. Reconnect to resume.', updatedAt: new Date().toISOString() }; } });
  active.send({ type: 'start', instruments: request.instruments });
}
const subscriber = redis.duplicate();
subscriber.on('error', () => {});
subscriber.on('message', (_channel, raw) => {
  try { const event = JSON.parse(raw) as { type: string; value: string }; if (event.type === 'otp' && /^\d{6}$/.test(event.value) && child?.connected && state.state === 'otp-required') child.send(event); } catch { /* Ignore malformed coordination messages. */ }
});
await subscriber.subscribe(FEED_KEYS.commands);
let reconciling = false;
const timer = setInterval(() => { if (!reconciling) { reconciling = true; void reconcile().catch(() => { stopChild(); state.state = 'error'; state.message = 'Redis coordination unavailable; feed stopped.'; }).finally(() => { reconciling = false; }); } }, 500);
let lastLease = 0;
async function reconcile() {
  if (stopping) return;
  if (Date.now() - lastLease > 5000) {
    const renewed = await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],20000) else return 0 end", 1, FEED_KEYS.lease, owner);
    if (!renewed) { stopChild(); throw new Error('Feed ownership lost'); }
    lastLease = Date.now();
  }
  const raw = await redis.get(FEED_KEYS.desired), request: FeedRequest | undefined = raw ? JSON.parse(raw) : undefined;
  if (request?.id !== desired?.id) {
    stopChild(); desired = request;
    if (request) start(request); else state = { state: 'disconnected', message: 'Motilal disconnected.', updatedAt: new Date().toISOString() };
  }
  if (quotes.size) {
    const latest = [...quotes.values()]; quotes.clear();
    const pipeline = redis.pipeline(); for (const quote of latest) pipeline.set(`quantforge:quote:${quote.instrumentId}`, JSON.stringify(quote), 'EX', 120);
    await pipeline.exec(); await announce('market.quotes', latest);
  }
  if(pendingTicks.length){
    const batch=pendingTicks.splice(0,1000),pipeline=redis.pipeline();
    for(const tick of batch)pipeline.xadd('quantforge:market:ticks','MAXLEN','~',50000,'*','quote',JSON.stringify(tick));
    const result=await pipeline.exec();if(result?.some(([error])=>error))throw new Error('Tick persistence unavailable');
  }
  pendingCandles.push(...candleBuilder.drain());
  if(pendingCandles.length){
    const batch=pendingCandles.slice(0,500);
    await CandleModel.bulkWrite(batch.map(row=>({updateOne:{filter:{instrumentId:row.instrumentId,interval:row.interval,time:row.time},update:{$setOnInsert:row},upsert:true}})));
    pendingCandles=pendingCandles.slice(batch.length);await announce('market.candles',{count:batch.length});
  }
  await persist();
}
console.log('QuantForge read-only market-feed worker started');
async function shutdown() {
  if (stopping) return; stopping = true; clearInterval(timer); stopChild();
  state = { state: 'disconnected', message: 'Market-feed worker stopped.', updatedAt: new Date().toISOString() };
  await persist().catch(() => {}); await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, FEED_KEYS.lease, owner).catch(() => {});
  subscriber.disconnect(); await jobs.close(); await redis.quit(); await disconnectDatabase();
}
onShutdown(shutdown);
