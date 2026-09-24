import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError, invariant } from '../../../shared/errors.js';
import { announce, jobs, redis } from '../../../shared/redis.js';
import { instruments } from '../../market-data/repository.js';
import { evaluateBatch } from '../../engine/services/engine.service.js';
import { validateSourcedRule } from '../../market-data/services/capabilities.service.js';
import { MonthlyRuleModel, MonthlyUniverseModel, QualificationResultModel, QualificationRunModel } from '../models/qualification.model.js';
import { currentMonth, recordUniverseSnapshot } from './universe.service.js';
import { qualificationReadiness } from './readiness.service.js';
import { prepareQualification } from './preparation.service.js';
export { currentMonth } from './universe.service.js';
function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !['id', 'name', 'description'].includes(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, normalized(v)]));
  return value;
}
export const ruleFingerprint = (rule: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(normalized(rule))).digest('hex');
export async function qualificationState() {
  const month = currentMonth();
  const [rule, universe, runs] = await Promise.all([MonthlyRuleModel.findById('monthly').lean(), MonthlyUniverseModel.findById(month).lean(), QualificationRunModel.find({ month }).sort({ cutoff: -1 }).limit(10).select('-ids').lean()]);
  const cooldown = await redis.pttl('quantforge:dhan:cooldown');
  return { month, rule, universe, runs, providerRetryAt: cooldown > 0 ? new Date(Date.now() + cooldown).toISOString() : null, readiness: await qualificationReadiness(rule?.rule), canRun: !!rule && (rule.fingerprint !== universe?.fingerprint || !!runs[0]?.unavailable) && !runs.some(x => ['queued', 'running'].includes(x.status)) };
}
export async function saveMonthlyRule(rule: Record<string, unknown>, expectedRevision: number) {
  invariant(rule.timeframe === '1mo', 'Qualification requires monthly rules');
  await validateSourcedRule(rule);
  const previous = await MonthlyRuleModel.findById('monthly').lean();
  invariant((previous?.revision ?? 0) === expectedRevision, 'The rule changed in another tab; reload before saving');
  const fingerprint = ruleFingerprint(rule);
  if (previous?.fingerprint === fingerprint) return previous;
  const update = { rule, fingerprint, revision: expectedRevision + 1, savedAt: new Date().toISOString() };
  if (!previous) return MonthlyRuleModel.create({ _id: 'monthly', ...update });
  const saved = await MonthlyRuleModel.findOneAndUpdate({ _id: 'monthly', revision: expectedRevision }, { $set: update }, { returnDocument: 'after' });
  invariant(saved, 'The rule changed in another tab; reload before saving');
  return saved;
}
export async function startQualification() {
  const state = await qualificationState();
  invariant(state.canRun && state.rule, 'Save changed monthly rules before running a scan');
  const stocks = await instruments.find({ active: true, primary: true }).select('_id').lean();
  invariant(stocks.length, 'Import the stock universe first');
  const id = randomUUID();
  try { await QualificationRunModel.create({ _id: id, month: state.month, rule: state.rule.rule, revision: state.rule.revision,
    fingerprint: state.rule.fingerprint, cutoff: new Date().toISOString(), status: 'queued', ids: stocks.map(x => x._id),
    total: stocks.length, processed: 0, qualified: 0, rejected: 0, unavailable: 0, stage: 'checking' }); }
  catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) throw new AppError(409, 'SCAN_ACTIVE', 'A monthly scan is already queued or running');
    throw error;
  }
  try { await jobs.add('qualification', { runId: id }, { jobId: id }); }
  catch { await QualificationRunModel.updateOne({ _id: id }, { $set: { status: 'failed', message: 'Could not queue scan' } }); throw new AppError(503, 'QUEUE_UNAVAILABLE', 'The scan could not be queued'); }
  return { id };
}
export async function runQualification(id: string) {
  let run = await QualificationRunModel.findOneAndUpdate({ _id: id, status: { $in: ['queued', 'running'] } }, { $set: { status: 'running' } }, { returnDocument: 'after' }).lean();
  if (!run) return;
  try {
    if (run.stage !== 'evaluating') {
      await prepareQualification(run);
      run = await QualificationRunModel.findById(id).lean();
      if (!run || run.status !== 'running') return;
    }
    for (let offset = run.processed; offset < run.ids.length; offset += 20) {
      const current = await QualificationRunModel.findById(id).select('status').lean();
      if (current?.status === 'cancelled') return;
      const results = await evaluateBatch(run.rule, run.ids.slice(offset, offset + 20), run.cutoff);
      await QualificationResultModel.bulkWrite(results.map(result => ({ updateOne: { filter: { _id: `${id}:${result.id}` },
        update: { $set: { runId: id, instrumentId: result.id, matched: result.matched, status: result.status, checks: result.checks } }, upsert: true } })));
      const counts = await QualificationResultModel.aggregate<{ _id: string; count: number }>([{ $match: { runId: id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
      const count = (status: string) => counts.find(x => x._id === status)?.count ?? 0;
      await QualificationRunModel.updateOne({ _id: id, status: 'running' }, { $set: { processed: Math.min(offset + 20, run.ids.length), qualified: count('qualified'), rejected: count('rejected'), unavailable: count('unavailable') } });
      await announce('qualification.progress', { id });
    }
    await QualificationRunModel.updateOne({ _id: id, status: 'running' }, { $set: { status: 'completed', finishedAt: new Date().toISOString() } });
  } catch (e) {
    if (e instanceof AppError && e.code === 'SCAN_CANCELLED') return;
    await QualificationRunModel.updateOne({ _id: id, status: 'running' }, { $set: { status: 'failed', message: e instanceof AppError ? e.message : 'Qualification failed' } }); throw e;
  } finally { await announce('qualification.changed', { id }); }
}
export async function publishQualification(id: string, acknowledgeMissingData: boolean) {
  const saved = await mongoose.connection.transaction(async session => {
  const run = await QualificationRunModel.findById(id).session(session).lean();
  invariant(run?.status === 'completed' && run.month === currentMonth(), 'Only a completed current-month scan can be published');
  invariant(!run.unavailable || acknowledgeMissingData, 'Review unavailable stocks before publishing a partial-coverage scan');
  const rule = await MonthlyRuleModel.findById('monthly').session(session).lean();
  invariant(rule?.fingerprint === run.fingerprint, 'Saved rules changed after this scan; run the saved rules before publishing');
  const results = await QualificationResultModel.find({ runId: id, matched: true }).session(session).lean();
  const stocks = await instruments.find({ _id: { $in: results.map(x => x.instrumentId!) } }).session(session).lean();
  const previous = await MonthlyUniverseModel.findById(run.month).session(session).lean();
  if (previous?.runId === id) return previous;
  const at = new Date().toISOString(), isins = new Set(stocks.map(x => x.isin));
  const members = [...stocks.map(x => ({ instrumentId: x._id, isin: x.isin, source: 'scan' as const, addedAt: at })),
    ...(previous?.members ?? []).filter(x => x.source === 'manual' && !isins.has(x.isin))];
  // Compare-and-swap prevents a simultaneous manual addition from being overwritten by publication.
  const saved = await MonthlyUniverseModel.findOneAndUpdate({ _id: run.month, ...(previous ? { revision: previous.revision } : {}) },
    { $set: { month: run.month, runId: id, fingerprint: run.fingerprint, publishedAt: at, members }, $inc: { revision: 1 } }, { upsert: !previous, returnDocument: 'after', session }).lean();
  invariant(saved, 'The stock list changed while publishing; review and retry');
  await recordUniverseSnapshot(saved, session);
  return saved;
  });
  await announce('qualification.published'); return saved;
}

export async function qualificationResults(id: string, page: number, status?: 'qualified' | 'rejected' | 'unavailable') {
  invariant(await QualificationRunModel.exists({ _id: id }), 'Scan not found');
  const query = { runId: id, ...(status ? { status } : {}) };
  const [rows, total] = await Promise.all([
    QualificationResultModel.find(query).sort({ instrumentId: 1 }).skip((page - 1) * 50).limit(50).lean(),
    QualificationResultModel.countDocuments(query),
  ]);
  const stocks = await instruments.find({ _id: { $in: rows.map(row => row.instrumentId).filter((id): id is string => typeof id === 'string') } }).select('symbol name exchange').lean();
  const byId = new Map(stocks.map(stock => [stock._id, stock]));
  return { rows: rows.map(row => ({ ...row, instrument: byId.get(row.instrumentId!) })), total };
}
export async function cancelQualification(id: string) {
  await QualificationRunModel.updateOne({ _id: id, status: { $in: ['queued', 'running'] } }, { $set: { status: 'cancelled', finishedAt: new Date().toISOString() } });
  await announce('qualification.changed');
}
