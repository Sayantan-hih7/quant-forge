import { randomUUID } from 'node:crypto';
import { jobs, announce } from '../../../shared/redis.js';
import { invariant, AppError } from '../../../shared/errors.js';
import { StrategyModel } from '../../strategies/models/strategy.model.js';
import { qualifiedBacktestUniverse } from './universe.service.js';
import { engineClient, engineInstruments } from '../../engine/services/engine.service.js';
import { BacktestRunModel } from '../models/backtest.model.js';
import { backtestSchema } from '../validations/backtest.validation.js';
import { prepareBacktest } from './preparation.service.js';
export async function queueBacktest(raw: unknown) {
  const input = backtestSchema.parse(raw);
  const strategy = await StrategyModel.findById(input.strategyId).lean(); invariant(strategy, 'Save a strategy first');
  invariant(strategy.entry.cadence === 'daily' || Date.parse(input.to) - Date.parse(input.from) <= 90 * 86400000, 'Intraday backtests support at most 90 days per run. Daily strategies support up to five years.');
  const from = `${input.from}T00:00:00+05:30`, to = new Date(Date.parse(`${input.to}T00:00:00+05:30`)+86400000).toISOString();
  invariant(input.expectedRevision === undefined || strategy.revision === input.expectedRevision, 'The strategy changed. Reload its saved rules before backtesting.');
  const { snapshots, qualified } = await qualifiedBacktestUniverse(input);
  invariant(!input.ids || input.ids.every(id=>qualified.includes(id)),'Selected stocks must belong to the requested qualified universe');
  const ids=input.ids?[...new Set(input.ids)]:qualified;
  invariant(ids.length > 0 && ids.length <= 100, 'A recorded qualified universe of 1–100 stocks is required. Historical lists are only available from the time they were published');
  const id = randomUUID();
  await BacktestRunModel.create({ _id: id, strategy, config: { from, to, universe: input.universe, includeManual: input.includeManual, ids }, snapshots, status: 'queued', createdAt: new Date().toISOString() });
  try { await jobs.add('backtest', { id }, { jobId: id }); }
  catch { await BacktestRunModel.updateOne({ _id:id }, { $set:{status:'failed',message:'Queue unavailable. Retry the backtest.'} }); throw new AppError(503,'QUEUE_UNAVAILABLE','Backtest could not be queued'); }
  return { id };
}
export async function runBacktest(id: string) {
  const run = await BacktestRunModel.findOneAndUpdate({ _id:id, status:{$in:['queued','running']} }, {$set:{status:'running'}}, {returnDocument:'after'}).lean();
  if (!run) return;
  try {
    const plan = await prepareBacktest(run);
    const instruments = await engineInstruments(run.config.ids, run.config.to, false, plan);
    const {data} = await engineClient.post('/backtest', { strategy:run.strategy, config:run.config, snapshots:run.snapshots, instruments }, { timeout: 600000 });
    await BacktestRunModel.updateOne({_id:id},{$set:{status:'completed',stage:'complete',result:data,finishedAt:new Date().toISOString()},$unset:{message:1}});
  } catch(e) {
    await BacktestRunModel.updateOne({_id:id},{$set:{status:'failed',message:e instanceof AppError?e.message:'Backtest failed without a report',finishedAt:new Date().toISOString()}});
    throw e;
  } finally { await announce('backtest.changed',{id}); }
}
