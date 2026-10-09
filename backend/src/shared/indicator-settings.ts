import catalog from '@quantforge/rule-catalog/indicators.json' with { type: 'json' };

export type IndicatorKind = keyof typeof catalog;
export type PriceSource = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';
export type VwapAnchor = 'session' | 'week' | 'month' | 'custom';
export interface CalculationSettings {
  source?: PriceSource; anchor?: VwapAnchor; anchorDate?: string; anchorTime?: string;
  fastPeriod?: number; slowPeriod?: number; signalPeriod?: number; multiplier?: number;
  deviation?: 'sample' | 'population';
  maType?: 'sma' | 'ema' | 'wma' | 'vwma' | 'hma' | 'dema'; atrPeriod?: number;
  start?: number; increment?: number; maximum?: number;
  conversionPeriod?: number; basePeriod?: number; spanPeriod?: number; displacement?: number;
  smoothK?: number; dPeriod?: number; stochPeriod?: number; adxSmoothing?: number;
  streakPeriod?: number; rankPeriod?: number; maPeriod?: number; overbought?: number; oversold?: number;
  pivotType?: 'traditional' | 'fibonacci' | 'camarilla'; pivotFrame?: '1d' | '1w' | '1mo';
  benchmark?: 'NIFTY 50' | 'NIFTY BANK' | 'SENSEX' | 'NIFTY IT' | 'NIFTY AUTO' | 'NIFTY FMCG' | 'NIFTY PHARMA' | 'NIFTY METAL' | 'NIFTY REALTY' | 'NIFTY ENERGY' | 'NIFTY FIN SERVICE' | 'NIFTY PSU BANK' | 'NIFTY PVT BANK' | 'NIFTY HEALTHCARE';
}
export interface SettingSpec { label: string; type: string; default?: string | number; min?: number; max?: number; integer?: boolean; options?: string[] }
export interface IndicatorDefinition { label: string; pane: string; period: number | null; settings: Record<string, SettingSpec>; lines: string[]; description: string }
export const indicatorCatalog: Record<IndicatorKind, IndicatorDefinition> = catalog;
export const indicatorKinds = Object.keys(catalog) as IndicatorKind[];
export const fixedPeriodIndicators = indicatorKinds.filter(k => catalog[k].period === null);
export const indicatorName = (kind: IndicatorKind) => indicatorCatalog[kind].label;
export const usesPriceSource = (kind: IndicatorKind) => !!indicatorCatalog[kind].settings.source;
export function settingsError(kind: string | undefined, settings: CalculationSettings | undefined, chart = false) {
  if (!settings || !Object.keys(settings).length) return;
  const definition = indicatorCatalog[kind as IndicatorKind];
  if (!definition) return 'This field has no configurable indicator settings';
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) continue;
    const spec = definition.settings[key];
    if (!spec || !chart && ['overbought', 'oversold', 'maPeriod'].includes(key)) return `Unsupported setting: ${key}`;
    if (spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min! || value > spec.max! || spec.integer && !Number.isInteger(value))) return `${spec.label}: choose ${spec.min}–${spec.max}`;
    if (spec.type === 'select' && !spec.options?.includes(String(value))) return `Choose a supported ${spec.label.toLowerCase()}`;
    if (spec.type === 'date' && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) return 'Choose a valid anchor date';
    if (spec.type === 'time' && value !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) return 'Choose an anchor time in HH:mm format';
  }
  if ((kind === 'macd' || kind === 'maCross') && (settings.fastPeriod ?? (kind === 'macd' ? 12 : 9)) >= (settings.slowPeriod ?? (kind === 'macd' ? 26 : 21))) return 'Fast period must be smaller than slow period';
  if (kind === 'sar' && Math.max(settings.start ?? .02, settings.increment ?? .02) > (settings.maximum ?? .2)) return 'Maximum must be at least Start and Increment';
  if (['rsi', 'connorsRsi'].includes(kind ?? '') && (settings.oversold ?? (kind === 'connorsRsi' ? 10 : 30)) >= (settings.overbought ?? (kind === 'connorsRsi' ? 90 : 70))) return 'Oversold must be below Overbought';
  if (kind === 'vwap' && settings.anchor === 'custom' && !settings.anchorDate) return 'Choose an anchor date';
}
export function calculationSettings(kind: IndicatorKind, input: CalculationSettings): CalculationSettings {
  return Object.fromEntries(Object.keys(indicatorCatalog[kind].settings).flatMap(k => input[k as keyof CalculationSettings] === undefined ? [] : [[k, input[k as keyof CalculationSettings]]]));
}
export function settingDefaults(kind: IndicatorKind): CalculationSettings {
  return Object.fromEntries(Object.entries(indicatorCatalog[kind].settings).flatMap(([k,s]) => s.default === undefined ? [] : [[k,s.default]]));
}
export function requiredCandles(kind: IndicatorKind, n: number, s: CalculationSettings = {}): number {
  if ((kind === 'bollinger' || kind === 'bollingerBandwidth') && s.maType === 'dema') return 2 * n - 1;
  if (kind === 'dema') return 2 * n - 1;
  if (kind === 'averagePrice' || kind === 'benchmarkClose') return 1;
  if (kind === 'connorsRsi') return Math.max(n + 1, (s.streakPeriod ?? 2) + 1, (s.rankPeriod ?? 100) + 2);
  if (kind === 'maCross') return Math.max(requiredCandles(s.maType ?? 'ema', s.fastPeriod ?? 9), requiredCandles(s.maType ?? 'ema', s.slowPeriod ?? 21)) + 1;
  if (kind === 'macd') return (s.slowPeriod ?? 26) + (s.signalPeriod ?? 9) - 1;
  if (kind === 'adx') return n + (s.adxSmoothing ?? n) - 1;
  if (kind === 'stochastic') return n + (s.smoothK ?? 3) + (s.dPeriod ?? 3) - 2;
  if (kind === 'stochRsi') return n + (s.stochPeriod ?? 14) + (s.smoothK ?? 3) + (s.dPeriod ?? 3) - 2;
  if (kind === 'ichimoku') return Math.max(s.conversionPeriod ?? 9, s.basePeriod ?? 26, s.spanPeriod ?? 52) + (s.displacement ?? 26);
  if (kind === 'hma') return n + Math.floor(Math.sqrt(n)) - 1;
  if (kind === 'keltner') return Math.max(n, s.atrPeriod ?? 10);
  if (['roc','momentum','mfi','aroon','relativeStrength','rsi','rvol'].includes(kind)) return n + 1;
  if (kind === 'obv') return Math.max(1, s.maPeriod ?? 0);
  if (['vwap','accDist'].includes(kind)) return 1;
  if (kind === 'sar') return 2;
  if (kind === 'pivots') return 2;
  return n;
}

/** Rule operands can use one line of a study without waiting for unrelated lines. */
export function fieldRequiredCandles(field: string, kind: IndicatorKind, n: number, s: CalculationSettings = {}): number {
  if (field === 'macd') return s.slowPeriod ?? 26;
  if (field === 'ichimokuConversion') return s.conversionPeriod ?? 9;
  if (field === 'ichimokuBase') return s.basePeriod ?? 26;
  if (field === 'ichimokuA') return Math.max(s.conversionPeriod ?? 9, s.basePeriod ?? 26) + (s.displacement ?? 26);
  if (field === 'ichimokuB') return (s.spanPeriod ?? 52) + (s.displacement ?? 26);
  if (field === 'stochasticK') return n + (s.smoothK ?? 3) - 1;
  if (field === 'stochRsiK') return n + (s.stochPeriod ?? 14) + (s.smoothK ?? 3) - 1;
  return requiredCandles(kind, n, s);
}
