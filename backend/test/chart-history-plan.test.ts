import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartHistoryPlan } from '../src/modules/stock-details/utils/history-plan.js';
const now = Date.parse('2026-09-30T06:00:00Z');
test('chart history extends beyond six years for long monthly studies and includes custom anchors', () => {
  assert.ok(chartHistoryPlan('1mo',now,{minBars:210}).from < '2010-01-01');
  assert.equal(chartHistoryPlan('1d',now,{from:'2005-01-01'}).from,'2005-01-01');
  assert.ok(chartHistoryPlan('4h',now,{minBars:500}).from < '2025-09-01');
  assert.ok(chartHistoryPlan('1m',now,{from:'2005-01-01'}).warning);
  assert.equal(chartHistoryPlan('1mo',now,{minBars:1500}).from,'1990-01-01');
});

test('overview requests bound downloads while indicator requirements still take precedence', () => {
  assert.equal(chartHistoryPlan('1d',now,{lookbackDays:45}).from,'2026-08-16');
  assert.equal(chartHistoryPlan('5m',now,{lookbackDays:14}).from,'2026-09-16');
  assert.ok(chartHistoryPlan('1d',now,{lookbackDays:45,minBars:200}).from < '2026-01-01');
  assert.equal(chartHistoryPlan('1d',now,{lookbackDays:45,from:'2020-01-01'}).from,'2020-01-01');
  assert.ok(chartHistoryPlan('1d',now).from < '2021-01-01');
});
