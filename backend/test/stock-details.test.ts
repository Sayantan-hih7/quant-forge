import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indianTradeTime, parseSnapshot, parseQuotePackets, streamTradeTime } from '../src/modules/stock-details/providers/dhan-quotes.js';
import { aggregateBars } from '../src/modules/stock-details/utils/chart-bars.js';

const at = '2026-09-24T05:22:30.000Z';
test('stock snapshots use the explicit previous-close movement and Indian trade time', () => {
  const quote = parseSnapshot('NSE:1023', { last_price: 326.85, net_change: -4.45, last_trade_time: '24/09/2026 10:51:56', volume: 0, ohlc: { open: 328, close: 123, high: 332.7, low: 325.95 } }, at)!;
  assert.equal(quote.lastTradeAt, '2026-09-24T05:21:56.000Z');
  assert.ok(Math.abs(quote.previousClose! - 331.3) < 0.00001);
  assert.ok(quote.percent! < 0); assert.equal(quote.volume, 0);
  assert.equal(parseSnapshot('NSE:1', { last_price: 0 }, at), null);
  assert.equal(parseSnapshot('NSE:1', { last_price: 100 }, at)?.change, null);
  assert.equal(parseSnapshot('NSE:1', { last_price: 100, net_change: 0 }, at)?.change, 0);
});
test('invalid and future timestamps cannot be called current', () => {
  assert.equal(indianTradeTime('31/02/2026 10:00:00', Date.parse(at)), null);
  assert.equal(indianTradeTime('25/09/2026 10:00:00', Date.parse(at)), null);
  const wallSeconds = Date.parse('2026-09-24T10:52:24Z') / 1000;
  assert.equal(streamTradeTime(wallSeconds, at, '2026-09-24T05:21:56Z'), '2026-09-24T05:22:24.000Z');
  assert.equal(streamTradeTime(Date.parse('2026-09-24T05:22:24Z') / 1000, at), '2026-09-24T05:22:24.000Z');
  assert.equal(streamTradeTime(Date.parse('2026-09-23T10:00:00Z') / 1000, at), null);
  assert.equal(streamTradeTime(0, at), null);
});
test('binary quote parsing separates exchanges and rejects truncated packets', () => {
  const packet = Buffer.alloc(50); packet[0] = 4; packet.writeUInt16LE(50, 1); packet[3] = 1;
  packet.writeUInt32LE(1023, 4); packet.writeFloatLE(326.9, 8); packet.writeUInt32LE(1790247144, 14);
  packet.writeFloatLE(328, 18); packet.writeUInt32LE(100, 22); packet.writeFloatLE(328, 34); packet.writeFloatLE(999, 38); packet.writeFloatLE(332, 42); packet.writeFloatLE(325, 46);
  const bse = Buffer.from(packet); bse[3] = 4;
  const [n, b] = parseQuotePackets(Buffer.concat([packet, bse]));
  assert.equal(n.kind, 'quote'); assert.equal(b.kind, 'quote');
  if (n.kind !== 'quote' || b.kind !== 'quote') assert.fail();
  assert.equal(n.id, 'NSE:1023'); assert.equal(b.id, 'BSE:1023'); assert.equal(n.price, 326.9); assert.equal(n.volume, 100);
  assert.equal(parseQuotePackets(packet.subarray(0, 49)).length, 0);
  const nan = Buffer.from(packet); nan.writeFloatLE(NaN, 8); assert.equal(parseQuotePackets(nan).length, 0);
  const unknown = Buffer.from(packet); unknown[3] = 2; assert.equal(parseQuotePackets(unknown).length, 0);
});
test('chart aggregation respects Indian session opening, OHLC order, volume and monthly boundaries', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ time: new Date(Date.parse('2026-09-24T03:45:00Z') + i * 60_000).toISOString(), open: 100 + i, high: 110 + i, low: 90 + i, close: 101 + i, volume: 10 }));
  const five = aggregateBars([...rows].reverse(), '5m');
  assert.deepEqual(five[0], { time: '2026-09-24T03:45:00.000Z', open: 100, high: 114, low: 90, close: 105, volume: 50 });
  assert.equal(five[1].time, '2026-09-24T03:50:00.000Z');
  const days = [{ ...rows[0], time: '2026-08-31T03:45:00Z' }, { ...rows[1], time: '2026-09-01T03:45:00Z' }];
  assert.equal(aggregateBars(days, '1mo').length, 2);
  assert.equal(aggregateBars(days, '1w').length, 1);
  assert.equal(aggregateBars(days, '1w')[0].time, '2026-08-31');
  assert.equal(aggregateBars([], '1d').length, 0);
});
