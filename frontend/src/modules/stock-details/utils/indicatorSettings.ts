import { calculationSettingsSchema } from './calculationSettingsSchema';
import { calculationSettings, settingsError, requiredCandles } from './indicatorCatalog';
import { z } from 'zod';
import type { ChartIndicator } from './chartIndicators';
import { indicatorFrame, indicatorKinds } from './chartIndicators';
import type { ChartBar, StockChartData, StockTimeframe } from '../types';
import { barEnd, bucketTime, istDay } from './chartTime';

export const indicatorSettingsSchema = z.object({
  id: z.string().min(1), kind: z.custom<ChartIndicator['kind']>(v => indicatorKinds.includes(v as ChartIndicator['kind'])),
  period: z.number().int().min(2).max(500),
  timeframe: z.enum(['chart', '1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo']),
  color: z.string().regex(/^#[\da-f]{6}$/i, 'Use a six-digit hex colour'),
  source: z.enum(['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4']).optional(),
  anchor: z.enum(['session', 'week', 'month', 'custom']).optional(),
  anchorDate: z.string().optional(),
  fastPeriod: z.number().int().min(2).max(500).optional(),
  slowPeriod: z.number().int().min(3).max(400).optional(),
  signalPeriod: z.number().int().min(1).max(100).optional(),
  multiplier: z.number().min(0.1).max(20).optional(),
  lineWidth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  visible: z.boolean().optional(),
  showCrosses: z.boolean().optional(),
  crossDirection: z.enum(['both', 'above', 'below']).optional(),
  lineStyles: z.record(z.string().regex(/^\d$/), z.object({ color: z.string().regex(/^#[\da-f]{6}$/i).optional(), visible: z.boolean().optional() })).optional(),
}).extend(calculationSettingsSchema.shape).superRefine((i, ctx) => {
  if (!indicatorKinds.includes(i.kind)) return;
  const problem = settingsError(i.kind, calculationSettings(i.kind,i), true);
  if (problem) ctx.addIssue({ code: 'custom', path: ['source'], message: problem });
  if (i.kind === 'vwap' && i.anchor === 'custom') {
    const day = i.anchorDate ?? '', at = Date.parse(day);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== day || day < '1990-01-01' || day > istDay(Date.now())) ctx.addIssue({ code: 'custom', path: ['anchorDate'], message: 'Choose a valid date from 1990 through today (IST)' });
  }
});
export type IndicatorForm = z.infer<typeof indicatorSettingsSchema>;
export { usesPriceSource } from './chartIndicators';
export function minimumCandles(i: ChartIndicator) {
  const n = i.period;
  const count = requiredCandles(i.kind,n,i);
  return count + (i.offset ?? 0);
}
export type HistoryNeed = { minBars: number; from?: string };
export function anchorHistoryIssue(i: ChartIndicator, data?: StockChartData) {
  if (i.kind !== 'vwap' || i.anchor !== 'custom' || !i.anchorDate || !data) return undefined;
  if ((data.requestedFrom && data.requestedFrom > i.anchorDate) || data.historyVerified === false ||
      (data.historyVerified !== true && data.bars[0]?.time.slice(0, 10) > i.anchorDate)) return 'Anchor history is incomplete; VWAP is not calculated';
  return undefined;
}
export function indicatorHistoryNeeds(indicators: ChartIndicator[], frame: StockTimeframe): Partial<Record<StockTimeframe, HistoryNeed>> {
  const result: Partial<Record<StockTimeframe, HistoryNeed>> = {};
  for (const i of indicators) {
    if (i.visible === false) continue;
    if (i.kind === 'pivots') {
      const target = i.timeframe === 'chart' ? frame : i.timeframe;
      result[target] = { ...result[target], minBars: Math.max(result[target]?.minBars ?? 0, 80 + (i.offset ?? 0)) };
    }
    const source = indicatorFrame(i, frame), old = result[source];
    // Extra seed history stabilises recursive averages; never fabricate bars for a new listing.
    const minBars = (i.kind==='pivots' ? 80 : minimumCandles(i)) + (['dema', 'connorsRsi', 'maCross', 'ema', 'rsi', 'atr', 'adx', 'macd', 'supertrend', 'hma', 'keltner', 'stochRsi'].includes(i.kind) ? 100 : 10);
    const from = i.kind === 'vwap' && i.anchor === 'custom' ? i.anchorDate : undefined;
    result[source] = { minBars: Math.max(old?.minBars ?? 0, minBars), from: old?.from && from ? old.from < from ? old.from : from : old?.from ?? from };
  }
  return result;
}
export interface IndicatorHistoryStatus {
  stockLoading?: boolean;
  stockUnavailable?: boolean;
  benchmarkLoading?: boolean;
  benchmarkUnavailable?: boolean;
  benchmarkBars?: Pick<ChartBar, 'time' | 'close'>[];
}
export function indicatorUnavailable(i: ChartIndicator, frame: StockTimeframe, bars: { time: string }[] | undefined, now: number, partial = false, status: IndicatorHistoryStatus = {}) {
  if (i.kind === 'relativeStrength') {
    const source = indicatorFrame(i, frame);
    if (!['1d', '1w', '1mo'].includes(source)) return 'Choose daily, weekly or monthly candles for relative strength';
    if (status.stockLoading) return 'Loading stock history';
    if (!bars || !bars.length) return status.stockUnavailable || bars ? 'Stock history unavailable' : 'Loading stock history';
    const closed = bars.filter(b => barEnd(b.time, source) <= now);
    const required = minimumCandles(i), interval = source === '1d' ? 'daily' : source === '1w' ? 'weekly' : 'monthly';
    if (closed.length < required) return `Insufficient history: requires ${required} completed ${interval} candles · ${closed.length} available${bars.length > closed.length ? ' (forming candle excluded)' : ''}`;
    const benchmark = (i.strategy ? i.strategySettings?.benchmark : i.benchmark) ?? 'NIFTY 50';
    if (status.benchmarkLoading) return `Loading ${benchmark} history`;
    if (status.benchmarkUnavailable || !status.benchmarkBars?.length) return `${benchmark} history unavailable`;
    const dates = new Set(status.benchmarkBars.filter(b => barEnd(b.time, source) <= now && b.close > 0).map(b => bucketTime(Date.parse(b.time), source)));
    const offset = i.offset ?? 0, end = closed.length - offset;
    const matched = closed.slice(end - i.period - 1, end).filter(b => dates.has(bucketTime(Date.parse(b.time), source))).length;
    if (matched === i.period + 1) return 'No relative strength value for the displayed candles';
    return `Matching history incomplete: ${matched} of ${i.period + 1} required ${interval} candles match ${benchmark}`;
  }
  if (!bars) return 'Loading history';
  const source = indicatorFrame(i, frame), closed = bars.filter(b => barEnd(b.time, source) <= now).length;
  const forming = bars.length - closed;
  if (i.kind === 'vwap') return i.anchor === 'custom' ? `No priced volume from ${i.anchorDate} in loaded history` : 'No priced volume in this period';
  return `Needs ${minimumCandles(i)} candles · ${closed} completed${forming ? ` + ${forming} forming${partial || i.strategy || source !== frame ? ' (excluded)' : ''}` : ''}`;
}
