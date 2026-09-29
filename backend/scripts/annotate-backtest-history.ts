import { connectDatabase, disconnectDatabase } from '../src/shared/database.js';
import { storedCandles } from '../src/modules/market-data/repository.js';
import { BacktestRunModel } from '../src/modules/backtesting/models/backtest.model.js';
import { intradayHistoryQuality } from '../src/modules/backtesting/services/history-quality.js';

// Add diagnostics to existing reports without rewriting their prices, fills or returns.
await connectDatabase();
try {
  const runs = await BacktestRunModel.find({ status: 'completed', 'result.historyQuality': { $exists: false } }).lean();
  for (const run of runs) {
    if (run.strategy.entry.cadence === 'daily' && run.strategy.risk.timeframe === '1d') continue;
    const stocks = [];
    for (const id of run.config.ids) stocks.push({ id, intraday: await storedCandles.find({ instrumentId: id, interval: '1m', time: { $gte: run.config.from, $lt: run.config.to } }).select('time -_id').lean() });
    const quality = intradayHistoryQuality(stocks, run.config, run.strategy.risk.overnight);
    if (process.argv.includes('--apply')) await BacktestRunModel.updateOne({ _id: run._id }, { $set: { 'result.historyQuality': quality } });
    console.log(JSON.stringify({ id: run._id, applied: process.argv.includes('--apply'), ...quality }));
  }
} finally { await disconnectDatabase(); }
