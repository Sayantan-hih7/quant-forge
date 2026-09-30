import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshot } from '../src/modules/stock-details/providers/dhan-quotes.js';
import { closingReferenceDay, withClosingChange } from '../src/modules/stock-details/utils/closing-change.js';

const now = Date.parse('2026-09-30T12:00:00Z');
const snapshot = () => parseSnapshot('NSE:2885', { last_price: 1187, net_change: 0, last_trade_time: '30/09/2026 15:59:59' }, new Date(now).toISOString())!;

test('RELIANCE after-close reset uses the exact prior session and keeps its price and timestamp', () => {
  const quote = snapshot(), day = closingReferenceDay(quote, now)!;
  assert.equal(day, '2026-09-29');
  const result = withClosingChange(quote, day, [{ instrumentId: quote.instrumentId, time: `${day}T03:45:00Z`, close: 1182 }]);
  assert.equal(result.change, 5);
  assert.equal(result.percent?.toFixed(2), '0.42');
  assert.equal(result.price, quote.price);
  assert.equal(result.lastTradeAt, quote.lastTradeAt);
  assert.equal(result.receivedAt, quote.receivedAt);
});

test('closing change preserves losses and genuine unchanged sessions, never substitutes a wrong date or exchange', () => {
  const quote = snapshot(), day = '2026-09-29';
  const candle = { instrumentId: quote.instrumentId, time: `${day}T03:45:00Z`, close: 1190 };
  assert.equal(withClosingChange(quote, day, [candle]).change, -3);
  assert.equal(withClosingChange(quote, day, [{ ...candle, close: 1187 }]).change, 0);
  for (const candles of [[], [{ ...candle, time: '2026-09-28T03:45:00Z' }], [{ ...candle, instrumentId: 'BSE:2885' }], [candle, { ...candle, close: 1191 }]]) {
    const result = withClosingChange(quote, day, candles);
    assert.equal(result.change, null); assert.equal(result.percent, null); assert.equal(result.price, 1187);
  }
});

test('reference dates respect weekends, holidays and the quote session without changing valid intraday movement', () => {
  const quote = snapshot();
  assert.equal(closingReferenceDay({ ...quote, lastTradeAt: '2026-09-28T09:59:00Z' }, now), '2026-09-25');
  assert.equal(closingReferenceDay({ ...quote, lastTradeAt: '2026-10-05T10:00:00Z', receivedAt: '2026-10-05T12:00:00Z' }, Date.parse('2026-10-05T12:00:00Z')), '2026-10-01');
  assert.equal(closingReferenceDay({ ...quote, change: 5 }, now), undefined);
  assert.equal(closingReferenceDay({ ...quote, source: 'motilal-stream' }, now), undefined);
  assert.equal(closingReferenceDay({ ...quote, lastTradeAt: '2026-09-30T09:59:00Z', receivedAt: '2026-09-30T09:59:00Z' }, now), undefined);
  assert.equal(closingReferenceDay({ ...quote, lastTradeAt: 'invalid' }, now), undefined);
});
