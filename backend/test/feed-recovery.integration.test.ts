import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import type { FeedRequest } from '../src/modules/market-feed/services/feed.service.js';

test('saved subscriptions survive worker/Redis restarts and disconnect immediately invalidates quotes', {
  skip: process.env.RUN_FEED_TESTS !== '1', timeout: 120000,
}, async () => {
  // A separate, empty Redis instance is mandatory: never overwrite running feed keys.
  const testRedisUrl = process.env.TEST_REDIS_URL;
  assert.ok(testRedisUrl && testRedisUrl !== (process.env.REDIS_URL ?? 'redis://127.0.0.1:6381'));
  const probe = new Redis(testRedisUrl);
  assert.equal(await probe.dbsize(), 0, 'Use an empty Redis instance dedicated to this test');
  await probe.quit();
  process.env.REDIS_URL = testRedisUrl;
  const { env } = await import('../src/config/env.js');
  const databaseName = `quantforge_test_${randomUUID().replaceAll('-', '')}`;
  const mongoUrl = new URL(env.MONGODB_URI); mongoUrl.pathname = `/${databaseName}`;
  env.MONGODB_URI = mongoUrl.toString();
  const { connectDatabase, disconnectDatabase } = await import('../src/shared/database.js');
  const { redis, jobs } = await import('../src/shared/redis.js');
  const { FeedSettingsModel } = await import('../src/modules/market-feed/models/feed-settings.model.js');
  const { instruments } = await import('../src/modules/market-data/repository.js');
  const { ConnectionModel } = await import('../src/modules/connections/models/connection.model.js');
  const { PaperSessionModel } = await import('../src/modules/paper-trading/models/paper.model.js');
  const { MonthlyUniverseModel } = await import('../src/modules/qualification/models/qualification.model.js');
  const { feedStatus, disconnectFeed, FEED_KEYS } = await import('../src/modules/market-feed/services/feed.service.js');
  const request: FeedRequest = { id: randomUUID(), provider: 'auto', instruments: [{ id: 'TEST:NSE', symbol: 'TEST', exchange: 'NSE', securityId: '1' }] };
  let child: ChildProcess | undefined;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const until = async (check: () => Promise<boolean>) => {
    const deadline = Date.now() + 20000;
    while (!await check()) {
      if (Date.now() >= deadline) {
        const observed = await feedStatus();
        assert.fail(`Worker did not reach the expected state: ${JSON.stringify({ state: observed.state, enabled: observed.enabled, message: observed.message, worker: observed.workerRunning, childExit: child?.exitCode })}`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const start = () => {
    child = fork(new URL('../src/feed.js', import.meta.url), [], {
      execArgv: [], windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { ...process.env, NODE_ENV: 'test', MONGODB_URI: env.MONGODB_URI, REDIS_URL: testRedisUrl, DHAN_CLIENT_ID: 'fixture',
        // Force a closed day so the fixture never authenticates with a real broker.
        MARKET_HOLIDAYS: today },
    });
  };
  const stop = async () => {
    const active = child; child = undefined;
    if (!active || active.exitCode !== null || active.signalCode !== null) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { active.kill(); reject(new Error('Worker failed graceful shutdown')); }, 10000);
      active.once('exit', code => { clearTimeout(timeout); if (code === 0) resolve(); else reject(new Error('Worker exited unsuccessfully')); });
      active.send({ type: 'quantforge.shutdown' });
    });
  };
  try {
    await connectDatabase();
    await instruments.create({ _id: 'TEST:NSE', symbol: 'TEST', exchange: 'NSE', securityId: '1', isin: 'TEST', active: true });
    await ConnectionModel.create({ _id: 'dhan', status: 'connected', expiresAt: new Date(Date.now() + 3600000).toISOString() });
    await FeedSettingsModel.create({ _id: 'primary', enabled: true, request });
    start();
    await until(async () => (await feedStatus()).state === 'waiting');
    assert.equal((await feedStatus()).instruments?.[0].id, 'TEST:NSE');
    await stop();
    assert.equal(await redis.exists(FEED_KEYS.lease), 0);
    await redis.del(FEED_KEYS.desired, FEED_KEYS.status);
    start();
    await until(async () => (await feedStatus()).state === 'waiting');
    assert.equal(JSON.parse((await redis.get(FEED_KEYS.desired))!).id, request.id);
    await stop();

    // Even before a worker can acknowledge disconnect or a changed request,
    // the API must reject quotes belonging to the previous subscription.
    const session = randomUUID(), at = new Date().toISOString();
    await redis.set(FEED_KEYS.lease, 'fixture', 'EX', 20);
    await redis.set(FEED_KEYS.status, JSON.stringify({ state: 'live', session, requestId: request.id, updatedAt: at, instruments: request.instruments }));
    await redis.set('quantforge:quote:TEST:NSE', JSON.stringify({ instrumentId: 'TEST:NSE', session, at, receivedAt: at, price: 100, source: 'dhan' }));
    assert.equal((await feedStatus()).quotes[0].fresh, true);
    await redis.set(FEED_KEYS.status, JSON.stringify({ state: 'live', provider: 'mixed', requestId: request.id, updatedAt: at,
      connections: { motilal: { state: 'live', session: 'other', ids: ['NSE:other'] }, dhan: { state: 'live', session, ids: ['TEST:NSE'] } } }));
    assert.equal((await feedStatus()).quotes[0].fresh, true, 'Mixed feeds validate each instrument against its own provider session');
    await FeedSettingsModel.updateOne({ _id: 'primary' }, { $set: { 'request.id': 'replacement' } });
    assert.equal((await feedStatus()).quotes[0].fresh, false);
    await disconnectFeed();
    assert.equal((await feedStatus()).quotes[0].fresh, false);
    assert.equal((await feedStatus()).state, 'disconnected');
    assert.equal((await feedStatus()).connections?.dhan?.state, 'live', 'Research streaming may continue but cannot authorize paper fills after an execution pause');
    await redis.del(FEED_KEYS.lease);
    start();
    await until(async () => JSON.parse((await redis.get(FEED_KEYS.status)) ?? '{}').state === 'disconnected' && !!await redis.exists(FEED_KEYS.lease));
    assert.equal((await feedStatus()).enabled, false);
    assert.equal(await redis.get(FEED_KEYS.desired), null);
    await stop();

    // Restoring an active paper session derives demand without any connect request.
    await FeedSettingsModel.deleteMany({});
    await PaperSessionModel.create({ _id: 'paper-fixture', strategyId: 'fixture', active: true, ids: ['TEST:NSE'] });
    await MonthlyUniverseModel.create({ _id: today.slice(0, 7), members: [{ instrumentId: 'TEST:NSE', source: 'scan' }] });
    start();
    await until(async () => (await feedStatus()).state === 'waiting');
    const restored = JSON.parse((await redis.get(FEED_KEYS.desired))!) as FeedRequest;
    assert.deepEqual(restored.instruments.map(s => s.id), ['TEST:NSE']);
    await stop();
    await redis.del(FEED_KEYS.desired, FEED_KEYS.status);
    start();
    await until(async () => (await feedStatus()).state === 'waiting');
    assert.equal(JSON.parse((await redis.get(FEED_KEYS.desired))!).id, restored.id);
    await disconnectFeed();
    await until(async () => JSON.parse((await redis.get(FEED_KEYS.status)) ?? '{}').state === 'disconnected');
    assert.equal((await feedStatus()).enabled, false, 'An explicit pause wins even with active paper demand');
    await stop();
  } finally {
    await stop();
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && /^quantforge_test_[a-f0-9]{32}$/.test(databaseName)) await mongoose.connection.dropDatabase();
    await disconnectDatabase(); await jobs.waitUntilReady(); await jobs.close(); await redis.quit();
  }
});
