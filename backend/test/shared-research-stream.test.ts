import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { StockQuoteStream, researchStreamStatus, type StreamDependencies } from '../src/modules/stock-details/services/stream.service.js';
import { mergeQuote } from '../src/modules/stock-details/utils/merge-quote.js';
import type { FeedStatus } from '../src/modules/market-feed/types/feed.types.js';
import type { StockQuote } from '../src/modules/stock-details/types.js';
import type { Instrument } from '../src/modules/market-data/types.js';
import { redis, jobs } from '../src/shared/redis.js';
after(async () => { await jobs.waitUntilReady(); await jobs.close(); await redis.quit(); });
const at = new Date().toISOString();
const quote: StockQuote = { instrumentId: 'NSE:1', price: 102, source: 'motilal-stream', streamSession: 'mo', lastTradeAt: at, receivedAt: at, previousClose: null, open: null, high: null, low: null, averagePrice: null, lowerCircuit: null, upperCircuit: null, volume: 100, change: null, percent: null };
const status: FeedStatus = { state: 'live', updatedAt: at, message: 'connected', provider: 'mixed', connections: { motilal: { state: 'live', session: 'mo', ids: ['NSE:1'], message: 'connected' }, dhan: { state: 'error', session: 'dhan', ids: ['NSE:2'], message: 'retry' } } };
test('connection status is per stock, including failed overflow and a quiet but connected stock', () => {
  const mixed = researchStreamStatus(status, ['NSE:1', 'NSE:2']);
  assert.equal(mixed.state, 'streaming'); assert.deepEqual(mixed.sessions, { 'NSE:1': 'mo' }); assert.deepEqual(mixed.providers, ['motilal']);
  assert.equal(researchStreamStatus(status, ['NSE:2']).state, 'connecting');
  assert.equal(researchStreamStatus(null, ['NSE:1']).state, 'unavailable');
  assert.equal(researchStreamStatus({ ...status, connections: {}, marketClosed: true }, ['NSE:1']).marketClosed, true);
});
test('snapshots enrich a stream without changing its price, time, source or cumulative volume', () => {
  const snapshot = { ...quote, source: 'dhan-snapshot' as const, price: 103, previousClose: 100, open: 99, high: 104, low: 98, volume: 300, receivedAt: new Date(Date.parse(at) + 1000).toISOString() };
  const result = mergeQuote(quote, snapshot, Date.parse(at) + 1000);
  assert.equal(result.source, 'motilal-stream'); assert.equal(result.price, 102); assert.equal(result.volume, 100); assert.equal(result.streamSession, 'mo');
  assert.equal(result.previousClose, 100); assert.equal(result.change, 2); assert.equal(result.high, 104);
  assert.equal(mergeQuote(quote, snapshot, Date.parse(at) + 30000).source, 'dhan-snapshot', 'Snapshots can supply prices when the live quote is old');
  assert.equal(mergeQuote({ ...quote, lastTradeAt: '2026-09-29T05:00:00Z' }, { ...snapshot, lastTradeAt: '2026-09-28T05:00:00Z' }).previousClose, null, 'Prior-day metadata is not reused');
});
test('shared relay deduplicates chart/list demand, releases closed views, and rejects a retired provider session', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const demands: { ids: string[]; chartIds: string[] }[] = [], updates: object[] = [];
  let receive: Parameters<StreamDependencies['subscribe']>[0] | undefined, closed = 0;
  const stream = new StockQuoteStream({ demand: async (_owner, ids, chartIds) => { demands.push({ ids, chartIds }); }, status: async () => status, subscribe: async callback => { receive = callback; return () => { closed++; }; } });
  const stock = { _id: 'NSE:1' } as Instrument;
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };
  try {
    const list = stream.watch([stock], update => updates.push(update));
    const chart = stream.watch([stock], update => updates.push(update), undefined, true);
    await settle(); assert.deepEqual(demands.at(-1), { ids: ['NSE:1'], chartIds: ['NSE:1'] });
    receive!({ quotes: [{ ...quote, streamSession: 'old' }] }); t.mock.timers.tick(500); await settle();
    assert.equal(updates.filter(u => 'quotes' in u).length, 0);
    receive!({ quotes: [quote] }); t.mock.timers.tick(500); await settle();
    assert.equal(updates.filter(u => 'quotes' in u).length, 2, 'One upstream quote reaches both views');
    chart(); await settle(); assert.deepEqual(demands.at(-1), { ids: ['NSE:1'], chartIds: [] });
    list(); await settle(); assert.deepEqual(demands.at(-1), { ids: [], chartIds: [] }); assert.equal(closed, 1);
  } finally { stream.close(); await settle(); t.mock.timers.reset(); }
});
