import { dhanRequest } from '../../connections/services/dhan.service.js';
import { DatasetReceiptModel } from '../../market-data/models/dataset-receipt.model.js';
import { instruments, storedCandles } from '../../market-data/repository.js';
import { ensureMonthlyHistory } from '../../market-data/services/dhan-cache.service.js';
import { historyWindows, parseDhanHistory } from '../../market-data/sources/dhan-history.js';
import type { Instrument } from '../../market-data/types.js';
import { invariant } from '../../../shared/errors.js';
import { BacktestRunModel, type BacktestRun } from '../models/backtest.model.js';
import { strategyHistoryPlan } from './history-plan.js';

export async function ensureIntradayHistory(stock: Instrument, from: string, to: string) {
  let downloaded = false;
  for (const window of historyWindows(from, to, '1m')) {
    if (await DatasetReceiptModel.exists({ instrumentId: stock._id, kind: 'intraday', from: { $lte: window.from }, to: { $gte: window.to } })) continue;
    const payload = await dhanRequest('/charts/intraday', { securityId: stock.securityId, exchangeSegment: `${stock.exchange}_EQ`, instrument: 'EQUITY', interval: '1', oi: false,
      fromDate: `${window.from} 09:15:00`, toDate: `${window.to} 09:15:00` });
    const at = new Date().toISOString();
    const rows = parseDhanHistory(payload, stock, '1m', at).filter(row => row.time >= `${window.from}T03:45:00.000Z` && row.time < `${window.to}T03:45:00.000Z`);
    for (let offset = 0; offset < rows.length; offset += 500) await storedCandles.bulkWrite(rows.slice(offset, offset + 500).map(row => ({ updateOne: {
      filter: { instrumentId: row.instrumentId, interval: '1m', time: row.time }, update: { $set: row }, upsert: true,
    } })));
    await DatasetReceiptModel.updateOne({ _id: `intraday:${stock._id}:${window.from}:${window.to}` }, { $set: {
      instrumentId: stock._id, kind: 'intraday', ...window, checkedAt: at, records: rows.length,
    } }, { upsert: true });
    downloaded = true;
  }
  return downloaded;
}

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
  await BacktestRunModel.updateOne({ _id: run._id }, { $set: { stage: 'calculating', progress, message: 'Replaying completed candles with the saved buy/sell rules', symbols: Object.fromEntries(stocks.map(s => [s._id, s.symbol])) } });
  return plan;
}
