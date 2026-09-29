import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketTime, nextRegularOpen, marketSession } from '../src/shared/market-calendar.js';
import { evaluationWindow, signalOrderExpiry } from '../src/modules/paper-trading/services/evaluation-window.js';
import { feedProvider, feedRetryDelay } from '../src/modules/market-feed/services/recovery.js';
import { hashPassword, verifyPassword } from '../src/modules/workspace/password.js';
const at = (value: string) => Date.parse(`${value}+05:30`);

test('index session metadata pauses over the holiday weekend and provides exact IST boundaries', () => {
  const open = marketSession(at('2026-10-01T15:29:59'));
  assert.equal(open.open, true);
  assert.equal(Date.parse(open.closesAt), at('2026-10-01T15:30:00'));
  assert.equal(Date.parse(open.nextOpenAt!), at('2026-10-05T09:15:00'));
  for (const [date, reason] of [['2026-10-01T15:30:00', 'Market closed'], ['2026-10-02T10:00:00', 'Market holiday'], ['2026-10-03T10:00:00', 'Weekend'], ['2026-10-05T09:14:59', 'Before market open']]) {
    const session = marketSession(at(date)); assert.equal(session.open, false); assert.equal(session.reason, reason);
    assert.equal(Date.parse(session.nextOpenAt!), at('2026-10-05T09:15:00'));
  }
  assert.equal(marketSession(at('2026-10-05T09:15:00')).open, true);
  assert.equal(marketSession(at('2031-01-02T10:00:00')).nextOpenAt, null);
});

test('signal limit buys expire at the eligible session end, including daily signals over a weekend', () => {
  const daily = evaluationWindow('daily', new Date(at('2026-09-25T09:00:00')).toISOString(), at('2026-09-26T12:00:00'))!;
  assert.equal(Date.parse(signalOrderExpiry(daily.expiresAt, true, true)), at('2026-09-28T15:30:00'));
  const expiry = new Date(at('2026-09-25T09:25:00')).toISOString();
  assert.equal(Date.parse(signalOrderExpiry(expiry, true, false)), at('2026-09-25T15:15:00'));
  assert.equal(signalOrderExpiry(expiry, false, false), expiry);
});

test('cash sessions exclude weekends and holidays, and unknown calendar years fail closed', () => {
  assert.equal(marketTime(at('2026-09-28T09:15:00')).open, true);
  assert.equal(marketTime(at('2026-09-28T15:30:00')).open, false);
  assert.equal(marketTime(at('2026-09-26T10:00:00')).open, false);
  assert.equal(marketTime(at('2026-10-02T10:00:00')).open, false);
  assert.equal(marketTime(at('2031-01-02T10:00:00')).knownYear, false);
  assert.equal(nextRegularOpen(at('2026-10-01T15:30:00')), at('2026-10-05T09:15:00'));
});
test('daily candles can be evaluated after hours and over the weekend, with next-session expiry', () => {
  const created = new Date(at('2026-09-25T09:00:00')).toISOString();
  const result = evaluationWindow('daily', created, at('2026-09-26T12:00:00'));
  assert.equal(result?.barEnd, new Date(at('2026-09-25T15:30:00')).toISOString());
  assert.equal(result?.expiresAt, new Date(at('2026-09-28T09:45:00')).toISOString());
  assert.equal(evaluationWindow('daily', created, at('2026-09-28T10:00:00')), null);
  assert.equal(evaluationWindow('daily', new Date(at('2026-09-25T16:00:00')).toISOString(), at('2026-09-26T12:00:00')), null);
});
test('intraday waits for candle completion, excludes current candles, and never replays overnight entries', () => {
  const created = new Date(at('2026-09-25T09:00:00')).toISOString();
  assert.equal(evaluationWindow('5m', created, at('2026-09-25T09:20:04')), null);
  assert.equal(evaluationWindow('5m', created, at('2026-09-25T09:20:05'))?.barEnd, new Date(at('2026-09-25T09:20:00')).toISOString());
  assert.equal(evaluationWindow('5m', created, at('2026-09-25T16:00:00')), null);
  assert.equal(evaluationWindow('5m', created, at('2026-09-28T09:16:00')), null);
});
test('feed fallback respects an explicit provider, and repeated failures back off', () => {
  assert.equal(feedProvider('auto', true, false), 'motilal');
  assert.equal(feedProvider('auto', true, true), 'dhan');
  assert.equal(feedProvider('auto', false, false), 'dhan');
  assert.equal(feedProvider('motilal', true, true), 'motilal');
  assert.equal(feedProvider('dhan', true, false), 'dhan');
  assert.equal(feedRetryDelay(0), 5000); assert.equal(feedRetryDelay(100), 300000);
});
test('owner passwords use salted hashes and reject invalid credentials', async () => {
  const first = await hashPassword('Test fixture password 123'), second = await hashPassword('Test fixture password 123');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('Test fixture password 123', first), true);
  assert.equal(await verifyPassword('Wrong fixture password', first), false);
  assert.equal(await verifyPassword('Test fixture password 123', 'plaintext'), false);
});
