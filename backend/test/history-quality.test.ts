import test from 'node:test';
import assert from 'node:assert/strict';
import { intradayHistoryQuality } from '../src/modules/backtesting/services/history-quality.js';
const open = Date.parse('2026-09-25T09:15:00+05:30');
const config = { from: '2026-09-25T00:00:00+05:30', to: '2026-09-26T00:00:00+05:30' };
const rows = Array.from({ length: 375 }, (_, n) => ({ time: new Date(open + n * 60_000).toISOString() }));
test('reports missing closing minutes without treating missing data as a successful intraday exit', () => {
  const report = intradayHistoryQuality([{ id: 'NSE:1', intraday: rows.slice(0, 360) }, { id: 'NSE:2', intraday: rows }], config, false);
  assert.equal(report.sessionsChecked, 2); assert.equal(report.missingMinutes, 15);
  assert.equal(report.incompleteSessions, 1); assert.equal(report.missingExitSessions, 1);
  assert.deepEqual(report.affected.map(s => s.instrumentId), ['NSE:1']);
});
test('distinguishes isolated gaps, overnight strategies and partial requested sessions', () => {
  assert.equal(intradayHistoryQuality([{ id: 'NSE:1', intraday: rows.slice(1) }], config, false).missingExitSessions, 0);
  assert.equal(intradayHistoryQuality([{ id: 'NSE:1', intraday: rows.slice(0, 360) }], config, true).missingExitSessions, 0);
  assert.equal(intradayHistoryQuality([{ id: 'NSE:1', intraday: rows }], { ...config, to: '2026-09-25T12:00:00+05:30' }, false).sessionsChecked, 0);
});
