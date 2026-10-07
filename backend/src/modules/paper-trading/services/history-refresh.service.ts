import { ensureRuleReports } from '../../market-data/services/daily-reports.service.js';
import { AppError } from '../../../shared/errors.js';
import { redis } from '../../../shared/redis.js';
import { marketTime } from '../../../shared/market-calendar.js';
import { dhanRequest } from '../../connections/services/dhan.service.js';
import { instruments, storedCandles } from '../../market-data/repository.js';
import { ensureMonthlyHistory } from '../../market-data/services/dhan-cache.service.js';
import { parseDhanHistory } from '../../market-data/sources/dhan-history.js';
import { strategyHistoryPlan } from '../../backtesting/services/history-plan.js';
import { ensureIntradayHistory } from '../../backtesting/services/preparation.service.js';
import { PaperPositionModel, PaperSessionModel } from '../models/paper.model.js';
import { MonthlyUniverseModel } from '../../qualification/models/qualification.model.js';
import { currentMonth } from '../../qualification/services/universe.service.js';
import { monitoringIds } from './scope.service.js';
import type { Candle } from '../../market-data/types.js';

export const PAPER_HISTORY_STATUS = 'quantforge:paper:history';
const prepared = new Set<string>();
const nextRefresh = new Map<string, number>();
export function completedHistoryRows(rows: Candle[], now: number) {
  return rows.filter(row => (row.interval === '1d' ? Date.parse(`${row.time.slice(0, 10)}T10:00:00.000Z`) : Date.parse(row.time) + 60000) <= now);
}
async function store(rows: Candle[]) {
  for (let offset = 0; offset < rows.length; offset += 500) await storedCandles.bulkWrite(rows.slice(offset, offset + 500).map(row => ({ updateOne: {
    filter: { instrumentId: row.instrumentId, interval: row.interval, time: row.time }, update: { $set: row }, upsert: true,
  } })));
}
/** Runs independently of fills; it only downloads data for monitored/held stocks. */
export async function refreshPaperHistory(shouldStop = () => false) {
  const sessions = await PaperSessionModel.find({ active: true }).lean();
  if (!sessions.length) return;
  const universe = await MonthlyUniverseModel.findById(currentMonth()).lean();
  const positions = await PaperPositionModel.find().lean();
  const today = marketTime().date;
  const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  let processed = 0, failed = 0;
  const errors: string[] = [];
  await redis.set(PAPER_HISTORY_STATUS, JSON.stringify({ state: 'refreshing', updatedAt: new Date().toISOString() }));
  for (const session of sessions) {
    const ids = monitoringIds(universe?.members.map(m => m.instrumentId) ?? [], session.ids, positions.filter(p => p.sessionId === session._id).map(p => p.instrumentId), session.entriesPaused);
    const stocks = await instruments.find({ _id: { $in: ids } }).lean();
    const plan = strategyHistoryPlan(session.strategy, today, today);
    for (const stock of stocks) {
      if (shouldStop()) return;
      const warmup = `${session._id}:${stock._id}:${today}`;
      try {
        if (!prepared.has(warmup)) {
          if (plan.dailyFrom) await ensureMonthlyHistory(stock, plan.dailyFrom, today, { maxWaitMs: 45000 });
          if (plan.intradayFrom) await ensureIntradayHistory(stock, plan.intradayFrom, today, { maxWaitMs: 45000 });
          prepared.add(warmup);
        }
        const clock = marketTime();
        const intervals: ('1m' | '1d')[] = [...(plan.intradayFrom ? ['1m' as const] : []), ...(plan.dailyFrom ? ['1d' as const] : [])];
        for (const interval of intervals) {
        // Daily bars are requested after close; provider publication delays are retried.
        const key = `${stock._id}:${interval}:${today}`;
        const due = !nextRefresh.has(key) || nextRefresh.get(key)! <= Date.now();
        if (due && clock.tradingDay && (interval === '1m' ? clock.minute >= 555 && clock.minute <= 1020 : clock.minute >= 930)) {
          const cutoff = Date.now() - 5000;
          const toTime = new Date(cutoff + 19800000).toISOString().slice(0, 19).replace('T', ' ');
          const payload = await dhanRequest(interval === '1d' ? '/charts/historical' : '/charts/intraday', {
            securityId: stock.securityId, exchangeSegment: `${stock.exchange}_EQ`, instrument: 'EQUITY', oi: false,
            ...(interval === '1m' ? { interval: '1', fromDate: `${today} 09:14:00`, toDate: toTime } : { expiryCode: 0, fromDate: today, toDate: tomorrow }),
          }, { maxWaitMs: 20000 });
          const rows = completedHistoryRows(parseDhanHistory(payload, stock, interval, new Date(cutoff).toISOString()), cutoff);
          await store(rows);
          const hasToday = rows.some(row => new Date(Date.parse(row.time) + 19800000).toISOString().startsWith(today));
          if (!hasToday && clock.minute >= (interval === '1d' ? 935 : 560)) { failed++; if (errors.length < 5) errors.push(`${stock.symbol}: today's completed ${interval} candles are not available yet; retry scheduled.`); }
          nextRefresh.set(key, Date.now() + (interval === '1d' && hasToday ? 3600000 : 60000));
        }
        }
        processed++;
      } catch (error) {
        failed++; if (errors.length < 5) errors.push(`${stock.symbol}: ${error instanceof AppError ? error.message : 'History refresh unavailable'}`);
        if (error instanceof AppError && ['DHAN_LOGIN_REQUIRED', 'DHAN_TOKEN_REJECTED', 'DHAN_RATE_LIMIT'].includes(error.code)) break;
      }
    }
    if (plan.reportsFrom && !shouldStop()) {
      try {
        const reports = await ensureRuleReports(ids, plan.reportsFrom, new Date().toISOString());
        failed += reports.unavailable.length;
        for (const item of reports.unavailable) if (errors.length < 5) errors.push(`${item.exchange} ${item.date}: ${item.message}`);
      }
      catch (error) { failed++; if (errors.length < 5) errors.push(error instanceof AppError ? error.message : 'Exchange turnover reports are unavailable; affected rules remain pending.'); }
    }
  }
  for (const key of prepared) if (!key.endsWith(today)) prepared.delete(key);
  for (const key of nextRefresh.keys()) if (!key.endsWith(today)) nextRefresh.delete(key);
  await redis.set(PAPER_HISTORY_STATUS, JSON.stringify({ state: failed ? 'partial' : 'ready', processed, failed, errors, updatedAt: new Date().toISOString() }));
}
