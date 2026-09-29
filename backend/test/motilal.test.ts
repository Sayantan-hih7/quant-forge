import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { totp, classifyLogin, broadcastLimit, configureBroadcastLimit, type BroadcastLimitClient } from '../src/modules/market-feed/providers/motilal-auth.js';
import { exchangeTimestamp, parseTick } from '../src/modules/market-feed/providers/motilal-packets.js';
import { parseMotilalMappings } from '../src/modules/market-data/sources/motilal-master.js';
import type { Instrument } from '../src/modules/market-data/types.js';

test('Motilal authentication uses standard TOTP and requires successful verified login response', () => {
  assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000), '287082'); // RFC 6238 SHA-1 vector, six digits
  assert.equal(classifyLogin({ status: 'SUCCESS', AuthToken: 'test-token', isAuthTokenVerified: 'FALSE' }), false);
  assert.equal(classifyLogin({ status: 'SUCCESS', AuthToken: 'test-token', isAuthTokenVerified: 'TRUE' }), true);
  assert.throws(() => classifyLogin({ status: 'ERROR', isAuthTokenVerified: 'FALSE' }));
  assert.throws(() => classifyLogin({ status: 'SUCCESS', isAuthTokenVerified: 'TRUE' }));
});

test('ticks need a genuine exchange timestamp and cumulative volume never uses last-trade quantity', () => {
  const stock = { id: 'NSE:2885', symbol: 'RELIANCE', exchange: 'NSE' as const, code: 2885 };
  const now = Date.parse('2026-09-23T05:00:00Z');
  const packet = { Type: 'LTP', Exchange: 'NSE', 'Scrip Code': 2885, LTP_Rate: 100, LTP_Qty: 20, Time: '2026-09-23 10:30:00' };
  assert.equal(parseTick(packet, stock, now)?.at, '2026-09-23T05:00:00.000Z');
  assert.equal(parseTick(packet, stock, now)?.cumulativeVolume, null);
  assert.equal(parseTick({ ...packet, LTP_Cumulative_Qty: 1000 }, stock, now)?.cumulativeVolume, 1000);
  assert.equal(parseTick({ ...packet, Exchange: 'BSE' }, stock, now), null);
  assert.equal(parseTick({ ...packet, Time: undefined }, stock, now), null);
  assert.equal(exchangeTimestamp({ Time: '2026-02-30 10:00:00' }, now), null);
  assert.equal(exchangeTimestamp({ Time: '2026-09-24 10:00:00' }, now), null);
});

test('provider mappings require exchange and ISIN identity, and reject ambiguous alternative codes', () => {
  const stock: Instrument = { _id: 'NSE:1', securityId: '1', exchange: 'NSE', isin: 'INE000A01001', symbol: 'TEST', name: 'Test', series: 'EQ', active: true, primary: true, lotSize: 1, observedAt: '2026-09-23' };
  const csv = 'exchangename,scripcode,scripisinno,issuspended\nNSE,1,INE000A01001,N\nBSE,1,INE000A01001,N\nNSE,2,INE000A01001,N';
  assert.deepEqual(parseMotilalMappings(csv, 'NSE', [stock]), [{ id: 'NSE:1', code: 1 }]);
  assert.equal(parseMotilalMappings(csv, 'NSE', [{ ...stock, securityId: '3' }]).length, 0);
  assert.equal(parseMotilalMappings(csv.replaceAll('INE000A01001', 'INE000A01002'), 'NSE', [stock]).length, 0);
});

test('broadcast limits use the broker result without an invented fallback', () => {
  assert.equal(broadcastLimit({ status: 'SUCCESS', errorcode: '', data: { MaxBroadcastLimit: 200 } }), 200);
  assert.equal(broadcastLimit({ status: 'SUCCESS', errorcode: '', data: { MaxBroadcastLimit: 0 } }), 0);
  assert.throws(() => broadcastLimit(undefined));
  assert.throws(() => broadcastLimit({ status: 'ERROR', errorcode: 'MO2031', data: { MaxBroadcastLimit: 0 } }));
  for (const value of [null, undefined, '', ' ', false, -1, 1.5, 'invalid']) {
    assert.throws(() => broadcastLimit({ status: 'SUCCESS', errorcode: '', data: { MaxBroadcastLimit: value } }));
  }
  assert.throws(() => broadcastLimit({ data: { MaxBroadcastLimit: 0 } }));
  assert.equal(broadcastLimit({ status: 'SUCCESS', MaxBroadcastLimit: '200' }), 200);
});

test('successful zero uses the actual Motilal SDK default and still enforces its capacity', async () => {
  // Use the vendored setter, not a mock that assumes what zero means. Constructing
  // the SDK and setting its limit make no provider requests and need no credentials.
  const require = createRequire(import.meta.url);
  const Sdk = require('../../vendor/motilal-broadcast-sdk/MOFSLOPENAPI_V3.1.cjs') as new (...args: string[]) => BroadcastLimitClient;
  const sdk = new Sdk('test-key', 'https://example.invalid', 'WEB', 'Chrome', '125', 'test-secret');
  const response = (limit: number) => ({ status: 'SUCCESS', errorcode: '', data: { MaxBroadcastLimit: limit } });
  assert.equal(await configureBroadcastLimit(sdk, response(0), 200), 200);
  assert.equal(sdk.m_intBroadcastLimit, 200);
  await assert.rejects(configureBroadcastLimit(sdk, response(0), 201), /exceeds/);
  assert.equal(await configureBroadcastLimit(sdk, response(5), 5), 5);
  await assert.rejects(configureBroadcastLimit(sdk, response(5), 6), /exceeds/);
});

test('missing limits and authentication failures cannot activate the SDK default', async () => {
  let calls = 0;
  const sdk: BroadcastLimitClient = { m_intBroadcastLimit: 200, setMaxBroadcastLimit: () => { calls++; } };
  for (const response of [undefined, { status: 'SUCCESS', data: {} }, { status: 'ERROR', errorcode: 'MO2031', data: { MaxBroadcastLimit: 0 } }, { status: 'SUCCESS', errorcode: 'MO8001', data: { MaxBroadcastLimit: 0 } }]) {
    await assert.rejects(configureBroadcastLimit(sdk, response, 1));
  }
  assert.equal(calls, 0);
  await assert.rejects(configureBroadcastLimit({ m_intBroadcastLimit: 0, setMaxBroadcastLimit: () => {} }, { status: 'SUCCESS', data: { MaxBroadcastLimit: 0 } }, 1), /SDK did not establish/);
});
