import type { ChartBar, StockTimeframe } from '../types';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
import { barEnd, isIntraday, istDay } from './chartTime';

export type IndicatorKind = 'ema' | 'sma' | 'vwap' | 'rsi' | 'atr' | 'macd' | 'rvol' | 'bollinger' | 'bollingerBandwidth' | 'adx' | 'diPlus' | 'diMinus' | 'supertrend' | 'accDist';
export const indicatorKinds: IndicatorKind[] = ['ema', 'sma', 'vwap', 'rsi', 'atr', 'macd', 'rvol', 'bollinger', 'bollingerBandwidth', 'adx', 'diPlus', 'diMinus', 'supertrend', 'accDist'];
export const fixedPeriodIndicators: IndicatorKind[] = ['vwap', 'macd', 'supertrend', 'accDist'];
const indicatorNames: Partial<Record<IndicatorKind, string>> = { bollinger: 'Bollinger bands', bollingerBandwidth: 'Bollinger width', diPlus: '+DI', diMinus: '−DI', supertrend: 'Supertrend 10 / 3', accDist: 'Accumulation / distribution' };
export const indicatorName = (kind: IndicatorKind) => indicatorNames[kind] ?? kind.toUpperCase();
export interface ChartIndicator { id: string; kind: IndicatorKind; period: number; timeframe: StockTimeframe | 'chart'; offset?: number; strategy?: boolean; color: string }
export interface IndicatorLine { id: string; label: string; color: string; pane: string; histogram?: boolean; values: { time: string; value: number }[] }
export const indicatorColors = ['#8064d8', '#c58822', '#168b8b', '#4076d9', '#cb5384', '#699038'];
export const indicatorLabel = (i: ChartIndicator, frame: StockTimeframe) => `${indicatorName(i.kind)}${fixedPeriodIndicators.includes(i.kind) ? i.kind === 'macd' ? ' 12/26/9' : '' : ` ${i.period}`} · ${i.timeframe === 'chart' ? frame : i.timeframe}${i.offset ? ` · ${i.offset} candles earlier` : ''}${i.strategy ? ' · Strategy' : ''}`;
export const defaultIndicators: ChartIndicator[] = [5, 21].map((period, n) => ({ id: `default-${period}`, kind: 'ema', period, timeframe: 'chart', color: indicatorColors[n] }));
export function strategyIndicators(strategy?: SavedStrategy) {
  const indicators: ChartIndicator[] = [], unsupported = new Set<string>();
  const add = (field: string, timeframe: string, period?: number, offset = 0) => {
    // Body-relative conditions still need their reference EMA on the price chart.
    if (field === 'bodyAboveEma' || field === 'bodyBelowEma') field = 'ema';
    if (field === 'bollingerUpper' || field === 'bollingerLower') field = 'bollinger';
    const ma = /^(ema|sma)(\d+)?$/.exec(field), kind = (ma?.[1] ?? (field === 'macdSignal' ? 'macd' : field)) as IndicatorKind;
    if (!indicatorKinds.includes(kind)) {
      if (!['close', 'open', 'high', 'low', 'volume'].includes(field)) unsupported.add(field);
      return;
    }
    if (!['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo'].includes(timeframe)) { unsupported.add(`${field} (${timeframe})`); return; }
    const n = ma?.[2] ? Number(ma[2]) : period ?? (['rvol', 'bollinger', 'bollingerBandwidth'].includes(kind) ? 20 : 14), id = `${kind}-${n}-${timeframe}-${offset}`;
    if (!indicators.some(i => i.id === id)) indicators.push({ id, kind, period: n, offset, timeframe: timeframe as StockTimeframe, strategy: true, color: indicatorColors[indicators.length % indicatorColors.length] });
  };
  if (strategy) {
    for (const rule of [strategy.entry, strategy.exit].filter(rule => rule.enabled !== false)) for (const group of rule.groups) for (const c of group.conditions) {
      add(c.left, c.leftFrame, c.leftPeriod, c.leftOffset);
      if (c.rightType === 'indicator') add(c.right, c.rightFrame, c.rightPeriod, c.rightOffset);
    }
    if (strategy.risk.stopMode === 'ATR') add('atr', strategy.risk.timeframe, strategy.risk.atrPeriod);
  }
  return { indicators, unsupported: [...unsupported] };
}
// Same seeds as the execution engine: adjust=False EMA; Wilder SMA-seeded RSI/ATR.
function ema(values: (number | null)[], n: number) {
  let last = 0, count = 0;
  return values.map(value => { if (value === null) return null; last = count ? last + (value - last) * 2 / (n + 1) : value; return ++count >= n ? last : null; });
}
function rma(values: (number | null)[], n: number) {
  let last = 0, count = 0;
  return values.map(v => { if (v === null) return null; count++; last = count <= n ? last + v / n : (last * (n - 1) + v) / n; return count >= n ? last : null; });
}
export function indicatorValues(bars: ChartBar[], kind: IndicatorKind, n: number): (number | null)[][] {
  const close = bars.map(b => b.close);
  if (kind === 'ema') return [ema(close, n)];
  if (kind === 'sma' || kind === 'rvol') {
    const vals = kind === 'sma' ? close : bars.map(b => b.volume); let sum = 0;
    return [vals.map((v, i) => {
      if (kind === 'rvol') { const avg = i >= n ? sum / n : 0; sum += v - (i >= n ? vals[i - n] : 0); return avg > 0 ? v / avg : null; }
      sum += v - (i >= n ? vals[i - n] : 0); return i >= n - 1 ? sum / n : null;
    })];
  }
  if (kind === 'rsi') {
    const delta = close.map((c,i) => i ? c - close[i-1] : null);
    const gain = rma(delta.map(v => v === null ? null : Math.max(v, 0)), n), loss = rma(delta.map(v => v === null ? null : Math.max(-v, 0)), n);
    return [gain.map((g,i) => g === null || loss[i] === null ? null : g + loss[i]! === 0 ? 50 : loss[i] === 0 ? 100 : 100 - 100 / (1 + g / loss[i]!))];
  }
  if (kind === 'atr') return [rma(bars.map((b,i) => Math.max(b.high - b.low, i ? Math.abs(b.high - close[i-1]) : 0, i ? Math.abs(b.low - close[i-1]) : 0)), n)];
  if (kind === 'bollinger' || kind === 'bollingerBandwidth') {
    // Match the engine's sample standard deviation (pandas ddof=1).
    const middle = indicatorValues(bars, 'sma', n)[0];
    const sd = middle.map((mean, i) => mean === null ? null : Math.sqrt(close.slice(i - n + 1, i + 1).reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)));
    return kind === 'bollingerBandwidth' ? [middle.map((m,i) => !m || sd[i] === null ? null : 400 * sd[i]! / m)] :
      [middle.map((m,i) => m === null ? null : m + 2 * sd[i]!), middle, middle.map((m,i) => m === null ? null : m - 2 * sd[i]!)];
  }
  if (['adx', 'diPlus', 'diMinus'].includes(kind)) {
    const tr = indicatorValues(bars, 'atr', n)[0];
    const up = bars.map((b,i) => i ? b.high - bars[i-1].high : 0), down = bars.map((b,i) => i ? bars[i-1].low - b.low : 0);
    const plus = rma(up.map((v,i) => v > down[i] && v > 0 ? v : 0), n).map((v,i) => v === null || !tr[i] ? null : 100 * v / tr[i]!);
    const minus = rma(down.map((v,i) => v > up[i] && v > 0 ? v : 0), n).map((v,i) => v === null || !tr[i] ? null : 100 * v / tr[i]!);
    if (kind === 'diPlus') return [plus];
    if (kind === 'diMinus') return [minus];
    return [rma(plus.map((p,i) => p === null || minus[i] === null || p + minus[i]! === 0 ? null : 100 * Math.abs(p - minus[i]!) / (p + minus[i]!)), n)];
  }
  if (kind === 'supertrend') {
    const atr = indicatorValues(bars, 'atr', 10)[0];
    let previousUpper = 0, previousLower = 0, previousLine: number | null = null;
    return [bars.map((b,i) => {
      if (atr[i] === null) return null;
      let upper = (b.high + b.low) / 2 + 3 * atr[i]!, lower = (b.high + b.low) / 2 - 3 * atr[i]!;
      if (previousLine !== null) {
        if (!(upper < previousUpper || close[i-1] > previousUpper)) upper = previousUpper;
        if (!(lower > previousLower || close[i-1] < previousLower)) lower = previousLower;
      }
      const line: number = previousLine === null ? lower : previousLine === previousUpper ? (b.close <= upper ? upper : lower) : (b.close >= lower ? lower : upper);
      previousUpper = upper; previousLower = lower; previousLine = line; return line;
    })];
  }
  if (kind === 'accDist') { let sum = 0; return [bars.map(b => sum += b.high === b.low ? 0 : (2 * b.close - b.low - b.high) / (b.high - b.low) * b.volume)]; }
  if (kind === 'macd') {
    const fast = ema(close, 12), slow = ema(close, 26), line = fast.map((v,i) => v === null || slow[i] === null ? null : v - slow[i]!);
    const signal = ema(line, 9); return [line, signal, line.map((v,i) => v === null || signal[i] === null ? null : v - signal[i]!)];
  }
  let day = '', value = 0, volume = 0;
  return [bars.map(b => { const d = istDay(Date.parse(b.time)); if (d !== day) { day = d; value = 0; volume = 0; } value += (b.high + b.low + b.close) / 3 * b.volume; volume += b.volume; return volume ? value / volume : null; })];
}
export function plotIndicator(config: ChartIndicator, source: ChartBar[], target: ChartBar[], frame: StockTimeframe, now: number): IndicatorLine[] {
  const sourceFrame = config.timeframe === 'chart' ? frame : config.timeframe;
  if (config.kind === 'vwap' && !isIntraday(sourceFrame)) return [];
  const bars = config.strategy || sourceFrame !== frame ? source.filter(b => barEnd(b.time, sourceFrame) <= now) : source;
  const values = indicatorValues(bars, config.kind, config.period).map(series => config.offset ? series.map((_,i) => i >= config.offset! ? series[i-config.offset!] : null) : series);
  const overlay = ['ema', 'sma', 'vwap', 'bollinger', 'supertrend'].includes(config.kind);
  return values.map((series, index) => {
    let cursor = -1;
    const points = sourceFrame === frame ? bars.flatMap((b,i) => series[i] === null ? [] : [{ time: b.time, value: series[i]! }]) : target.flatMap(b => {
      const end = Math.min(now, barEnd(b.time, frame));
      while (cursor + 1 < bars.length && barEnd(bars[cursor+1].time, sourceFrame) <= end) cursor++;
      return cursor >= 0 && series[cursor] !== null ? [{ time: b.time, value: series[cursor]! }] : [];
    });
    const suffix = config.kind === 'bollinger' ? [' · Upper', ' · Middle', ' · Lower'][index] : index === 1 ? ' · Signal' : index === 2 ? ' · Histogram' : '';
    return { id: `${config.id}-${index}`, label: indicatorLabel(config, frame) + suffix, color: index === 1 ? '#c58822' : config.color, pane: overlay ? 'price' : config.id, histogram: config.kind === 'macd' && index === 2, values: points };
  });
}
