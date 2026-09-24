import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Queue } from 'bullmq';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/shared/database.js';
import { jobs, redis } from '../src/shared/redis.js';
import { instruments, sourceRuns } from '../src/modules/market-data/repository.js';
import { publishInstrumentSnapshot, validateInstrumentSnapshot } from '../src/modules/market-data/services/instrument-snapshot.service.js';
import { universeCycle, UNIVERSE_SCHEDULER_ID } from '../src/modules/market-data/services/universe-calendar.js';
import { registerUniverseSchedule } from '../src/modules/market-data/services/universe-refresh.service.js';
import { monthlyRequiredFields } from '../src/modules/qualification/services/readiness.service.js';
import type { Instrument } from '../src/modules/market-data/types.js';

after(async () => { await jobs.close(); if (redis.status !== 'end') await redis.quit(); });

test('monthly refresh cycle changes at 02:00 IST, including the year boundary', () => {
  assert.deepEqual(universeCycle(new Date('2026-09-30T20:29:59Z')), { month: '2026-09', dueAt: '2026-08-31T20:30:00.000Z' });
  assert.deepEqual(universeCycle(new Date('2026-09-30T20:30:00Z')), { month: '2026-10', dueAt: '2026-09-30T20:30:00.000Z' });
  assert.equal(universeCycle(new Date('2026-12-31T20:29:59Z')).month, '2026-12');
  assert.equal(universeCycle(new Date('2026-12-31T20:30:00Z')).month, '2027-01');
});
test('readiness includes both indicator operands, deduplicates them, and separates facts', () => {
  assert.deepEqual(monthlyRequiredFields({ groups: [{ conditions: [
    { field: 'ema5', operand: 'field', compareField: 'ema21' },
    { field: 'delivery', operand: 'value', compareField: 'ema5' }, { field: 'ema5', operand: 'value' },
  ] }] }), [{ field: 'ema5', kind: 'history' }, { field: 'ema21', kind: 'history' }, { field: 'delivery', kind: 'fact' }]);
});

const row = (i: number, exchange: 'NSE' | 'BSE'): Instrument => ({
  _id: `${exchange}:${i}`, exchange, securityId: String(i), isin: `INE${String(i).padStart(9, '0')}`,
  symbol: `FIXTURE${i}`, name: `Fixture company ${i}`, series: 'EQ', lotSize: 1, primary: true,
  active: true, observedAt: '2026-09-01T00:00:00.000Z',
});
const snapshot = [...Array.from({ length: 600 }, (_, i) => row(i, 'NSE')), ...Array.from({ length: 1000 }, (_, i) => row(i + 1000, 'BSE'))];
test('incomplete stock masters and changed company identities are rejected', () => {
  assert.throws(() => validateInstrumentSnapshot(snapshot.filter(x => x.exchange === 'NSE'), []), /incomplete/);
  assert.throws(() => validateInstrumentSnapshot([...snapshot, snapshot[0]], []), /Duplicate/);
  assert.throws(() => validateInstrumentSnapshot(snapshot, [{ ...snapshot[0], isin: 'INECHANGED00' }]), /identity/);
  assert.throws(() => validateInstrumentSnapshot(snapshot, [...snapshot, ...Array.from({ length: 1000 }, (_, i) => row(i + 3000, 'NSE'))]), /incomplete/);
});

test('universe import is atomic and repeatable; scheduler persists once and catches up once', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`;
  const uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`; env.MONGODB_URI = uri.toString();
  const queue = new Queue(name, { connection: redis });
  try {
    await connectDatabase();
    const first = await publishInstrumentSnapshot(snapshot);
    assert.equal(first.addedCompanies, 1600);
    await instruments.updateOne({ _id: 'NSE:1' }, { $set: { motilalCode: 123 } });
    const next = [...snapshot.filter(x => x._id !== 'NSE:0'), row(3000, 'NSE')].map(x => ({ ...x, observedAt: '2026-10-01T00:00:00.000Z' }));
    const second = await publishInstrumentSnapshot(next);
    assert.equal(second.addedListings, 1); assert.equal(second.deactivatedListings, 1);
    assert.equal((await instruments.findById('NSE:0'))?.active, false);
    assert.equal((await instruments.findById('NSE:1'))?.motilalCode, 123);
    assert.equal((await publishInstrumentSnapshot(next)).addedListings, 0);
    assert.equal(await instruments.countDocuments(), 1601);
    const broken = next.map(x => ({ ...x, observedAt: '2026-11-01T00:00:00.000Z' }));
    broken[broken.length - 1].lotSize = 'invalid' as unknown as number;
    await assert.rejects(publishInstrumentSnapshot(broken));
    assert.equal((await instruments.findById('NSE:1'))?.observedAt, '2026-10-01T00:00:00.000Z');
    await registerUniverseSchedule(queue); await registerUniverseSchedule(queue);
    assert.equal(await queue.getJobSchedulersCount(), 1);
    const schedule = await queue.getJobScheduler(UNIVERSE_SCHEDULER_ID);
    assert.equal(schedule?.pattern, '0 0 2 1 * *'); assert.equal(schedule?.tz, 'Asia/Kolkata');
    assert.equal((await queue.getJobs(['waiting'])).length, 1);
    const waiting = (await queue.getJobs(['waiting']))[0]; await waiting.remove();
    await sourceRuns.create({ _id: randomUUID(), source: 'instruments', status: 'completed', startedAt: new Date().toISOString(), failures: [] });
    await registerUniverseSchedule(queue);
    assert.equal((await queue.getJobs(['waiting'])).length, 0);
  } finally {
    await queue.obliterate({ force: true }); await queue.close();
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  }
});
