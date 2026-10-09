import assert from 'node:assert/strict';
import test from 'node:test';
import { backgroundSummary } from '../src/modules/market-data/services/background-summary.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
test('inventory summary returns immediately, shares scans and retains stale counts while refreshing', async () => {
  let clock = 1000, calls = 0;
  let resolve!: (value: number[]) => void;
  const summary = backgroundSummary(() => { calls++; return new Promise<number[]>(done => { resolve = done; }); }, () => clock);
  assert.equal(summary.read().status.state, 'refreshing');
  assert.equal(summary.read().value, undefined);
  await settle();
  assert.equal(calls, 1);
  resolve([12]); await settle();
  assert.deepEqual(summary.read().value, [12]);
  assert.equal(summary.read().status.state, 'ready');
  clock += 300001;
  assert.deepEqual(summary.read().value, [12]);
  assert.equal(summary.read().status.state, 'refreshing');
  await settle();
  assert.equal(calls, 2);
  resolve([14]); await settle();
  assert.deepEqual(summary.read().value, [14]);
});
test('summary failure is explicit and retries are throttled', async () => {
  let clock = 1000, calls = 0;
  const summary = backgroundSummary(async () => { calls++; throw new Error('timeout'); }, () => clock);
  summary.read(); await settle();
  assert.equal(summary.read().status.state, 'unavailable');
  assert.equal(summary.read().value, undefined);
  assert.equal(calls, 1);
  clock += 60001;
  summary.read(); await settle();
  assert.equal(calls, 2);
});
