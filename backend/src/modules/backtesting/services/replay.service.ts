import { isDeepStrictEqual } from 'node:util';
import { AppError, invariant } from '../../../shared/errors.js';
import { engineInstruments } from '../../engine/services/engine.service.js';
import { portfolioBacktest } from './portfolio-stream.js';
import type { StockTimeframe } from '../../stock-details/types.js';
import { BacktestRunModel, type BacktestRun } from '../models/backtest.model.js';
import type { BacktestReplayView, ReplayEvent, ReplayTrace } from '../types/replay.js';
import { completedReviewBars } from './chart.service.js';
import { strategyHistoryPlan } from './history-plan.js';

const pending = new Map<string, Promise<BacktestReplayView>>();
// A replay is a self-contained history snapshot. Bounded, short-lived cache only;
// old reports and their P&L are never rewritten when an explanation is rebuilt.
const cache = new Map<string, { at: number; value: BacktestReplayView }>();
export function replayMatchesReport(expected: Record<string, unknown>, actual: Record<string, unknown>) {
  return ['trades', 'openPositions', 'netPnl', 'closedTrades'].every(key =>
    expected[key] !== undefined && isDeepStrictEqual(expected[key], actual[key]));
}
export function recordedFillEvents(run: BacktestRun, instrumentId: string): ReplayEvent[] {
  const fills = (run.result?.trades ?? []) as { instrumentId: string; entryAt: string; exitAt: string; entry: number; exit: number; quantity: number; remainingQuantity?: number; pnl: number; reason: string }[];
  const open = (run.result?.openPositions ?? []) as { instrumentId: string; entryAt?: string; quantity: number; entry: number }[];
  const entries = new Map<string, { quantity: number; price: number; at: string }>();
  const result: ReplayEvent[] = [];
  const frame = run.strategy.entry.cadence === 'daily' && run.strategy.risk.timeframe === '1d' ? '1d' : '1m';
  const closeAt = (at: string) => frame === '1d' ? `${new Date(Date.parse(at) + 19800000).toISOString().slice(0, 10)}T10:00:00.000Z` : new Date(Date.parse(at) + 60000).toISOString();
  for (const fill of fills.filter(f => f.instrumentId === instrumentId && Number.isFinite(Date.parse(f.entryAt)))) {
    const key = String(Date.parse(fill.entryAt)), entry = entries.get(key) ?? { quantity: 0, price: fill.entry, at: fill.entryAt };
    entry.quantity += fill.quantity; entries.set(key, entry);
    result.push({ kind: 'exit', instrumentId, entryAt: fill.entryAt, at: closeAt(fill.exitAt), fillAt: fill.exitAt, phase: 'close', sequence: result.length,
      side: 'SELL', price: fill.exit, quantity: fill.quantity, remainingQuantity: fill.remainingQuantity, pnl: fill.pnl, reason: fill.reason });
  }
  for (const p of open.filter(p => p.instrumentId === instrumentId && p.entryAt && Number.isFinite(Date.parse(p.entryAt)))) {
    const key = String(Date.parse(p.entryAt!)), entry = entries.get(key) ?? { quantity: 0, price: p.entry / 100, at: p.entryAt! };
    entry.quantity += p.quantity; entries.set(key, entry);
  }
  for (const entry of entries.values()) result.push({ kind: 'entry', instrumentId, entryAt: entry.at, at: run.strategy.risk.entryOrderType === 'limit' ? closeAt(entry.at) : entry.at,
    fillAt: entry.at, phase: run.strategy.risk.entryOrderType === 'limit' ? 'close' : 'open', side: 'BUY', sequence: -1,
    price: entry.price, quantity: entry.quantity, remainingQuantity: entry.quantity, reason: 'Recorded fill; original decision details unavailable' });
  return result;
}
async function prepare(run: BacktestRun, instrumentId: string): Promise<BacktestReplayView> {
  const day = (at: string) => new Date(Date.parse(at) + 19800000).toISOString().slice(0, 10);
  const plan = strategyHistoryPlan(run.strategy, day(run.config.from), day(run.config.to));
  const recorded = run.result?.replay as ReplayTrace | undefined;
  const captured = recorded?.version === 1 && recorded.complete;
  const inputs = await engineInstruments([instrumentId], run.config.to, false, plan, false, 500000);
  let trace = captured ? recorded : undefined;
  const warnings: string[] = [];
  let source: BacktestReplayView['source'] = captured ? 'recorded' : 'verified-reconstruction';
  if (!captured) {
    try {
      const data = await portfolioBacktest(run, plan, instrumentId) as Record<string, unknown> & { replay?: ReplayTrace };
      if (replayMatchesReport(run.result!, data) && data.replay?.version === 1 && data.replay.complete) trace = data.replay;
    } catch { /* Recorded fills stay inspectable when reconstruction is unavailable. */ }
    if (!trace) {
      source = 'fills-only';
      warnings.push('The original decision details could not be verified against this report. Playback shows recorded fills; signal checks and stop adjustments are unavailable.');
    }
  }
  const instrument = inputs.find(i => i.id === instrumentId)!;
  const supported: StockTimeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo'];
  const frames = new Set<StockTimeframe>([plan.replay]);
  for (const rule of [run.strategy.entry, run.strategy.exit]) {
    if (rule.enabled === false) continue;
    for (const group of rule.groups as { conditions: Record<string, unknown>[] }[]) for (const condition of group.conditions) {
      for (const frame of [condition.leftFrame, condition.rightType === 'indicator' ? condition.rightFrame : undefined]) {
        if (supported.includes(frame as StockTimeframe)) frames.add(frame as StockTimeframe);
      }
    }
  }
  if (run.strategy.risk.stopMode === 'ATR') frames.add(run.strategy.risk.timeframe);
  const history: BacktestReplayView['frames'] = {};
  for (const frame of frames) {
    const rows = ['1d', '1w', '1mo'].includes(frame) ? instrument.daily : instrument.intraday;
    const result = completedReviewBars(rows, frame, Date.parse(run.config.to));
    history[frame] = result.bars;
    if (result.incompleteBuckets) warnings.push(`${frame}: ${result.incompleteBuckets} incomplete candle intervals are omitted.`);
  }
  // History can be corrected after a run. Keep the original decision evidence,
  // but do not silently present a changed chart as the original signal candle.
  const changedSignal = trace?.events.some(event => {
    if (event.instrumentId !== instrumentId || !event.candle) return false;
    const original = event.candle, frame = original.timeframe as StockTimeframe;
    const key = ['1d', '1w', '1mo'].includes(frame) ? day(original.time) : new Date(original.time).toISOString();
    const current = history[frame]?.find(bar => bar.time === key);
    return current && (['open','high','low','close'] as const).some(field => Math.abs(current[field] - original[field]) > 0.0001);
  });
  if (changedSignal) warnings.push('Some stored signal candles have changed since this run. The explanation retains the original rule values; the chart uses the currently stored history.');
  if (!history[plan.replay]?.length) warnings.push('No stored execution candles are available for this stock. Recorded fills remain in the normal trade history.');
  return { instrumentId, revision: run.strategy.revision, timeframe: plan.replay, source, frames: history,
    events: trace ? trace.events.filter(e => e.instrumentId === instrumentId) : recordedFillEvents(run, instrumentId), warnings, preparedAt: new Date().toISOString() };
}
export async function backtestReplay(runId: string, instrumentId: string) {
  const run = await BacktestRunModel.findById(runId).lean();
  if (!run) throw new AppError(404, 'BACKTEST_NOT_FOUND', 'Backtest report not found');
  invariant(run.status === 'completed' && !!run.result, 'The backtest must finish before replay is available');
  invariant(run.config.ids.includes(instrumentId), 'This stock was not included in the backtest');
  const key = `${runId}:${run.finishedAt ?? run.createdAt}:${instrumentId}`;
  const saved = cache.get(key);
  if (saved && Date.now() - saved.at < 15 * 60000) return saved.value;
  if (pending.has(key)) return pending.get(key)!;
  if (pending.size >= 2) throw new AppError(503, 'REPLAY_BUSY', 'Other replays are being prepared. Please retry shortly.');
  const work = prepare(run, instrumentId).then(value => {
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value }); return value;
  }).finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}
