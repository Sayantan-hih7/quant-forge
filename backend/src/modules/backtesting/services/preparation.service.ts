import { repairIntradayHistory, emptyHistoryReview, type HistoryReview } from '../../market-data/services/history-repair.service.js';
import { ensureRuleReports } from '../../market-data/services/daily-reports.service.js';
import { ensureIntradayHistory } from '../../market-data/services/intraday-history.service.js';
export { ensureIntradayHistory } from '../../market-data/services/intraday-history.service.js';
import { instruments } from '../../market-data/repository.js';
import { ensureMonthlyHistory } from '../../market-data/services/dhan-cache.service.js';
import { marketTime } from '../../../shared/market-calendar.js';
import { AppError, invariant } from '../../../shared/errors.js';
import { BacktestRunModel, type BacktestRun } from '../models/backtest.model.js';
import { strategyHistoryPlan } from './history-plan.js';

export async function prepareBacktest(run: BacktestRun) {
  const from = new Date(Date.parse(run.config.from) + 19_800_000).toISOString().slice(0, 10);
  const to = new Date(Date.parse(run.config.to) + 19_800_000).toISOString().slice(0, 10);
  const plan = strategyHistoryPlan(run.strategy, from, to);
  const stocks = await instruments.find({ _id: { $in: run.config.ids }, active: true }).lean();
  const inactive=run.config.ids.filter(id=>!stocks.some(stock=>stock._id===id));
  const labels=await instruments.find({_id:{$in:inactive}}).select('_id symbol').lean();
  invariant(run.config.dataPolicy==='ready'||!inactive.length, 'Selected listings are inactive: '+inactive.map(id=>`${labels.find(x=>x._id===id)?.symbol??'Unknown stock'} (${id})`).join(', ')+'. Refresh the qualified list or select active listings; historical reports are preserved.');
  const preparationIssues:Record<string,string[]>={};
  for(const id of inactive)preparationIssues[id]=['Listing is inactive or its broker identifier needs updating.'];
  const sessionDates:string[]=[];
  for(let at=Date.parse(from+'T09:15:00+05:30');at<Date.parse(run.config.to);at+=86400000)if(marketTime(at).tradingDay)sessionDates.push(marketTime(at).date);
  run.config.sessionDates=sessionDates;
  run.config.preparationIssues=preparationIssues;
  const review = emptyHistoryReview(), reviewBudget = { remaining: 40 };
  const progress = { processed: 0, total: stocks.length, downloaded: 0, reused: 0, symbol: '' };
  for (const stock of stocks) {
    progress.symbol = stock.symbol;
    await BacktestRunModel.updateOne({ _id: run._id }, { $set: { stage: 'preparing', progress, message: `Preparing historical candles for ${stock.symbol}` } });
    let changed = false;
    if(stock.exchange==='NSE'&&stock.series!=='EQ'&&!run.strategy.risk.overnight)preparationIssues[stock._id]=['Intraday requires the NSE EQ series; trade-to-trade and other series need separate handling.'];
    try {
    if (plan.dailyFrom) changed = await ensureMonthlyHistory(stock, plan.dailyFrom, plan.to) || changed;
    if (plan.intradayFrom) changed = await ensureIntradayHistory(stock, plan.intradayFrom, plan.to) || changed;
    if (plan.intradayFrom) {
      const checked=await repairIntradayHistory(stock,from,to,reviewBudget);
      for(const key of Object.keys(review) as (keyof HistoryReview)[])review[key]+=checked[key];
      changed ||= checked.recoveredCandles > 0;
    }
    } catch(error) {
      if(run.config.dataPolicy!=='ready'||!(error instanceof AppError)||[401,403,424,429].includes(error.status))throw error;
      preparationIssues[stock._id]=[...(preparationIssues[stock._id]??[]),'History preparation unavailable: '+error.message];
    }
    if (changed) progress.downloaded++; else progress.reused++;
    progress.processed++;
  }
  if (plan.reportsFrom) {
    await BacktestRunModel.updateOne({ _id: run._id }, { $set: { message: 'Preparing exchange turnover reports; historical availability is verified during replay' } });
    const reportPreparation = await ensureRuleReports(stocks.map(stock => stock._id), plan.reportsFrom, run.config.to);
    await BacktestRunModel.updateOne({ _id: run._id }, { $set: { reportPreparation } });
  }
  await BacktestRunModel.updateOne({ _id: run._id }, { $set: { 'config.sessionDates':sessionDates, 'config.preparationIssues':preparationIssues, stage: 'calculating', progress, historyReview: review, message: 'Replaying completed candles with the saved buy/sell rules', symbols: Object.fromEntries(stocks.map(s => [s._id, s.symbol])) } });
  return plan;
}
