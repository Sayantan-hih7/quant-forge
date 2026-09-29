import { AppError, invariant } from '../../../shared/errors.js';
import { CandleModel } from '../../market-data/models/market-data.model.js';
import { aggregateBars, indianDate } from '../../stock-details/utils/chart-bars.js';
import type { ChartBar, StockTimeframe } from '../../stock-details/types.js';
import { BacktestRunModel } from '../models/backtest.model.js';
import { strategyHistoryPlan } from './history-plan.js';

/** Review stored history only. Opening a report must not download or start a new replay. */
export async function backtestStockChart(runId: string, instrumentId: string, timeframe: StockTimeframe) {
  const run = await BacktestRunModel.findById(runId).select('status strategy config').lean();
  if (!run) throw new AppError(404, 'BACKTEST_NOT_FOUND', 'Backtest report not found');
  invariant(run.status === 'completed', 'The backtest must finish before its chart can be reviewed');
  invariant(run.config.ids.includes(instrumentId), 'This stock was not included in the backtest');
  const plan = strategyHistoryPlan(run.strategy, run.config.from, run.config.to);
  const intraday = !['1d', '1w', '1mo'].includes(timeframe);
  const from = (intraday ? plan.intradayFrom : plan.dailyFrom) ??
    new Date(Date.parse(run.config.from) - (intraday ? 7 : 365) * 86400000).toISOString().slice(0, 10);
  const rows = await CandleModel.find({ instrumentId, interval: intraday ? '1m' : '1d',
    time: { $gte: `${from}T00:00:00.000Z`, $lt: new Date(run.config.to).toISOString() },
  }).sort({ time: 1 }).limit(150001).select('time open high low close volume -_id').lean();
  invariant(rows.length <= 150000, 'Too many stored candles for this chart. Choose a daily or weekly interval');
  const { bars, incompleteBuckets } = completedReviewBars(rows, timeframe, Date.parse(run.config.to));
  const notes = [
    ...(!bars.length ? ['No stored candles for this interval in the backtest period. Try the strategy’s original interval.'] : []),
    ...(incompleteBuckets ? [`${incompleteBuckets} incomplete candle intervals were omitted because stored minutes are missing.`] : []),
  ];
  return { instrumentId, timeframe, bars, incompleteBuckets, message: notes.join(' ') || undefined,
    latestCandleAt: rows.at(-1)?.time ?? null, refreshedAt: new Date().toISOString(),
    source: 'Stored backtest history', timezone: 'Asia/Kolkata' };
}

export function completedReviewBars(rows: ChartBar[], frame: StockTimeframe, cutoff: number) {
  const intraday = !['1d', '1w', '1mo'].includes(frame), counts = new Map<string, number>();
  if (intraday) for (const row of rows) {
    const bucket = aggregateBars([row], frame)[0].time;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  let incompleteBuckets = 0;
  const bars = aggregateBars(rows, frame).filter(bar => {
    const start = Date.parse(bar.time);
    let end: number;
    if (intraday) {
      const minutes = parseInt(frame) * (frame.endsWith('h') ? 60 : 1);
      end = Math.min(start + minutes * 60000, Date.parse(`${indianDate(bar.time)}T10:00:00Z`));
      if (end > cutoff) return false;
      if (counts.get(bar.time) !== (end - start) / 60000) { incompleteBuckets++; return false; }
    } else {
      const [year, month] = bar.time.split('-').map(Number);
      end = frame === '1d' ? Date.parse(`${bar.time}T10:00:00Z`) :
        frame === '1w' ? start - 19_800_000 + 7 * 86400000 : Date.UTC(year, month, 1) - 19_800_000;
    }
    return end <= cutoff;
  });
  return { bars, incompleteBuckets };
}
