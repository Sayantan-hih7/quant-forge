import { AppError } from '../../../shared/errors.js';
import { announce } from '../../../shared/redis.js';
import { jobContext } from '../../../shared/job-context.js';
import { instruments, facts } from '../../market-data/repository.js';
import { syncDelivery, syncMemberships, syncPledge } from '../../market-data/imports.js';
import { ensureCompanyData, ensureMonthlyHistory } from '../../market-data/services/dhan-cache.service.js';
import { evaluateBatch } from '../../engine/services/engine.service.js';
import { QualificationRunModel, type QualificationRun } from '../models/qualification.model.js';
import { dhanCompanyFields, monthlyHistoryRequirements } from './history-requirements.js';
import { monthlyRequiredFields } from './readiness.service.js';

const preparationDependencies = { evaluate: evaluateBatch, company: ensureCompanyData, history: ensureMonthlyHistory };
export async function prepareQualification(run: QualificationRun, dependencies = preparationDependencies) {
  const required = monthlyRequiredFields(run.rule).map(x => x.field);
  const history = monthlyHistoryRequirements(run.rule, run.month);
  const stats = { processed: 0, total: run.total, downloaded: 0, cached: 0, failed: 0, ruledOut: 0, failures: [] as { instrumentId: string; message: string }[] };
  async function checkActive() {
    if (!(await QualificationRunModel.exists({ _id: run._id, status: 'running' }))) throw new AppError(409, 'SCAN_CANCELLED', 'Scan cancelled');
  }
  async function update(stage: QualificationRun['stage']) {
    await QualificationRunModel.updateOne({ _id: run._id, status: 'running' }, { $set: { stage, preparation: stats } });
    await announce('qualification.progress', { id: run._id });
  }
  await checkActive(); await update('checking');
  // Public exchange inputs are shared by the entire universe, not fetched once per stock.
  const now = new Date().toISOString(), previousMonth = new Date(Date.parse(`${run.month}-01`) - 86400000).toISOString().slice(0, 7);
  const valid = { knownAt: { $lte: now }, $or: [{ validUntil: { $gte: now } }, { validUntil: { $exists: false } }] };
  for (const exchange of ['NSE', 'BSE'] as const) {
    if (!required.some(x => ['delivery', 'tradedValue', 'turnover'].includes(x))) break;
    const exists = await facts.exists({ ...valid, field: 'delivery', period: previousMonth, instrumentId: { $regex: `^${exchange}:` } });
    if (!exists) await jobContext.run({ id: `${run._id}-${exchange}-delivery` }, () => syncDelivery(previousMonth, exchange));
  }
  if (required.includes('pledge') && !await facts.exists({ ...valid, field: 'pledge' })) await jobContext.run({ id: `${run._id}-pledge` }, syncPledge);
  if (required.includes('index') && !await facts.exists({ ...valid, field: 'index' })) await jobContext.run({ id: `${run._id}-indices` }, syncMemberships);

  async function possible(ids: string[]) {
    const remaining: string[] = [];
    for (let offset = 0; offset < ids.length; offset += 20) {
      await checkActive();
      const results = await dependencies.evaluate(run.rule, ids.slice(offset, offset + 20), new Date().toISOString());
      // Three-valued AND/OR evaluation: only a definitive rejection can skip downloads.
      remaining.push(...results.filter(x => x.status !== 'rejected').map(x => x.id));
      stats.processed = Math.min(offset + 20, ids.length);
      if (offset % 100 === 0) await update('checking');
    }
    return remaining;
  }
  let candidates = await possible(run.ids);
  const companyFields = required.filter(field => dhanCompanyFields.has(field));
  async function collect(stage: 'fundamentals' | 'history', ids: string[]) {
    const stocks = await instruments.find({ _id: { $in: ids }, active: true }).lean();
    stats.processed = 0; stats.total = stocks.length; stats.ruledOut = run.total - ids.length;
    await update(stage);
    let cursor = 0, stop: unknown;
    const work = async () => {
      while (!stop && cursor < stocks.length) {
        const stock = stocks[cursor++];
        try {
          await checkActive();
          const downloaded = stage === 'fundamentals' ? await dependencies.company(stock, companyFields, run.month) : await dependencies.history(stock, history.from, history.to);
          if (downloaded) stats.downloaded++; else stats.cached++;
        } catch (error) {
          if (error instanceof AppError && (error.status === 424 || error.status === 429 || ['SCAN_CANCELLED', 'DHAN_ENDPOINT_UNAVAILABLE'].includes(error.code))) { stop = error; return; }
          stats.failed++;
          if (stats.failures.length < 30) stats.failures.push({ instrumentId: stock._id, message: error instanceof AppError ? error.message : 'Data unavailable from provider' });
        }
        stats.processed++;
        await update(stage);
      }
    };
    await Promise.all([work(), work(), work()]);
    await update(stage);
    if (stop) throw stop;
  }
  if (companyFields.length) {
    await collect('fundamentals', candidates);
    stats.processed = 0; stats.total = candidates.length;
    candidates = await possible(candidates);
  }
  if (history.minimum) await collect('history', candidates);
  await checkActive();
  await QualificationRunModel.updateOne({ _id: run._id, status: 'running' }, { $set: { stage: 'evaluating', cutoff: new Date().toISOString(), preparation: stats } });
}
