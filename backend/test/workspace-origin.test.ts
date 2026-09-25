import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { env } from '../src/config/env.js';
import { isAllowedFrontendOrigin } from '../src/config/frontend-origin.js';

test('development accepts only same-port and same-protocol loopback aliases', () => {
  const local = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'];
  for (const configured of local) for (const origin of local) assert.equal(isAllowedFrontendOrigin(origin, configured, 'development'), true);
  for (const origin of [undefined, '', 'null', 'http://localhost:5174', 'https://localhost:5173', 'http://localhost.evil.test:5173',
    'http://evil.test:5173', 'http://192.168.1.2:5173', 'http://localhost:5173/path', 'http://localhost:5173/',
    'http://localhost:5173?x=y', 'http://localhost:5173#hash', 'http://user@localhost:5173', 'file://localhost', 'not a url']) {
    assert.equal(isAllowedFrontendOrigin(origin, local[0], 'development'), false, String(origin));
  }
});

test('production and nonlocal configurations retain an exact origin allowlist', () => {
  assert.equal(isAllowedFrontendOrigin('http://localhost:5173', 'http://localhost:5173', 'production'), true);
  assert.equal(isAllowedFrontendOrigin('http://127.0.0.1:5173', 'http://localhost:5173', 'production'), false);
  assert.equal(isAllowedFrontendOrigin('https://app.example', 'https://app.example', 'production'), true);
  assert.equal(isAllowedFrontendOrigin('http://localhost:5173', 'https://app.example', 'development'), false);
  assert.equal(isAllowedFrontendOrigin('https://other.example', 'https://app.example', 'development'), false);
});

test('local sessions and protected writes work on both Vite addresses; foreign origins stay blocked', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const { app } = await import('../src/app.js');
  const { redis, jobs } = await import('../src/shared/redis.js');
  const original = { mode: env.NODE_ENV, origin: env.FRONTEND_ORIGIN };
  env.NODE_ENV = 'development'; env.FRONTEND_ORIGIN = 'http://localhost:5173';
  const server = app.listen(0, '127.0.0.1');
  const sessions: string[] = [];
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
      const started = await fetch(`${base}/api/session`, { method: 'POST', headers: { Origin: origin } });
      assert.equal(started.status, 200); assert.equal(started.headers.get('access-control-allow-origin'), origin);
      const cookie = started.headers.get('set-cookie')!.split(';')[0];
      sessions.push(cookie.split('=')[1]);
      const allowed = await fetch(`${base}/api/workspace-origin-test`, { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
      // A missing route means session and CSRF checks passed; no business data is mutated.
      assert.equal(allowed.status, 404); assert.equal((await allowed.json()).code, 'NOT_FOUND');
      const rejected = await fetch(`${base}/api/workspace-origin-test`, { method: 'POST', headers: { Origin: 'http://evil.test:5173', Cookie: cookie } });
      assert.equal(rejected.status, 403); assert.equal((await rejected.json()).code, 'ORIGIN_FORBIDDEN');
      assert.equal(rejected.headers.get('access-control-allow-origin'), null);
    }
    for (const origin of ['http://localhost:9999', 'https://evil.test']) {
      const rejected = await fetch(`${base}/api/session`, { method: 'POST', headers: { Origin: origin } });
      assert.equal(rejected.status, 403); assert.equal((await rejected.json()).code, 'SESSION_FORBIDDEN');
    }
    env.NODE_ENV = 'production';
    const production = await fetch(`${base}/api/session`, { method: 'POST', headers: { Origin: 'http://localhost:5173' } });
    assert.equal(production.status, 403);
  } finally {
    env.NODE_ENV = original.mode; env.FRONTEND_ORIGIN = original.origin;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (sessions.length) await redis.del(...sessions.map(token => `quantforge:session:${token}`));
    await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit();
  }
});
