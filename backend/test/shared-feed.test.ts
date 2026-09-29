import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionPlan } from '../src/modules/market-feed/services/subscription-plan.js';
import { SharedFeed, currentQuote } from '../src/modules/market-feed/services/shared-feed.js';
import type { ChildEvent, FeedInstrument, FeedStatus, LiveQuote } from '../src/modules/market-feed/types/feed.types.js';
import type { TransportFactory } from '../src/modules/market-feed/providers/transports.js';

const stocks = (count: number): FeedInstrument[] => Array.from({ length: count }, (_, i) => ({ id: `NSE:${i + 1}`, exchange: 'NSE', code: i + 1, securityId: String(i + 1), symbol: `STOCK${i + 1}` }));
const auto = { preference: 'auto' as const, motilal: true, dhan: true };
test('priority, deduplication and 200-stock Motilal overflow preserve full Dhan failover capacity', () => {
  const rows = stocks(5001), plan = subscriptionPlan([rows[5000], ...rows, rows[0]], auto);
  assert.equal(plan.motilal.length, 200); assert.equal(plan.dhan.length, 4800);
  assert.equal(plan.motilal[0].id, rows[5000].id); assert.deepEqual(plan.unavailable, [rows[4999].id]);
  assert.equal(new Set([...plan.motilal, ...plan.dhan].map(s => s.id)).size, 5000);
  const fallback = subscriptionPlan([rows[5000], ...rows], { ...auto, motilalFailed: true });
  assert.equal(fallback.motilal.length, 0); assert.equal(fallback.dhan.length, 5000);
});
test('missing mappings, exchange identity, lower broker capacity and explicit preferences are respected', () => {
  const rows = stocks(4); rows[0].code = undefined; rows[1] = { ...rows[1], id: 'BSE:1', exchange: 'BSE', code: 1 };
  const plan = subscriptionPlan(rows, { ...auto, motilalLimit: 2 });
  assert.deepEqual(plan.motilal.map(s => s.id), ['BSE:1', 'NSE:3']);
  assert.deepEqual(plan.dhan.map(s => s.id), ['NSE:1', 'NSE:4']);
  assert.equal(subscriptionPlan(rows, { ...auto, preference: 'dhan' }).motilal.length, 0);
  assert.deepEqual(subscriptionPlan(rows, { ...auto, preference: 'motilal' }).unavailable, ['NSE:1']);
});
function harness() {
  let now = Date.parse('2026-09-29T05:00:00Z');
  const quotes: LiveQuote[] = [];
  const transports: { provider: string; stocks: FeedInstrument[]; emit: (e: ChildEvent) => void; fail: () => void; stopped: boolean; replacements: number }[] = [];
  const factory: TransportFactory = (provider, rows, emit, fail) => {
    const slot = { provider, stocks: rows, emit, fail, stopped: false, replacements: 0 }; transports.push(slot);
    return { stop() { slot.stopped = true; }, replace(next) { slot.stocks = next; slot.replacements++; } };
  };
  const feed = new SharedFeed(factory, q => quotes.push(q), () => now);
  const tick = (slot: typeof transports[number], id = slot.stocks[0].id, offset = 0) => slot.emit({ type: 'tick', quote: { instrumentId: id, symbol: id, exchange: 'NSE', price: 100, source: slot.provider as 'motilal' | 'dhan', cumulativeVolume: 100, at: new Date(now + offset).toISOString(), receivedAt: new Date(now).toISOString() } });
  return { feed, transports, quotes, tick, advance: (ms: number) => { now += ms; }, status: () => ({ ...feed.status(), updatedAt: new Date(now).toISOString() }) as FeedStatus };
}
test('adding research stocks replaces subscriptions without reconnecting held stocks', () => {
  const h = harness(); h.feed.reconcile(stocks(2), auto); const mo = h.transports[0]; h.tick(mo);
  const session = h.quotes[0].session;
  h.feed.reconcile(stocks(205), auto); h.tick(mo);
  assert.equal(h.transports.length, 2); assert.equal(mo.replacements, 1); assert.equal(mo.stopped, false);
  assert.equal(h.quotes[1].session, session); assert.equal(h.status().provider, 'mixed');
  h.tick(h.transports[1]); assert.ok(h.quotes.every(q => currentQuote(h.status(), q)));
  h.feed.reconcile(stocks(2), auto); assert.equal(h.transports[1].stopped, true); assert.equal(mo.stopped, false);
  h.tick(mo, 'NSE:200'); assert.equal(h.quotes.length, 3, 'Removed subscriptions cannot emit prices');
});
test('Motilal failure moves its stocks to the existing Dhan socket and rejects old-source and older ticks', () => {
  const h = harness(); h.feed.reconcile(stocks(205), auto); const [mo, dhan] = h.transports;
  h.tick(mo); h.tick(dhan); const original = [...h.quotes]; mo.fail(); h.feed.reconcile(stocks(205), auto);
  assert.equal(h.transports.length, 2); assert.equal(dhan.replacements, 1); assert.equal(dhan.stocks.length, 205); assert.ok(mo.stopped);
  assert.equal(currentQuote(h.status(), original[0]), false); assert.equal(currentQuote(h.status(), original[1]), true);
  h.tick(mo); h.tick(dhan, 'NSE:1', -1000); assert.equal(h.quotes.length, 2);
  h.advance(1000); h.tick(dhan, 'NSE:1'); assert.equal(h.quotes.length, 3); assert.equal(h.quotes[2].source, 'dhan');
  assert.ok(currentQuote(h.status(), h.quotes[2]));
});
test('Dhan failure leaves Motilal working, retries independently, and invalidates old Dhan sessions', () => {
  const h = harness(); h.feed.reconcile(stocks(205), auto); const [mo, dhan] = h.transports; h.tick(mo); h.tick(dhan);
  const old = h.quotes[1]; dhan.fail(); h.feed.reconcile(stocks(205), auto);
  assert.equal(mo.stopped, false); assert.equal(currentQuote(h.status(), old), false);
  h.advance(5001); h.feed.reconcile(stocks(205), auto); assert.equal(h.transports.length, 3);
  h.tick(h.transports[2]); assert.notEqual(h.quotes.at(-1)!.session, old.session); assert.equal(mo.stopped, false);
});
test('a lower negotiated Motilal limit routes overflow to Dhan without restarting Motilal', () => {
  const h = harness(); h.feed.reconcile(stocks(205), auto);
  h.transports[0].emit({ type: 'status', state: 'waiting', limit: 100, message: 'Connected' });
  h.feed.reconcile(stocks(205), auto);
  assert.equal(h.transports.length, 2); assert.equal(h.transports[0].stocks.length, 100); assert.equal(h.transports[1].stocks.length, 105);
});
test('explicit Motilal-only and unavailable Dhan retry Motilal instead of becoming permanently blocked', () => {
  for (const options of [{ ...auto, preference: 'motilal' as const }, { ...auto, dhan: false }]) {
    const h = harness(); h.feed.reconcile(stocks(2), options); h.transports[0].fail(); h.advance(5001); h.feed.reconcile(stocks(2), options);
    assert.equal(h.transports.length, 2); assert.equal(h.transports[1].provider, 'motilal');
  }
});
