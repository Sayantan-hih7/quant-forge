import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carriedIntradayPositions, intradayContinuation } from '../src/modules/paper-trading/services/intraday-continuation.js';
const at = (value: string) => Date.parse(value + '+05:30');
const session = { active: true, entriesPaused: false, strategy: { risk: { overnight: false } } };
test('intraday monitoring persists after close; weekends and verified holidays are skipped', () => {
  const friday = intradayContinuation(session, [], ['NSE:1'], at('2026-10-09T16:00:00'))!;
  assert.equal(friday.continuation, 'automatic');
  assert.equal(friday.phase, 'waiting-session');
  assert.equal(friday.nextOpenAt, '2026-10-12T03:45:00.000Z');
  const holiday = intradayContinuation(session, [], ['NSE:1'], at('2026-10-19T16:00:00'))!;
  assert.equal(holiday.nextOpenAt, '2026-10-21T03:45:00.000Z');
});
test('pauses persist, daily loss blocks only its date, and qualification remains required', () => {
  const now = at('2026-10-12T10:00:00');
  assert.equal(intradayContinuation({ ...session, entriesPaused: true }, [], ['NSE:1'], now)!.phase, 'paused');
  assert.equal(intradayContinuation({ ...session, lossLimitDate: '2026-10-09' }, [], ['NSE:1'], now)!.phase, 'monitoring');
  assert.equal(intradayContinuation({ ...session, lossLimitDate: '2026-10-12' }, [], ['NSE:1'], now)!.phase, 'daily-loss-limit');
  assert.equal(intradayContinuation(session, [], [], now)!.phase, 'qualification-required');
  assert.equal(intradayContinuation({ ...session, active: false }, [], ['NSE:1'], now)!.continuation, 'stopped');
});
test('unfinished exits and invalid timestamps cannot be mistaken for a clean next day', () => {
  const positions = [{ instrumentId: 'NSE:1', openedAt: '2026-10-09T05:00:00.000Z' }];
  assert.equal(intradayContinuation(session, positions, ['NSE:1'], at('2026-10-09T16:00:00'))!.phase, 'unfinished-exits');
  assert.equal(carriedIntradayPositions(false, positions, at('2026-10-12T10:00:00')).length, 1);
  assert.equal(carriedIntradayPositions(false, positions, at('2026-10-09T10:45:00')).length, 0);
  assert.equal(carriedIntradayPositions(true, positions, at('2026-10-12T10:00:00')).length, 0);
  assert.equal(carriedIntradayPositions(false, [{ openedAt: 'invalid' }], at('2026-10-12T10:00:00')).length, 1);
});
test('the conservative NSE cutoff is separate from the next market open', () => {
  assert.equal(intradayContinuation(session, [], ['NSE:1'], at('2026-10-09T15:11:00'))!.phase, 'waiting-session');
  assert.equal(intradayContinuation(session, [], ['BSE:1'], at('2026-10-09T15:11:00'))!.phase, 'monitoring');
  assert.equal(intradayContinuation({ ...session, strategy: { risk: { overnight: true } } }, [], [], Date.now()), undefined);
});
