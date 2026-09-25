import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { jobs, redis } from '../src/shared/redis.js';
import { instruments } from '../src/modules/market-data/repository.js';
import { QualificationRunModel } from '../src/modules/qualification/models/qualification.model.js';
import { monthlyHistoryRequirements } from '../src/modules/qualification/services/history-requirements.js';
import { prepareQualification } from '../src/modules/qualification/services/preparation.service.js';
import type { EvaluationResult } from '../src/modules/engine/services/engine.service.js';

after(async () => { await jobs.waitUntilReady(); await jobs.close(); if (redis.status !== 'end') await redis.quit(); });
const rule = { timeframe: '1mo', logic: 'AND', groups: [{ logic: 'AND', conditions: [
  { field: 'marketCap', operator: 'gte', operand: 'value', value: 3000, timeframe: '1mo' },
  { field: 'ema5', operator: 'gte', operand: 'field', compareField: 'ema21', timeframe: '1mo' },
] }] };
test('monthly data plan includes both indicator periods, warm-up, crossover lookback and completed months only', () => {
  const plan = monthlyHistoryRequirements(rule, '2026-09');
  assert.equal(plan.minimum, 21); assert.equal(plan.months, 63);
  assert.equal(plan.from, '2021-06-01'); assert.equal(plan.to, '2026-09-01');
  assert.deepEqual(plan.fields, { ema5: 5, ema21: 21 });
  const crossed = structuredClone(rule); Object.assign(crossed.groups[0].conditions[1], { operator: 'crossAbove', lookback: 6 });
  assert.equal(monthlyHistoryRequirements(crossed, '2026-01').minimum, 27);
  assert.equal(monthlyHistoryRequirements({ groups: [{ conditions: [{ field: 'marketCap' }] }] }, '2026-09').months, 0);
});

test('preparation skips only decided rejects, caches data before fixing the scan cutoff, and honours cancellation', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`;
  const uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  try {
    await mongoose.connect(uri.toString()); assert.equal(mongoose.connection.name, name);
    const ids = ['NSE:1', 'NSE:2', 'NSE:3'];
    await instruments.insertMany(ids.map((id, i) => ({ _id: id, exchange: 'NSE', securityId: `${i+1}`, isin: `INE000A0000${i}`, symbol: `TEST${i}`, active: true, primary: true })));
    const run = await QualificationRunModel.create({ _id: randomUUID(), month: '2026-09', rule, revision: 1, fingerprint: 'fixture', cutoff: '2026-09-01T00:00:00Z', status: 'running', ids, total: 3, processed: 0, qualified: 0, rejected: 0, unavailable: 0, stage: 'checking' });
    const companyCalls: string[] = [], historyCalls: string[] = [];
    const evaluate = async (_rule: Record<string, unknown>, list: string[]): Promise<EvaluationResult[]> => list.map(id => {
      const rejected = id === 'NSE:1' || id === 'NSE:2' && companyCalls.includes(id);
      return { id, matched: rejected ? false : null, status: rejected ? 'rejected' : 'unavailable', checks: [] };
    });
    const started = new Date().toISOString();
    await prepareQualification(run.toObject(), { evaluate,
      ownership: async () => false,
      company: async stock => { companyCalls.push(stock._id); return true; },
      history: async (stock, from, to) => { assert.equal(from, '2021-06-01'); assert.equal(to, '2026-09-01'); historyCalls.push(stock._id); return true; },
    });
    assert.deepEqual(companyCalls.sort(), ['NSE:2', 'NSE:3']); assert.deepEqual(historyCalls, ['NSE:3']);
    const saved = await QualificationRunModel.findById(run._id).lean();
    assert.equal(saved?.stage, 'evaluating'); assert.ok(saved!.cutoff >= started); assert.equal(saved?.preparation?.ruledOut, 2);
    await QualificationRunModel.updateOne({ _id: run._id }, { $set: { status: 'cancelled' } });
    await assert.rejects(prepareQualification(run.toObject(), { evaluate, ownership: async () => false, company: async () => { throw new Error('Must not download after cancellation'); }, history: async () => false }), /cancelled/);
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
