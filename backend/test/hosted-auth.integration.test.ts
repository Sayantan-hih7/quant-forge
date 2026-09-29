import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/modules/workspace/password.js';
import { redis, jobs } from '../src/shared/redis.js';
after(async () => { if (process.env.RUN_DB_TESTS !== '1') { await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit(); } });

test('hosted login enforces credentials, secure cookies, CSRF, revocation and shared throttling', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const before = { ...env }, email = `fixture-${randomUUID()}@example.test`, password = 'Fixture password only 12345';
  env.NODE_ENV = 'production'; env.OWNER_EMAIL = email; env.OWNER_PASSWORD_HASH = await hashPassword(password); env.FRONTEND_ORIGIN = 'https://fixture.example';
  const rateKey = `quantforge:login:attempts:owner:${createHash('sha256').update(email + env.OWNER_PASSWORD_HASH).digest('hex')}`;
  const { app } = await import('../src/app.js');
  const server = app.listen(0, '127.0.0.1'), tokens: string[] = [];
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, body?: unknown, cookie?: string, origin = env.FRONTEND_ORIGIN) => fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    assert.equal((await (await request('/api/session')).json()).mode, 'owner');
    assert.equal((await request('/api/session', {})).status, 401);
    assert.equal((await request('/api/session/login', { email, password }, undefined, 'https://evil.example')).status, 403);
    assert.equal((await request('/api/session/login', { email, password: 'wrong' })).status, 401);
    const response = await request('/api/session/login', { email, password });
    assert.equal(response.status, 200);
    const header = response.headers.get('set-cookie')!;
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api']) assert.ok(header.includes(attribute));
    const cookie = header.split(';')[0]; tokens.push(cookie.split('=')[1]);
    assert.equal((await (await request('/api/session', undefined, cookie)).json()).authenticated, true);
    assert.equal((await request('/api/nonexistent', {}, cookie)).status, 404);
    assert.equal((await request('/api/nonexistent', {}, cookie, 'https://evil.example')).status, 403);
    assert.equal((await request('/api/session/logout', {}, cookie)).status, 204);
    assert.equal((await request('/api/nonexistent', {}, cookie)).status, 401);
    for (let i = 0; i < 20; i++) assert.equal((await request('/api/session/login', { email, password: 'wrong' })).status, 401);
    const throttled = await request('/api/session/login', { email, password });
    assert.equal(throttled.status, 429); assert.ok(Number(throttled.headers.get('retry-after')) > 0);
    await redis.del(rateKey);
    const again = await request('/api/session/login', { email, password });
    const rotated = again.headers.get('set-cookie')!.split(';')[0]; tokens.push(rotated.split('=')[1]);
    env.OWNER_PASSWORD_HASH = await hashPassword('Changed fixture password 12345');
    assert.equal((await request('/api/nonexistent', {}, rotated)).status, 401);
  } finally {
    Object.assign(env, before); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await redis.del(rateKey, ...tokens.map(token => `quantforge:session:${token}`));
    await jobs.waitUntilReady(); await jobs.close(); await redis.quit();
  }
});
