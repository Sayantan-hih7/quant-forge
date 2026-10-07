import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import axios, { AxiosError } from 'axios';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { dhanRenewalDue, nextDhanRenewal } from '../src/modules/connections/utils/dhan-renewal.js';
import type { Connection } from '../src/modules/connections/models/connection.model.js';

test('renewal is expiry-based, never for OAuth, unconfirmed, disabled or expired-login sessions', () => {
  const now = Date.parse('2026-09-24T10:00:00Z');
  const connection: Connection = { _id: 'dhan', encryptedToken: 'fixture', status: 'connected',
    tokenSource: 'web', autoRenew: true, renewalState: 'scheduled', expiresAt: '2026-09-24T10:30:00Z' };
  assert.equal(nextDhanRenewal(connection.expiresAt!, now), new Date(now).toISOString());
  assert.equal(dhanRenewalDue(connection, now), true);
  assert.equal(dhanRenewalDue(connection, now - 1), false);
  assert.equal(dhanRenewalDue({ ...connection, tokenSource: 'oauth' }, now), false);
  assert.equal(dhanRenewalDue({ ...connection, tokenSource: 'unknown' }, now), false);
  assert.equal(dhanRenewalDue({ ...connection, autoRenew: false }, now), false);
  assert.equal(dhanRenewalDue({ ...connection, status: 'disconnected' }, now), false);
  assert.equal(dhanRenewalDue({ ...connection, renewalState: 'login_required' }, now), false);
  assert.equal(dhanRenewalDue({ ...connection, nextRenewalAt: '2026-09-24T10:05:00Z' }, now), false);
  // An expired connection is picked up once to report that a fresh token is needed.
  assert.equal(dhanRenewalDue(connection, now + 60 * 60_000), true);
});

test('Dhan automatic renewal lifecycle with isolated MongoDB and mocked provider requests', { skip: process.env.RUN_DB_TESTS !== '1' }, async t => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`;
  const uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  const originalAdapter = axios.defaults.adapter, originalKey = env.SECRET_ENCRYPTION_KEY, originalClient = process.env.DHAN_CLIENT_ID;
  env.SECRET_ENCRYPTION_KEY = randomBytes(32).toString('hex'); process.env.DHAN_CLIENT_ID = '1234567890';
  const oldToken = 'eyJmaXh0dXJl.old.signature', newToken = 'eyJmaXh0dXJl.new.signature';
  const calls: string[] = [];
  let failProfile = false, rejectProfile = false, failRenew = 0;
  let duringRenew: (() => Promise<void>) | undefined;
  axios.defaults.adapter = async config => {
    calls.push(config.url!);
    const response = { status: 200, statusText: 'OK', headers: {}, config, data: {} as Record<string, unknown> };
    if (config.url === '/RenewToken') {
      assert.equal(config.method, 'get'); assert.equal(config.headers.get('dhanClientId'), '1234567890');
      assert.equal(config.headers.get('access-token'), oldToken);
      if (failRenew) throw new AxiosError('fixture-sensitive-error', 'ERR_BAD_REQUEST', config, undefined, { ...response, status: failRenew });
      if (duringRenew) await duringRenew();
      response.data = { accessToken: newToken, dhanClientId: 1234567890 };
    } else if (config.url === '/profile') {
      if (rejectProfile) throw new AxiosError('fixture-sensitive-error', 'ERR_BAD_REQUEST', config, undefined, { ...response, status: 400, data: { errorCode: 'DH-906', errorMessage: 'Invalid Token' } });
      if (failProfile) throw new AxiosError('fixture-sensitive-error', 'ECONNABORTED', config);
      response.data = { dhanClientId: '1234567890', dataPlan: 'Active', tokenValidity: new Date(Date.now() + 24 * 60 * 60_000).toISOString() };
    } else throw new Error('Unexpected provider request');
    return response;
  };
  const { ConnectionModel } = await import('../src/modules/connections/models/connection.model.js');
  const { encrypt, decrypt } = await import('../src/shared/secrets.js');
  const { renewDhanConnectionIfDue, setDhanAutoRenew } = await import('../src/modules/connections/services/dhan-renewal.service.js');
  const { reconnectSavedDhan } = await import('../src/modules/connections/services/dhan-reconnect.service.js');
  const { connectDhanCredential, disconnectDhan } = await import('../src/modules/connections/services/dhan.service.js');
  const { jobs, redis } = await import('../src/shared/redis.js');
  async function seed(overrides: Partial<Connection> = {}) {
    calls.length = 0; failProfile = false; rejectProfile = false; failRenew = 0; duringRenew = undefined;
    await ConnectionModel.deleteMany({});
    await ConnectionModel.create({ _id: 'dhan', encryptedToken: encrypt(oldToken), status: 'connected', tokenSource: 'web', autoRenew: true,
      renewalState: 'scheduled', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      nextRenewalAt: new Date(Date.now() - 60_000).toISOString(), ...overrides });
  }
  const saved = () => ConnectionModel.findById('dhan').select('+encryptedToken').lean();
  try {
    await mongoose.connect(uri.toString()); assert.equal(mongoose.connection.name, name);
    await t.test('startup restores saved token after failed renewal without rotating it or repeating verification', async () => {
      await seed({ status: 'expired', renewalState: 'login_required' });
      const startedAt = Date.now();
      await reconnectSavedDhan(startedAt); await reconnectSavedDhan(startedAt);
      assert.deepEqual(calls, ['/profile']);
      assert.equal((await saved())!.status, 'connected');
      assert.equal((await saved())!.reconnectState, 'connected');
      assert.equal((await saved())!.renewalState, 'scheduled');
      assert.equal(decrypt((await saved())!.encryptedToken!), oldToken);
    });
    await t.test('startup outage schedules a retry and explicit disconnect prevents recovery', async () => {
      await seed({ autoRenew: false, tokenSource: 'oauth' }); failProfile = true;
      const startedAt = Date.now();
      await reconnectSavedDhan(startedAt); await reconnectSavedDhan(startedAt);
      assert.deepEqual(calls, ['/profile']); assert.equal((await saved())!.reconnectState, 'retrying');
      assert.ok(!(await saved())!.reconnectError?.includes('fixture-sensitive'));
      failProfile = false;
      await ConnectionModel.updateOne({ _id: 'dhan' }, { reconnectAt: new Date(Date.now() - 1000).toISOString() });
      await reconnectSavedDhan(startedAt);
      assert.deepEqual(calls, ['/profile', '/profile']); assert.equal((await saved())!.autoRenew, false);
      await disconnectDhan(); await reconnectSavedDhan(Date.now() + 1);
      assert.equal(calls.length, 2); assert.equal((await saved())!.encryptedToken, undefined);
    });
    await t.test('provider rejection stops startup retries even when the saved expiry is in the future', async () => {
      await seed(); rejectProfile = true; const startedAt = Date.now();
      await reconnectSavedDhan(startedAt); await reconnectSavedDhan(startedAt); await renewDhanConnectionIfDue();
      assert.deepEqual(calls, ['/profile']);
      assert.equal((await saved())!.status, 'expired');
      assert.equal((await saved())!.reconnectState, 'login_required');
      assert.equal((await saved())!.reconnectAt, undefined);
    });
    await t.test('renews once, encrypts the replacement, schedules from verified expiry and skips early repetition', async () => {
      await seed(); await renewDhanConnectionIfDue(); await renewDhanConnectionIfDue();
      const row = (await saved())!;
      assert.deepEqual(calls, ['/RenewToken', '/profile']);
      assert.equal(decrypt(row.encryptedToken!), newToken); assert.equal(row.renewalState, 'scheduled');
      assert.equal(Date.parse(row.expiresAt!) - Date.parse(row.nextRenewalAt!), 30 * 60_000);
      assert.ok(row.lastRenewedAt); assert.equal(row.renewalError, undefined);
    });
    await t.test('persists the rotated token across a profile outage and verifies it without rotating again', async () => {
      await seed(); failProfile = true; await renewDhanConnectionIfDue();
      let row = (await saved())!;
      assert.equal(decrypt(row.encryptedToken!), newToken); assert.equal(row.renewalState, 'verifying');
      assert.equal(row.renewalError?.includes('fixture-sensitive'), false);
      failProfile = false;
      await ConnectionModel.updateOne({ _id: 'dhan' }, { nextRenewalAt: new Date(Date.now() - 1000).toISOString() });
      await renewDhanConnectionIfDue(); row = (await saved())!;
      assert.equal(row.renewalState, 'scheduled'); assert.deepEqual(calls, ['/RenewToken', '/profile', '/profile']);
    });
    await t.test('missed expiry stops without making a renewal request; OAuth and unknown tokens are excluded', async () => {
      await seed({ expiresAt: new Date(Date.now() - 1000).toISOString() }); await renewDhanConnectionIfDue();
      assert.equal((await saved())!.renewalState, 'login_required'); assert.equal((await saved())!.status, 'expired'); assert.equal(calls.length, 0);
      await assert.rejects(setDhanAutoRenew(true, true), /Expired tokens cannot/);
      for (const tokenSource of ['oauth', 'unknown'] as const) {
        await seed({ tokenSource }); await renewDhanConnectionIfDue(); assert.equal(calls.length, 0);
      }
    });
    await t.test('authentication rejection stops retries while a temporary limit retains the usable token', async () => {
      await seed(); failRenew = 401; await renewDhanConnectionIfDue(); await renewDhanConnectionIfDue();
      assert.equal((await saved())!.renewalState, 'login_required'); assert.equal(calls.length, 1);
      await seed(); failRenew = 429; await renewDhanConnectionIfDue();
      const row = (await saved())!;
      assert.equal(row.renewalState, 'retrying'); assert.equal(decrypt(row.encryptedToken!), oldToken);
      assert.ok(Date.parse(row.nextRenewalAt!) > Date.now()); assert.equal(row.status, 'connected');
    });
    await t.test('blocks invalid enrollment; disabling/disconnecting prevents later renewal', async () => {
      await seed({ tokenSource: 'oauth', autoRenew: false });
      await assert.rejects(setDhanAutoRenew(true, true), /browser-login tokens cannot/);
      await seed({ tokenSource: 'unknown', autoRenew: false });
      await assert.rejects(setDhanAutoRenew(true), /Confirm that/);
      await assert.rejects(connectDhanCredential('12345678-1234-1234-1234-123456789012', true), /redirect URL or login code/);
      await setDhanAutoRenew(true, true); assert.equal((await saved())!.tokenSource, 'web');
      await setDhanAutoRenew(false); await renewDhanConnectionIfDue(); assert.equal(calls.length, 0);
      await setDhanAutoRenew(true); await disconnectDhan(); await renewDhanConnectionIfDue();
      assert.equal((await saved())!.encryptedToken, undefined); assert.equal((await saved())!.autoRenew, false); assert.equal(calls.length, 0);
    });
    await t.test('a second monitor and manual disconnect cannot race a token rotation', async () => {
      await seed();
      duringRenew = async () => {
        await assert.rejects(renewDhanConnectionIfDue(), /updating its connection/);
        await assert.rejects(disconnectDhan(), /updating its connection/);
      };
      await renewDhanConnectionIfDue(); assert.deepEqual(calls, ['/RenewToken', '/profile']);
      assert.equal((await saved())!.renewalState, 'scheduled');
    });
    await t.test('a newer disconnected document cannot be overwritten by an in-flight response', async () => {
      await seed();
      duringRenew = async () => { await ConnectionModel.updateOne({ _id: 'dhan' }, { $set: { status: 'disconnected', autoRenew: false }, $unset: { encryptedToken: 1 } }); };
      await renewDhanConnectionIfDue(); assert.equal((await saved())!.status, 'disconnected');
      assert.equal((await saved())!.encryptedToken, undefined); assert.deepEqual(calls, ['/RenewToken']);
    });
    await t.test('new manual browser-login connection clears old automatic-renewal settings', async () => {
      await seed(); await connectDhanCredential(oldToken);
      const row = (await saved())!;
      assert.equal(row.autoRenew, false); assert.equal(row.tokenSource, 'unknown'); assert.equal(row.nextRenewalAt, undefined);
      assert.deepEqual(calls, ['/profile']);
    });
  } finally {
    axios.defaults.adapter = originalAdapter; env.SECRET_ENCRYPTION_KEY = originalKey;
    if (originalClient === undefined) delete process.env.DHAN_CLIENT_ID; else process.env.DHAN_CLIENT_ID = originalClient;
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect(); await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit();
  }
});
