import type { ChartBar, StockTimeframe } from '../types';
import type { SavedStrategy } from '../../strategies/hooks/useBackendStrategies';
import { barEnd, bucketTime, istDay } from './chartTime';

import { indicatorCatalog, indicatorKinds, indicatorName, usesPriceSource, type IndicatorKind, type CalculationSettings, type PriceSource } from './indicatorCatalog';
import { extendedValues, average } from './extendedIndicators';
import { pivotPoints } from './pivotPoints';
import { ruleFields } from '../../qualification/config/ruleFields';
export { indicatorKinds, indicatorName, usesPriceSource, fixedPeriodIndicators } from './indicatorCatalog';
export type { IndicatorKind, PriceSource, VwapAnchor } from './indicatorCatalog';
export interface IndicatorSettings extends CalculationSettings { period?: number; lineWidth?: 1 | 2 | 3 | 4; visible?: boolean; lineStyles?: Record<string, { color?: string; visible?: boolean }>; showCrosses?: boolean; crossDirection?: 'both' | 'above' | 'below' }
export interface ChartIndicator extends IndicatorSettings { id: string; kind: IndicatorKind; period: number; timeframe: StockTimeframe | 'chart'; offset?: number; strategy?: boolean; strategySettings?: CalculationSettings; color: string }
export interface IndicatorCross { time: string; direction: 'above' | 'below'; label: string }
export interface IndicatorLine { id: string; label: string; color: string; lineWidth?: 1 | 2 | 3 | 4; pane: string; histogram?: boolean; histogramColor?: string; guides?: number[]; cloud?: 'a' | 'b'; markers?: IndicatorCross[]; values: { time: string; value: number }[] }
export const indicatorColors = ['#8064d8', '#c58822', '#168b8b', '#4076d9', '#cb5384', '#699038'];
export const indicatorFrame = (i: ChartIndicator, frame: StockTimeframe): StockTimeframe => {
  const selected = i.timeframe === 'chart' ? frame : i.timeframe;
  if (i.kind === 'pivots') return '1d';
  // Weekly/monthly VWAP displays are built from daily observations, so a
  // session anchor never accidentally treats a whole month as one session.
  return i.kind === 'vwap' && ['1w', '1mo'].includes(selected) ? '1d' : selected;
};
export const indicatorLabel = (i: ChartIndicator, frame: StockTimeframe) => {
  const settings = i.kind === 'maCross' ? ` ${(i.maType ?? 'ema').toUpperCase()} ${i.fastPeriod ?? 9}/${i.slowPeriod ?? 21}` : i.kind === 'connorsRsi' ? ` ${i.period}/${i.streakPeriod ?? 2}/${i.rankPeriod ?? 100}` : i.kind === 'averagePrice' ? ` ? ${(i.source ?? 'ohlc4').toUpperCase()}` : i.kind === 'macd' ? ` ${i.fastPeriod ?? 12}/${i.slowPeriod ?? 26}/${i.signalPeriod ?? 9}` : i.kind === 'vwap' ? ` · ${i.anchor === 'custom' ? `from ${i.anchorDate}` : i.anchor ?? 'session'}` : i.kind === 'supertrend' ? ` ${i.period}/${i.multiplier ?? 3}` : i.kind === 'relativeStrength' ? ` ${i.period} vs ${i.benchmark ?? 'NIFTY 50'}` : i.kind === 'benchmarkClose' || i.kind === 'benchmarkEma' ? ` ${i.kind === 'benchmarkEma' ? i.period : ''} ${i.benchmark ?? 'NIFTY 50'}` : i.kind === 'pivots' ? ` ? ${i.pivotType ?? 'traditional'} ${i.pivotFrame ?? '1mo'}` : indicatorCatalog[i.kind].period === null ? '' : ` ${i.period}`;
  return `${indicatorName(i.kind)}${settings} · ${indicatorFrame(i, frame)}${i.kind !== 'averagePrice' && i.source && usesPriceSource(i.kind) ? ` · ${i.source.toUpperCase()}` : ''}${i.offset ? ` · ${i.offset} candles earlier` : ''}${i.strategy ? ' · Strategy' : ''}`;
};
export const defaultIndicators: ChartIndicator[] = [5, 21].map((period, n) => ({ id: `default-${period}`, kind: 'ema', period, timeframe: 'chart', color: indicatorColors[n] }));
export function strategyIndicators(strategy?: SavedStrategy) {
  const indicators: ChartIndicator[] = [], unsupported = new Set<string>();
  const add = (field: string, timeframe: string, period?: number, offset = 0, options?: CalculationSettings) => {
    // Body-relative conditions still need their reference EMA on the price chart.
    if (field === 'bodyAboveEma' || field === 'bodyBelowEma') field = 'ema';
    if (field === 'bollingerUpper' || field === 'bollingerLower') field = 'bollinger';
    const ma = /^(ema|sma)(\d+)?$/.exec(field), kind = (ma?.[1] ?? ruleFields[field]?.indicator ?? field) as IndicatorKind;
    if (!indicatorKinds.includes(kind)) {
      if (!['close', 'open', 'high', 'low', 'volume'].includes(field)) unsupported.add(field);
      return;
    }
    if (!['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo'].includes(timeframe)) { unsupported.add(`${field} (${timeframe})`); return; }
    const n = ma?.[2] ? Number(ma[2]) : period ?? indicatorCatalog[kind].period ?? 14, id = `${kind}-${n}-${timeframe}-${offset}-${JSON.stringify(options ?? {})}`;
    if (!indicators.some(i => i.id === id)) indicators.push({ ...options, strategySettings: options, id, kind, period: n, offset, timeframe: timeframe as StockTimeframe, strategy: true, color: indicatorColors[indicators.length % indicatorColors.length] });
  };
  if (strategy) {
    for (const rule of [strategy.entry, strategy.exit].filter(rule => rule.enabled !== false)) for (const group of rule.groups) for (const c of group.conditions) {
      add(c.left, c.leftFrame, c.leftPeriod, c.leftOffset, c.leftSettings);
      if (c.rightType === 'indicator') add(c.right, c.rightFrame, c.rightPeriod, c.rightOffset, c.rightSettings);
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
export function sourceValue(b: ChartBar, source: PriceSource) {
  return source === 'hl2' ? (b.high + b.low) / 2 : source === 'hlc3' ? (b.high + b.low + b.close) / 3 : source === 'ohlc4' ? (b.open + b.high + b.low + b.close) / 4 : b[source];
}
export function indicatorValues(bars: ChartBar[], kind: IndicatorKind, n: number, settings: IndicatorSettings = {}): (number | null)[][] {
  const extended = extendedValues(bars, kind, n, settings);
  if (extended) return extended;
  const close = bars.map(b => sourceValue(b, settings.source ?? 'close'));
  if (kind === 'ema') return [ema(close, n)];
  if (kind === 'sma' || kind === 'rvol' || kind === 'volumeSma') {
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
    const middle = average(close, n, settings.maType ?? 'sma', bars.map(b => b.volume)), means = average(close,n), multiplier = settings.multiplier ?? 2;
    const sd = means.map((mean, i) => mean === null ? null : Math.sqrt(close.slice(i - n + 1, i + 1).reduce((sum, v) => sum + (v - mean) ** 2, 0) / (settings.deviation === 'population' ? n : n - 1)));
    return kind === 'bollingerBandwidth' ? [middle.map((m,i) => !m || sd[i] === null ? null : 200 * multiplier * sd[i]! / m)] :
      [middle.map((m,i) => m === null ? null : m + multiplier * sd[i]!), middle, middle.map((m,i) => m === null ? null : m - multiplier * sd[i]!)];
  }
  if (['adx', 'diPlus', 'diMinus'].includes(kind)) {
    const tr = indicatorValues(bars, 'atr', n)[0];
    const up = bars.map((b,i) => i ? b.high - bars[i-1].high : 0), down = bars.map((b,i) => i ? bars[i-1].low - b.low : 0);
    const plus = rma(up.map((v,i) => v > down[i] && v > 0 ? v : 0), n).map((v,i) => v === null || !tr[i] ? null : 100 * v / tr[i]!);
    const minus = rma(down.map((v,i) => v > up[i] && v > 0 ? v : 0), n).map((v,i) => v === null || !tr[i] ? null : 100 * v / tr[i]!);
    if (kind === 'diPlus') return [plus];
    if (kind === 'diMinus') return [minus];
    return [rma(plus.map((p,i) => p === null || minus[i] === null || p + minus[i]! === 0 ? null : 100 * Math.abs(p - minus[i]!) / (p + minus[i]!)), settings.adxSmoothing ?? n), plus, minus];
  }
  if (kind === 'supertrend') {
    const atr = indicatorValues(bars, 'atr', settings.period ?? n)[0], multiplier = settings.multiplier ?? 3;
    let previousUpper = 0, previousLower = 0, previousLine: number | null = null;
    return [bars.map((b,i) => {
      if (atr[i] === null) return null;
      let upper = (b.high + b.low) / 2 + multiplier * atr[i]!, lower = (b.high + b.low) / 2 - multiplier * atr[i]!;
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
    const fast = ema(close, settings.fastPeriod ?? 12), slow = ema(close, settings.slowPeriod ?? 26), line = fast.map((v,i) => v === null || slow[i] === null ? null : v - slow[i]!);
    const signal = ema(line, settings.signalPeriod ?? 9); return [line, signal, line.map((v,i) => v === null || signal[i] === null ? null : v - signal[i]!)];
  }
  if (kind !== 'vwap') return [bars.map(() => null)];
  let day = '', value = 0, volume = 0;
  return [bars.map(b => {
    const at = Date.parse(b.time), anchor = settings.anchor ?? 'session';
    if (anchor === 'custom' && (!settings.anchorDate || (settings.anchorTime ? at < Date.parse(`${settings.anchorDate}T${settings.anchorTime}:00+05:30`) : istDay(at) < settings.anchorDate))) return null;
    const d = anchor === 'custom' ? settings.anchorDate! : anchor === 'week' ? bucketTime(at, '1w') : anchor === 'month' ? bucketTime(at, '1mo') : istDay(at);
    if (d !== day) { day = d; value = 0; volume = 0; }
    value += sourceValue(b, settings.source ?? 'hlc3') * b.volume; volume += b.volume;
    return volume ? value / volume : null;
  })];
}
export function plotIndicator(config: ChartIndicator, source: ChartBar[], target: ChartBar[], frame: StockTimeframe, now: number, benchmark?: ChartBar[], pivotBars?: ChartBar[]): IndicatorLine[] {
  if (config.visible === false) return [];
  if (config.strategy) config = { ...config, ...Object.fromEntries(Object.keys(indicatorCatalog[config.kind].settings).map(key => [key, config.strategySettings?.[key as keyof CalculationSettings]])) };
  if(config.kind==='pivots'){
    const sourceFrame = config.timeframe === 'chart' ? frame : config.timeframe;
    const ruleBars = sourceFrame === frame ? target : pivotBars ?? [];
    const raw = pivotPoints(source, ruleBars, config);
    const shifted = raw.map((_, i) => i >= (config.offset ?? 0) ? raw[i - (config.offset ?? 0)] : null);
    let cursor = -1;
    const levels = sourceFrame === frame ? shifted : target.map(b => {
      const end = Math.min(now, barEnd(b.time, frame));
      while (cursor + 1 < ruleBars.length && barEnd(ruleBars[cursor + 1].time, sourceFrame) <= end) cursor++;
      return cursor >= 0 ? shifted[cursor] : null;
    });
    return styleLines(config, indicatorCatalog.pivots.lines.map((label,index)=>({id:`${config.id}-${index}`,label:`${label} · ${config.pivotType??'traditional'} ${config.pivotFrame??'1mo'}`,color:config.color,lineWidth:config.lineWidth??1,pane:'price',values:target.flatMap((b,i)=>levels[i]?[{time:b.time,value:levels[i]![index]}]:[])})));
  }
  const sourceFrame = indicatorFrame(config, frame);
  const bars = config.strategy || sourceFrame !== frame ? source.filter(b => barEnd(b.time, sourceFrame) <= now) : source;
  const effective = config.strategy ? {...config.strategySettings,period:config.period} : config;
  let calculated = indicatorValues(bars, config.kind, config.period, effective);
  if (config.kind === 'relativeStrength') {
    if (!benchmark) return [];
    const comparison=new Map(benchmark.filter(b=>barEnd(b.time,sourceFrame)<=now).map(b=>[bucketTime(Date.parse(b.time),sourceFrame),b.close]));
    const ratios=bars.map(b=>{const close=comparison.get(bucketTime(Date.parse(b.time),sourceFrame));return close&&close>0?b.close/close:null;});
    calculated=[ratios.map((v,i)=>i<config.period||v===null||ratios.slice(i-config.period,i+1).some(x=>x===null)?null:(v/ratios[i-config.period]!-1)*100)];
  }
  if (config.kind === 'benchmarkClose' || config.kind === 'benchmarkEma') {
    if (!benchmark) return [];
    const closed = benchmark.filter(b => barEnd(b.time, sourceFrame) <= now);
    const raw = config.kind === 'benchmarkClose' ? closed.map(b => b.close) : indicatorValues(closed, 'ema', config.period, {})[0];
    const byTime = new Map(closed.map((b,i) => [bucketTime(Date.parse(b.time),sourceFrame),raw[i]]));
    calculated = [bars.map(b => byTime.get(bucketTime(Date.parse(b.time),sourceFrame)) ?? null)];
  }
  const values = calculated.map(series => config.offset ? series.map((_,i) => i >= config.offset! ? series[i-config.offset!] : null) : series);
  const overlay = indicatorCatalog[config.kind].pane === 'price';
  const plots: IndicatorLine[] = values.map((series, index) => {
    let cursor = -1;
    const points = sourceFrame === frame ? bars.flatMap((b,i) => series[i] === null ? [] : [{ time: b.time, value: series[i]! }]) : target.flatMap(b => {
      const end = Math.min(now, barEnd(b.time, frame));
      while (cursor + 1 < bars.length && barEnd(bars[cursor+1].time, sourceFrame) <= end) cursor++;
      return cursor >= 0 && series[cursor] !== null ? [{ time: b.time, value: series[cursor]! }] : [];
    });
    const suffix = values.length > 1 ? ` · ${indicatorCatalog[config.kind].lines[index] ?? index+1}` : '';
    return { id: `${config.id}-${index}`, label: indicatorLabel(config, frame) + suffix, color: index === 1 ? '#c58822' : config.color, lineWidth: config.lineWidth ?? 1, pane: overlay ? 'price' : config.kind === 'volumeSma' ? 'volume' : config.id, cloud: config.kind==='ichimoku' && index===2 ? 'a' : config.kind==='ichimoku' && index===3 ? 'b' : undefined, guides: index === 0 && ['rsi','connorsRsi'].includes(config.kind) ? [config.oversold ?? (config.kind==='connorsRsi'?10:30), config.overbought ?? (config.kind==='connorsRsi'?90:70)] : undefined, histogram: config.kind === 'macd' && index === 2, values: points };
  });
  const styled = styleLines(config, plots);
  if (config.kind === 'maCross' && config.showCrosses !== false && styled.length) styled[0].markers = crossoverMarkers(bars, values, target, sourceFrame, frame, now, config.crossDirection ?? 'both', `${(config.maType ?? 'ema').toUpperCase()} ${config.fastPeriod ?? 9}/${config.slowPeriod ?? 21}`);
  return styled;
}

function styleLines(config: ChartIndicator, plots: IndicatorLine[]): IndicatorLine[] {
  return plots.flatMap((p,index) => config.lineStyles?.[index]?.visible === false ? [] : [{...p,color:config.lineStyles?.[index]?.color ?? p.color,histogramColor:p.histogram?config.lineStyles?.[index]?.color:undefined}]);
}

/** Mark completed crossover candles, never a forming candle or a repeated higher-frame value. */
export function crossoverMarkers(source: ChartBar[], values: (number|null)[][], target: ChartBar[], sourceFrame: StockTimeframe, frame: StockTimeframe, now: number, direction: 'both'|'above'|'below' = 'both', label = 'MA'): IndicatorCross[] {
  const [fast,slow]=values,result:IndicatorCross[]=[];
  let cursor=0;
  for(let i=1;i<source.length;i++) {
    const end=barEnd(source[i].time,sourceFrame);
    if(end>now || [fast[i-1],slow[i-1],fast[i],slow[i]].some(v=>v==null))continue;
    const cross=fast[i-1]!<=slow[i-1]! && fast[i]!>slow[i]!?'above':fast[i-1]!>=slow[i-1]! && fast[i]!<slow[i]!?'below':undefined;
    if(!cross || direction!=='both'&&direction!==cross)continue;
    while(cursor<target.length && barEnd(target[cursor].time,frame)<end)cursor++;
    if(cursor<target.length && barEnd(target[cursor].time,frame)<=now && Date.parse(target[cursor].time)<end)result.push({time:target[cursor].time,direction:cross,label:`${label} cross ${cross}`});
  }
  return result;
}
