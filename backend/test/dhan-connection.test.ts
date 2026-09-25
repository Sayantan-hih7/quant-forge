import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import mongoose from 'mongoose';
import { randomBytes, randomUUID } from 'node:crypto';
import { env } from '../src/config/env.js';
import { parseDhanCredential, parseDhanExpiry } from '../src/modules/connections/utils/dhan-credentials.js';
import { dhanProviderError } from '../src/modules/connections/providers/dhan.client.js';

const code = '12345678-1234-1234-1234-123456789012';
test('Dhan paste flow distinguishes login codes, redirects and final JWT access tokens', () => {
  assert.deepEqual(parseDhanCredential(`  ${code}\n`), { kind: 'consent', value: code });
  assert.deepEqual(parseDhanCredential(`http://localhost:9999/old-app?tokenId=${code}`), { kind: 'consent', value: code });
  assert.deepEqual(parseDhanCredential('eyJmaXh0dXJl.test-only.signature'), { kind: 'access', value: 'eyJmaXh0dXJl.test-only.signature' });
  assert.throws(() => parseDhanCredential('invalid-value'), /full Dhan access token/);
  assert.throws(() => parseDhanCredential(`https://example.test/?tokenId=${code}&tokenId=${code}`));
  assert.throws(() => parseDhanCredential(`https://example.test/?consentAppId=${code}`));
  assert.throws(() => parseDhanCredential(`https://example.test/?tokenId=invalid`));
});
test('Dhan expiry supports documented Indian dates and ISO timestamps without date or timezone ambiguity', () => {
  assert.equal(new Date(parseDhanExpiry('23/09/2026 16:30')!).toISOString(), '2026-09-23T11:00:00.000Z');
  assert.equal(new Date(parseDhanExpiry('03/04/2026 09:15')!).toISOString(), '2026-04-03T03:45:00.000Z');
  assert.equal(new Date(parseDhanExpiry('2026-09-23T16:30:12.123')!).toISOString(), '2026-09-23T11:00:12.123Z');
  assert.equal(parseDhanExpiry('2026-09-23T16:30:00+05:30'), parseDhanExpiry('2026-09-23T11:00:00Z'));
  assert.equal(parseDhanExpiry('2026-09-23 16:30:00.0'), parseDhanExpiry('2026-09-23T11:00:00Z'));
  for (const invalid of ['31/02/2026 16:30', '2026-02-30T10:00:00', '23/09/2026 25:00', '2026-09-23T10:00:00+18:99', '', undefined]) assert.equal(parseDhanExpiry(invalid), undefined);
});
test('Dhan provider failures explain login-code versus access-token errors without exposing credentials', () => {
  const error = new AxiosError('secret-fixture');
  error.response = { status: 401, statusText: 'Unauthorized', headers: {}, config: { headers: new AxiosHeaders({ 'access-token': 'secret-fixture' }) }, data: { token: 'secret-fixture' } };
  assert.equal(dhanProviderError(error, true).code, 'DHAN_CONSENT_REJECTED');
  const tokenError = dhanProviderError(error, false);
  assert.equal(tokenError.code, 'DHAN_TOKEN_REJECTED');
  assert.equal(JSON.stringify(tokenError).includes('secret-fixture'), false);
  error.response.status = 429;
  assert.equal(dhanProviderError(error, true).code, 'DHAN_RATE_LIMIT');
});

test('unavailable chart ranges are distinguished from temporary provider or authentication failures', () => {
  const config = { url: '/charts/historical', headers: new AxiosHeaders({ 'access-token': 'secret-fixture' }) };
  const error = new AxiosError('secret-fixture', 'ERR_BAD_REQUEST', config, undefined,
    { status: 400, statusText: 'Bad Request', headers: {}, config, data: { errorCode: 'DH-907', errorMessage: 'secret-fixture' } });
  const result = dhanProviderError(error, false);
  assert.equal(result.code, 'DHAN_HISTORY_UNAVAILABLE');
  assert.equal(result.message.includes('secret-fixture'), false);
  error.config!.url = '/data/companyinfo';
  assert.equal(dhanProviderError(error, false).code, 'DHAN_UNAVAILABLE');
});

test('Dhan exchanges a pasted redirect, encrypts the verified session and preserves it after a rejected replacement', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`;
  const uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  const originalAdapter = axios.defaults.adapter;
  const originalEncryption = env.SECRET_ENCRYPTION_KEY;
  env.SECRET_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const original = { client: process.env.DHAN_CLIENT_ID, key: process.env.DHAN_API_KEY, secret: process.env.DHAN_API_SECRET };
  process.env.DHAN_CLIENT_ID = 'fixture-account'; process.env.DHAN_API_KEY = 'fixture-key'; process.env.DHAN_API_SECRET = 'fixture-secret';
  const token = 'eyJmaXh0dXJl.valid.signature';
  const calls: string[] = [];
  axios.defaults.adapter = async config => {
    calls.push(config.url ?? '');
    const response = { status: 200, statusText: 'OK', headers: {}, config, data: {} as Record<string, unknown> };
    if (config.url === '/app/consumeApp-consent') {
      assert.equal(config.params.tokenId, code);
      response.data = { dhanClientId: 'fixture-account', accessToken: token, expiryTime: '2099-09-24T15:35:00' };
    } else if (config.url === '/profile') {
      if (config.headers.get('access-token') !== token) throw new AxiosError('rejected', 'ERR_BAD_REQUEST', config, undefined, { ...response, status: 401 });
      response.data = { dhanClientId: 'fixture-account', tokenValidity: '24/09/2099 15:35', dataPlan: 'Active' };
    } else throw new Error('Unexpected provider request');
    return response;
  };
  const { connectDhanCredential } = await import('../src/modules/connections/services/dhan.service.js');
  const { ConnectionModel } = await import('../src/modules/connections/models/connection.model.js');
  const { decrypt } = await import('../src/shared/secrets.js');
  const { jobs, redis } = await import('../src/shared/redis.js');
  try {
    await mongoose.connect(uri.toString());
    assert.equal(mongoose.connection.name, name);
    const result = await connectDhanCredential(`https://old-app.example/callback?tokenId=${code}`);
    assert.equal(result.connected, true); assert.equal(result.expiresAt, '2099-09-24T10:05:00.000Z');
    assert.deepEqual(calls, ['/app/consumeApp-consent', '/profile']);
    const saved = await ConnectionModel.findById('dhan').select('+encryptedToken').lean();
    assert.notEqual(saved?.encryptedToken, token); assert.equal(decrypt(saved!.encryptedToken!), token);
    const { dataStatus } = await import('../src/modules/market-data/services/market-data.service.js');
    const status = await dataStatus();
    assert.equal(status.dhan.hasSavedToken, true); assert.equal(status.dhan.connected, true);
    assert.equal(JSON.stringify(status).includes(saved!.encryptedToken!), false);
    await assert.rejects(connectDhanCredential('eyJmaXh0dXJl.invalid.signature'), /rejected the access token/);
    assert.equal((await ConnectionModel.findById('dhan').select('+encryptedToken').lean())?.encryptedToken, saved?.encryptedToken);
    assert.equal(JSON.stringify(result).includes(token), false);
  } finally {
    axios.defaults.adapter = originalAdapter;
    env.SECRET_ENCRYPTION_KEY = originalEncryption;
    for (const [key, value] of Object.entries({ DHAN_CLIENT_ID: original.client, DHAN_API_KEY: original.key, DHAN_API_SECRET: original.secret })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect(); await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit();
  }
});
