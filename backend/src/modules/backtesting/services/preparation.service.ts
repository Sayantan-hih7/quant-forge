import { ensureRuleReports } from '../../market-data/services/daily-reports.service.js';
import { ensureIntradayHistory } from '../../market-data/services/intraday-history.service.js';
export { ensureIntradayHistory } from '../../market-data/services/intraday-history.service.js';
import { instruments } from '../../market-data/repository.js';
import { ensureMonthlyHistory } from '../../market-data/services/dhan-cache.service.js';
import { invariant } from '../../../shared/errors.js';
import { BacktestRunModel, type BacktestRun } from '../models/backtest.model.js';
import { strategyHistoryPlan } from './history-plan.js';

export async function prepareBacktest(run: BacktestRun) {
  const from = new Date(Date.parse(run.config.from) + 19_800_000).toISOString().slice(0, 10);
  const to = new Date(Date.parse(run.config.to) + 19_800_000).toISOString().slice(0, 10);
  const plan = strategyHistoryPlan(run.strategy, from, to);
  const stocks = await instruments.find({ _id: { $in: run.config.ids }, active: true }).lean();
  invariant(stocks.length === run.config.ids.length, 'Some selected stocks are no longer active. Choose an available stock scope.');
  const progress = { processed: 0, total: stocks.length, downloaded: 0, reused: 0, symbol: '' };
  for (const stock of stocks) {
    progress.symbol = stock.symbol;
    await BacktestRunModel.updateOne({ _id: run._id }, { $set: { stage: 'preparing', progress, message: `Preparing historical candles for ${stock.symbol}` } });
    let changed = false;
    if (plan.dailyFrom) changed = await ensureMonthlyHistory(stock, plan.dailyFrom, plan.to) || changed;
    if (plan.intradayFrom) changed = await ensureIntradayHistory(stock, plan.intradayFrom, plan.to) || changed;
    if (changed) progress.downloaded++; else progress.reused++;
    progress.processed++;
  }
  if (plan.reportsFrom) {
    await BacktestRunModel.updateOne({ _id: run._id }, { $set: { message: 'Preparing exchange turnover reports; historical availability is verified during replay' } });
    const reportPreparation = await ensureRuleReports(stocks.map(stock => stock._id), plan.reportsFrom, run.config.to);
    await BacktestRunModel.updateOne({ _id: run._id }, { $set: { reportPreparation } });
  }
  await BacktestRunModel.updateOne({ _id: run._id }, { $set: { stage: 'calculating', progress, message: 'Replaying completed candles with the saved buy/sell rules', symbols: Object.fromEntries(stocks.map(s => [s._id, s.symbol])) } });
  return plan;
}
