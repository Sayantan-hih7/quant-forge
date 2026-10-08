import { engineClient } from '../../engine/services/engine.service.js';
import { reviewStrategy } from '../../strategies/services/rule-review.service.js';
import { backtestDataIssues } from './data-quality.js';
import { randomUUID, createHash } from 'node:crypto';
import { jobs, announce } from '../../../shared/redis.js';
import { invariant, AppError } from '../../../shared/errors.js';
import { StrategyModel } from '../../strategies/models/strategy.model.js';
import { qualifiedBacktestUniverse } from './universe.service.js';
import { portfolioBacktest } from './portfolio-stream.js';
import { BacktestRunModel } from '../models/backtest.model.js';
import { backtestSchema } from '../validations/backtest.validation.js';
import { prepareBacktest } from './preparation.service.js';
export async function queueBacktest(raw: unknown) {
  const input = backtestSchema.parse(raw);
  const requestFingerprint=createHash('sha256').update(JSON.stringify({...input,requestId:undefined})).digest('hex');
  if(input.requestId){const existing=await BacktestRunModel.findById(input.requestId).select('requestFingerprint status').lean();if(existing){invariant(existing.requestFingerprint===requestFingerprint,'This request ID was already used for a different backtest');if(existing.status==='queued')await jobs.add('backtest',{id:input.requestId},{jobId:input.requestId});return {id:input.requestId};}}
  const strategy = await StrategyModel.findById(input.strategyId).lean(); invariant(strategy, 'Save a strategy first'); invariant(!strategy.archivedAt,'Archived strategies retain reports but cannot start new backtests.');
  const review=reviewStrategy(strategy);invariant(!review.blocked,review.issues.filter(i=>i.severity==='error').map(i=>i.title+'. '+i.recommendation).join(' '));
  invariant(strategy.entry.cadence === 'daily' || Date.parse(input.to) - Date.parse(input.from) <= 90 * 86400000, 'Intraday backtests support at most 90 days per run. Daily strategies support up to five years.');
  const from = `${input.from}T00:00:00+05:30`, to = new Date(Date.parse(`${input.to}T00:00:00+05:30`)+86400000).toISOString();
  invariant(input.expectedRevision === undefined || strategy.revision === input.expectedRevision, 'The strategy changed. Reload its saved rules before backtesting.');
  const { snapshots, qualified } = await qualifiedBacktestUniverse(input);
  invariant(!input.ids || input.ids.every(id=>qualified.includes(id)),'Selected stocks must belong to the requested qualified universe');
  const ids=input.ids?[...new Set(input.ids)]:qualified;
  invariant(ids.length > 0 && ids.length <= 200, 'A recorded qualified universe of 1–200 stocks is required. Historical lists are only available from the time they were published');
  const id = input.requestId??randomUUID();
  try { await BacktestRunModel.create({ _id: id, requestFingerprint, strategy, config: { from, to, universe: input.universe, includeManual: input.includeManual, dataPolicy: input.dataPolicy, ids }, snapshots, status: 'queued', createdAt: new Date().toISOString() }); } catch(error) {
    if(input.requestId&&(error as {code?:number}).code===11000){const existing=await BacktestRunModel.findById(id).select('requestFingerprint status').lean();invariant(existing?.requestFingerprint===requestFingerprint,'This request ID was already used for a different backtest');if(existing.status==='queued')await jobs.add('backtest',{id},{jobId:id});return {id};}throw error;
  }
  try { await jobs.add('backtest', { id }, { jobId: id }); }
  catch { await BacktestRunModel.updateOne({ _id:id }, { $set:{status:'failed',message:'Queue unavailable. Retry the backtest.'} }); throw new AppError(503,'QUEUE_UNAVAILABLE','Backtest could not be queued'); }
  return { id };
}
export async function runBacktest(id: string) {
  const run = await BacktestRunModel.findOneAndUpdate({ _id:id, status:{$in:['queued','running']} }, {$set:{status:'running'}}, {returnDocument:'after'}).lean();
  if (!run) return;
  try {
    await BacktestRunModel.updateOne({_id:id},{$set:{message:'Checking calculation engine before preparing history'}});
    const {data:health}=await engineClient.get('/health',{timeout:10_000});
    invariant(health.backtestProgressVersion===1,'Restart the calculation engine to enable progress reporting, then retry. Stored history is retained.');
    if(health.backtestBusy)throw new AppError(503,'ENGINE_BUSY','Another portfolio calculation is already running. Retry after it finishes; no history preparation was started.');
    await engineClient.post('/validate-rule',run.strategy.entry,{timeout:10_000});
    const plan = await prepareBacktest(run);
    await BacktestRunModel.updateOne({_id:id},{$set:{calculationStartedAt:new Date().toISOString()}});
    let lastProgress=0;
    const data = await portfolioBacktest(run, plan, undefined, async progress=>{
      if(Date.now()-lastProgress<5000)return;
      lastProgress=Date.now();
      const message=progress.phase==='replaying'?`Replaying candles through ${progress.through?new Date(progress.through).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'the selected period'} IST`:
        progress.phase==='readiness'?`Checking data readiness: ${progress.processed??0} / ${progress.total??run.config.ids.length} stocks`:
        `Loading calculation history: ${progress.processed??0} / ${progress.total??run.config.ids.length} stocks`;
      await BacktestRunModel.updateOne({_id:id},{$set:{message,engineProgressAt:new Date().toISOString()}});
    });
    const selectionAudit=data.selectionAudit as import('../models/backtest.model.js').SelectionAudit|undefined;
    invariant(!run.config.dataPolicy || selectionAudit, 'The calculation engine does not support data readiness yet. Restart the engine and worker, then retry.');
    if(selectionAudit) {
      await BacktestRunModel.updateOne({_id:id},{$set:{selectionAudit}});
      if(data.noEligibleStocks) {
        await BacktestRunModel.updateOne({_id:id},{$set:{status:'failed',message:'No selected stocks passed data readiness. Review exclusions; retry downloads or choose a later/shorter period.',finishedAt:new Date().toISOString()}});
        return;
      }
      if(selectionAudit.policy==='ready')await BacktestRunModel.updateOne({_id:id},{$set:{'config.ids':selectionAudit.includedIds}});
      delete data.selectionAudit;
    }
    const issues=backtestDataIssues(data);data.dataQuality={status:issues.length?'incomplete':'checked',issues};
    await BacktestRunModel.updateOne({_id:id},{$set:{status:'completed',stage:'complete',result:data,finishedAt:new Date().toISOString()},$unset:{message:1}});
  } catch(e) {
    await BacktestRunModel.updateOne({_id:id},{$set:{status:'failed',failureCode:e instanceof AppError?e.code:'BACKTEST_FAILED',message:e instanceof AppError?e.message:'Backtest failed without a report',finishedAt:new Date().toISOString()}});
    throw e;
  } finally { await announce('backtest.changed',{id}); }
}
