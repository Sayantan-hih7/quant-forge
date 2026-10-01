import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCircuits, parseDepthLevel } from '../src/modules/market-feed/providers/motilal-packets.js';
import { SharedFeed } from '../src/modules/market-feed/services/shared-feed.js';
import { sharedStockQuote } from '../src/modules/stock-details/utils/shared-quote.js';
import type { ChildEvent, FeedInstrument, LiveBook, LiveQuote } from '../src/modules/market-feed/types/feed.types.js';
import type { TransportFactory } from '../src/modules/market-feed/providers/transports.js';
import { mergeQuote } from '../src/modules/stock-details/utils/merge-quote.js';
import { parseQuotePackets } from '../src/modules/stock-details/providers/dhan-quotes.js';
import { DepthFeed, type DepthBook, type DepthTransportFactory } from '../src/modules/market-feed/services/depth-feed.js';
import type { StockQuote } from '../src/modules/stock-details/types.js';

test('Motilal depth levels and circuit packets parse defensively', () => {
  assert.deepEqual(parseDepthLevel({ Type: 'MarketDepth', Level: 1, BidRate: 100.5, BidQty: 25, BidOrder: 3, OfferRate: 100.6, OfferQty: 10, OfferOrder: 1 }),
    { index: 0, bid: { price: 100.5, quantity: 25, orders: 3 }, ask: { price: 100.6, quantity: 10, orders: 1 } });
  assert.equal(parseDepthLevel({ Type: 'MarketDepth', Level: 0, BidRate: 1, BidQty: 1 })?.index, 0);
  // An empty side (zero rate or quantity) is cleared rather than shown as a ₹0 order.
  assert.deepEqual(parseDepthLevel({ Type: 'MarketDepth', Level: 5, BidRate: 0, BidQty: 0, OfferRate: 101, OfferQty: 'x' }), { index: 4, bid: null, ask: null });
  assert.equal(parseDepthLevel({ Type: 'MarketDepth', Level: 9 }), null);
  assert.equal(parseDepthLevel({ Type: 'LTP', Level: 1 }), null);
  assert.deepEqual(parseCircuits({ Type: 'DPR', UpperCktLimit: 110, LowerCktLimit: 90 }), { upperCircuit: 110, lowerCircuit: 90 });
  assert.equal(parseCircuits({ Type: 'DPR', UpperCktLimit: 80, LowerCktLimit: 90 }), null);
});

test('books route only for subscribed stocks of the same provider and never mark the stream live', () => {
  const emits: ((event: ChildEvent) => void)[] = [];
  const factory: TransportFactory = (_provider, _rows, emit) => { emits.push(emit); return { stop() {}, replace() {} }; };
  const books: LiveBook[] = [];
  const feed = new SharedFeed(factory, () => {}, () => Date.parse('2026-10-01T05:00:00Z'), book => books.push(book));
  feed.reconcile([{ id: 'NSE:1', symbol: 'A', exchange: 'NSE', code: 1 }], { preference: 'motilal', motilal: true, dhan: false });
  const book = { instrumentId: 'NSE:1', source: 'motilal' as const, receivedAt: '2026-10-01T05:00:00Z', bids: [], asks: [] };
  emits[0]({ type: 'book', book });
  emits[0]({ type: 'book', book: { ...book, instrumentId: 'NSE:2' } });
  emits[0]({ type: 'book', book: { ...book, source: 'dhan' } });
  assert.equal(books.length, 1);
  assert.ok(books[0].session);
  assert.notEqual(feed.status().state, 'live');
});

test('a quote carries depth and circuits only from a book of the same stream session', () => {
  const tick: LiveQuote = { instrumentId: 'NSE:1', symbol: 'A', exchange: 'NSE', price: 100, cumulativeVolume: 10, at: '2026-10-01T05:00:00Z', receivedAt: '2026-10-01T05:00:00Z', source: 'motilal', session: 's1', details: { previousClose: 95 } };
  const book: LiveBook = { instrumentId: 'NSE:1', source: 'motilal', session: 's1', receivedAt: '2026-10-01T05:00:01Z', bids: [{ price: 99.9, quantity: 5, orders: 1 }], asks: [{ price: 100.1, quantity: 7, orders: 2 }], upperCircuit: 110, lowerCircuit: 90 };
  const quote = sharedStockQuote(tick, { ...book, levels: 1 });
  assert.equal(quote.depth, undefined);
  assert.equal(quote.liveDepth?.source, 'Motilal stream');
  assert.equal(quote.liveDepth?.bids[0].price, 99.9);
  assert.equal(quote.liveDepth?.levels, 1);
  assert.equal(quote.upperCircuit, 110);
  assert.equal(quote.change, 5);
  const stale = sharedStockQuote(tick, { ...book, session: 'old' });
  assert.equal(stale.liveDepth, undefined); assert.equal(stale.upperCircuit, null);
});

test('a one-level streamed book never replaces the five-level snapshot', () => {
  const level = (price: number) => ({ price, quantity: 1, orders: 1 });
  const snapshot: StockQuote = { instrumentId: 'NSE:1', price: 100, previousClose: 95, change: 5, percent: 5.26, open: 96, high: 101, low: 95, volume: 10, averagePrice: 99,
    lowerCircuit: 90, upperCircuit: 110, lastTradeAt: '2026-10-01T05:00:00.000Z', receivedAt: '2026-10-01T05:00:00.000Z', source: 'dhan-snapshot',
    depth: { bids: [100, 99.9, 99.8, 99.7, 99.6].map(level), asks: [100.1, 100.2, 100.3, 100.4, 100.5].map(level), totalBuy: 500, totalSell: 400, receivedAt: '2026-10-01T05:00:00.000Z', source: 'Dhan snapshot' } };
  const streamed: StockQuote = { ...snapshot, depth: undefined, source: 'motilal-stream', lastTradeAt: '2026-10-01T05:00:02.000Z', receivedAt: '2026-10-01T05:00:02.000Z',
    liveDepth: { bids: [level(100.05)], asks: [level(100.1)], totalBuy: null, totalSell: null, receivedAt: '2026-10-01T05:00:02.000Z', source: 'Motilal stream', levels: 1 } };
  const merged = mergeQuote(snapshot, streamed, Date.parse('2026-10-01T05:00:03.000Z'));
  assert.equal(merged.depth?.bids.length, 5); assert.equal(merged.depth?.totalBuy, 500);
  assert.equal(merged.liveDepth?.bids[0].price, 100.05); assert.equal(merged.source, 'motilal-stream');
});

test('Dhan Full packets decode five depth levels and whole-book totals', () => {
  const b = Buffer.alloc(162); b[0] = 8; b.writeUInt16LE(162, 1); b[3] = 1; b.writeUInt32LE(2885, 4);
  b.writeFloatLE(1166, 8); b.writeInt32LE(622962, 26); b.writeInt32LE(604830, 30);
  for (let i = 0; i < 5; i++) {
    const at = 62 + i * 20;
    b.writeInt32LE(100 + i, at); b.writeInt32LE(i === 4 ? 0 : 200 + i, at + 4); b.writeInt16LE(i + 1, at + 8); b.writeInt16LE(i + 2, at + 10);
    b.writeFloatLE(1166 - i * 0.1, at + 12); b.writeFloatLE(1166.2 + i * 0.1, at + 16);
  }
  const [packet] = parseQuotePackets(b);
  assert.equal(packet.kind, 'depth');
  if (packet.kind !== 'depth') return;
  assert.equal(packet.id, 'NSE:2885');
  assert.deepEqual(packet.bids.map(x => [x.price, x.quantity, x.orders]), [[1166, 100, 1], [1165.9, 101, 2], [1165.8, 102, 3], [1165.7, 103, 4], [1165.6, 104, 5]]);
  // A zero-quantity level is empty, not a ₹ price with no orders.
  assert.deepEqual(packet.asks.map(x => x.price), [1166.2, 1166.3, 1166.4, 1166.5]);
  assert.deepEqual([packet.totalBuy, packet.totalSell], [604830, 622962]);
  assert.equal(parseQuotePackets(b.subarray(0, 100)).length, 0);
});

test('depth feed follows open stocks, backs off after failure and ignores late books', () => {
  let now = 0; const made: { stocks: FeedInstrument[]; book: (b: DepthBook) => void; failed: (m: string) => void; stopped: boolean; replaced: number }[] = [];
  const factory: DepthTransportFactory = (stocks, book, failed) => { const t = { stocks, book, failed, stopped: false, replaced: 0 }; made.push(t); return { replace(next) { t.stocks = next; t.replaced++; }, stop() { t.stopped = true; } }; };
  const books: DepthBook[] = [];
  const feed = new DepthFeed(factory, b => books.push(b), () => now);
  const stock = (id: number): FeedInstrument => ({ id: `NSE:${id}`, symbol: `S${id}`, exchange: 'NSE', securityId: String(id) });
  feed.reconcile([stock(1)], true); feed.reconcile([stock(1)], true);
  assert.equal(made.length, 1); assert.equal(feed.status().state, 'connecting');
  feed.reconcile([stock(1), stock(2)], true); assert.equal(made[0].replaced, 1);
  made[0].book({ instrumentId: 'NSE:2', source: 'dhan', receivedAt: 'x', levels: 5 }); assert.equal(books.length, 1); assert.equal(feed.status().state, 'live');
  made[0].failed('closed.'); assert.equal(made[0].stopped, true); assert.equal(feed.status().state, 'error');
  made[0].book({ instrumentId: 'NSE:2', source: 'dhan', receivedAt: 'x' }); assert.equal(books.length, 1, 'a failed connection cannot deliver books');
  feed.reconcile([stock(1)], true); assert.equal(made.length, 1, 'waits for the retry delay');
  now += 5_000; feed.reconcile([stock(1)], true); assert.equal(made.length, 2);
  feed.reconcile([stock(1)], false); assert.equal(made[1].stopped, true); assert.equal(feed.status().state, 'off');
});

test('a fresh Dhan five-level book is preferred over the price feed level-1 book', () => {
  const tick: LiveQuote = { instrumentId: 'NSE:1', symbol: 'A', exchange: 'NSE', price: 100, cumulativeVolume: 10, at: '2026-10-01T05:00:00Z', receivedAt: '2026-10-01T05:00:00Z', source: 'motilal', session: 's1' };
  const motilal: LiveBook = { instrumentId: 'NSE:1', source: 'motilal', session: 's1', receivedAt: '2026-10-01T05:00:01Z', bids: [{ price: 99.9, quantity: 1, orders: 1 }], asks: [{ price: 100.1, quantity: 1, orders: 1 }], upperCircuit: 110, lowerCircuit: 90, levels: 1 };
  const level = (price: number) => ({ price, quantity: 5, orders: 1 });
  const dhan = { instrumentId: 'NSE:1', source: 'dhan' as const, receivedAt: '2026-10-01T05:00:02.000Z', bids: [99.9, 99.8, 99.7, 99.6, 99.5].map(level), asks: [100.1, 100.2, 100.3, 100.4, 100.5].map(level), totalBuy: 900, totalSell: 800, levels: 5 };
  const fresh = sharedStockQuote(tick, motilal, dhan, Date.parse('2026-10-01T05:00:05Z'));
  assert.equal(fresh.liveDepth?.source, 'Dhan stream'); assert.equal(fresh.liveDepth?.bids.length, 5); assert.equal(fresh.liveDepth?.totalBuy, 900);
  assert.equal(fresh.upperCircuit, 110, 'circuits still come from the price feed');
  const stale = sharedStockQuote(tick, motilal, dhan, Date.parse('2026-10-01T05:00:30Z'));
  assert.equal(stale.liveDepth?.source, 'Motilal stream'); assert.equal(stale.liveDepth?.levels, 1);
});
