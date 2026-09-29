import type { Condition, Metric, Tier } from '../types';
import { allowedFrames } from './metrics';
import { ruleFields } from './ruleFields';

export type ConditionPresetId =
  | 'emaBullishCross' | 'emaBearishCross' | 'smaBullishCross' | 'smaBearishCross'
  | 'priceCrossAboveMa' | 'priceCrossBelowMa' | 'priceNearMa' | 'goldenCross' | 'deathCross'
  | 'rsiOversold' | 'rsiOverbought' | 'rsiBullishCross' | 'rsiBearishCross' | 'macdBullish' | 'macdBearish'
  | 'nDayHighBreakout' | 'nDayLowBreakdown' | 'high52wBreakout' | 'low52wBreakdown'
  | 'volumeSpike' | 'volumeDryUp' | 'atrExpansion'
  | 'bollingerBreakout' | 'bollingerBreakdown' | 'bollingerSqueeze'
  | 'adxStrongTrend' | 'adxBullishTrend' | 'adxBearishTrend'
  | 'supertrendBuy' | 'supertrendSell'
  | 'dojiCandle' | 'hammerCandle' | 'bullishEngulfing' | 'bearishEngulfing'
  | 'accumulation' | 'distribution'
  | 'vwapBullishCross' | 'vwapBearishCross' | 'priceAboveVwap' | 'priceBelowVwap'
  | 'custom';

interface SelectField { key: string; label: string; kind: 'select'; options: { value: string; label: string }[]; get: (c: Condition) => string; set: (value: string, c: Condition) => Partial<Condition> }
interface NumberField { key: string; label: string; kind: 'number'; min: number; max: number; step?: number; get: (c: Condition) => number | undefined; set: (value: number, c: Condition) => Partial<Condition> }
export type PresetField = SelectField | NumberField;

export interface ConditionPresetDef {
  id: ConditionPresetId;
  group: string;
  label: string;
  hint: string;
  /** Which field's frame list bounds the shared timeframe picker. */
  timeframeMetric: Metric;
  fields: PresetField[];
  defaults: (tier: Tier) => Condition;
  matches: (condition: Condition) => boolean;
}

const maOptions = [{ value: 'ema', label: 'EMA' }, { value: 'sma', label: 'SMA' }];
const base = (overrides: Partial<Condition>): Condition => ({
  left: 'close', leftFrame: '1d', operator: 'gt', rightType: 'value', value: 0,
  right: 'close', rightFrame: '1d', multiplier: 1, tolerance: 2, ...overrides,
});
const frame = (metric: Metric, tier: Tier) => allowedFrames(metric, tier)[0] ?? '1d';

export const conditionPresets: ConditionPresetDef[] = [
  // --- Crossovers ---
  {
    id: 'goldenCross', group: 'Crossovers', label: 'Golden cross', hint: 'A long moving average crosses above a longer one — a classic long-term bullish signal.',
    timeframeMetric: 'sma',
    fields: [
      { key: 'fastPeriod', label: 'Fast period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v, c) => ({ leftPeriod: v, right: c.right }) },
      { key: 'slowPeriod', label: 'Slow period', kind: 'number', min: 2, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) },
    ],
    defaults: tier => base({ left: 'sma', leftFrame: frame('sma', tier), leftPeriod: 50, operator: 'crossAbove', rightType: 'indicator', right: 'sma', rightFrame: frame('sma', tier), rightPeriod: 200 }),
    matches: c => c.operator === 'crossAbove' && c.left === 'sma' && c.right === 'sma' && (c.leftPeriod ?? 50) === 50 && (c.rightPeriod ?? 200) === 200,
  },
  {
    id: 'deathCross', group: 'Crossovers', label: 'Death cross', hint: 'A long moving average crosses below a longer one — a classic long-term bearish signal.',
    timeframeMetric: 'sma',
    fields: [
      { key: 'fastPeriod', label: 'Fast period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v, c) => ({ leftPeriod: v, right: c.right }) },
      { key: 'slowPeriod', label: 'Slow period', kind: 'number', min: 2, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) },
    ],
    defaults: tier => base({ left: 'sma', leftFrame: frame('sma', tier), leftPeriod: 50, operator: 'crossBelow', rightType: 'indicator', right: 'sma', rightFrame: frame('sma', tier), rightPeriod: 200 }),
    matches: c => c.operator === 'crossBelow' && c.left === 'sma' && c.right === 'sma' && (c.leftPeriod ?? 50) === 50 && (c.rightPeriod ?? 200) === 200,
  },
  {
    id: 'emaBullishCross', group: 'Crossovers', label: 'EMA crossover (bullish)', hint: 'A faster EMA crosses above a slower EMA.',
    timeframeMetric: 'ema',
    fields: [
      { key: 'fastPeriod', label: 'Fast EMA period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'slowPeriod', label: 'Slow EMA period', kind: 'number', min: 2, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) },
    ],
    defaults: tier => base({ left: 'ema', leftFrame: frame('ema', tier), leftPeriod: 5, operator: 'crossAbove', rightType: 'indicator', right: 'ema', rightFrame: frame('ema', tier), rightPeriod: 20 }),
    matches: c => c.operator === 'crossAbove' && c.rightType === 'indicator' && c.left === 'ema' && c.right === 'ema',
  },
  {
    id: 'emaBearishCross', group: 'Crossovers', label: 'EMA crossover (bearish)', hint: 'A faster EMA crosses below a slower EMA.',
    timeframeMetric: 'ema',
    fields: [
      { key: 'fastPeriod', label: 'Fast EMA period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'slowPeriod', label: 'Slow EMA period', kind: 'number', min: 2, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) },
    ],
    defaults: tier => base({ left: 'ema', leftFrame: frame('ema', tier), leftPeriod: 5, operator: 'crossBelow', rightType: 'indicator', right: 'ema', rightFrame: frame('ema', tier), rightPeriod: 20 }),
    matches: c => c.operator === 'crossBelow' && c.rightType === 'indicator' && c.left === 'ema' && c.right === 'ema',
  },
  {
    id: 'smaBullishCross', group: 'Crossovers', label: 'SMA crossover (bullish)', hint: 'A faster SMA crosses above a slower SMA. For the 50/200 pair, use Golden cross instead.',
    timeframeMetric: 'sma',
    fields: [
      { key: 'fastPeriod', label: 'Fast SMA period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'slowPeriod', label: 'Slow SMA period', kind: 'number', min: 2, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) },
    ],
    defaults: tier => base({ left: 'sma', leftFrame: frame('sma', tier), leftPeriod: 10, operator: 'crossAbove', rightType: 'indicator', right: 'sma', rightFrame: frame('sma', tier), rightPeriod: 30 }),
    matches: c => c.operator === 'crossAbove' && c.rightType === 'indicator' && c.left === 'sma' && c.right === 'sma',
  },
  {
    id: 'smaBearishCross', group: 'Crossovers', label: 'SMA crossover (bearish)', hint: 'A faster SMA crosses below a slower SMA. For the 50/200 pair, use Death cross instead.',
    timeframeMetric: 'sma',
    fields: [
      { key: 'fastPeriod', label: 'Fast SMA period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'slowPeriod', label: 'Slow SMA period', kind: 'number', min: 2, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) },
    ],
    defaults: tier => base({ left: 'sma', leftFrame: frame('sma', tier), leftPeriod: 10, operator: 'crossBelow', rightType: 'indicator', right: 'sma', rightFrame: frame('sma', tier), rightPeriod: 30 }),
    matches: c => c.operator === 'crossBelow' && c.rightType === 'indicator' && c.left === 'sma' && c.right === 'sma',
  },
  {
    id: 'priceCrossAboveMa', group: 'Crossovers', label: 'Price crosses above MA', hint: 'Close price crosses above a moving average.',
    timeframeMetric: 'ema',
    fields: [
      { key: 'maType', label: 'MA type', kind: 'select', options: maOptions, get: c => c.right, set: (v) => ({ right: v as Metric }) },
      { key: 'period', label: 'Period', kind: 'number', min: 2, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) },
    ],
    defaults: tier => base({ left: 'close', leftFrame: frame('close', tier), operator: 'crossAbove', rightType: 'indicator', right: 'ema', rightFrame: frame('ema', tier), rightPeriod: 20 }),
    matches: c => c.operator === 'crossAbove' && c.rightType === 'indicator' && c.left === 'close' && ['ema', 'sma'].includes(c.right),
  },
  {
    id: 'priceCrossBelowMa', group: 'Crossovers', label: 'Price crosses below MA', hint: 'Close price crosses below a moving average.',
    timeframeMetric: 'ema',
    fields: [
      { key: 'maType', label: 'MA type', kind: 'select', options: maOptions, get: c => c.right, set: (v) => ({ right: v as Metric }) },
      { key: 'period', label: 'Period', kind: 'number', min: 2, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) },
    ],
    defaults: tier => base({ left: 'close', leftFrame: frame('close', tier), operator: 'crossBelow', rightType: 'indicator', right: 'ema', rightFrame: frame('ema', tier), rightPeriod: 20 }),
    matches: c => c.operator === 'crossBelow' && c.rightType === 'indicator' && c.left === 'close' && ['ema', 'sma'].includes(c.right),
  },
  {
    id: 'priceNearMa', group: 'Crossovers', label: 'Price ≈ equal to MA', hint: 'Price stays within a percentage band of a moving average. Live prices essentially never match an indicator to the paisa, so "equal to" is expressed as a small tolerance band around it.',
    timeframeMetric: 'ema',
    fields: [
      { key: 'maType', label: 'MA type', kind: 'select', options: maOptions, get: c => c.right, set: (v) => ({ right: v as Metric }) },
      { key: 'period', label: 'Period', kind: 'number', min: 2, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) },
      { key: 'tolerance', label: 'Within (%)', kind: 'number', min: 0.1, max: 20, step: 0.1, get: c => c.tolerance, set: (v) => ({ tolerance: v }) },
    ],
    defaults: tier => base({ left: 'close', leftFrame: frame('close', tier), operator: 'within', rightType: 'indicator', right: 'ema', rightFrame: frame('ema', tier), rightPeriod: 20, tolerance: 0.5 }),
    matches: c => c.operator === 'within' && c.rightType === 'indicator' && c.left === 'close' && ['ema', 'sma'].includes(c.right),
  },
  // --- Momentum ---
  {
    id: 'rsiOversold', group: 'Momentum', label: 'RSI oversold', hint: 'RSI is below a level — commonly used to flag an oversold bounce candidate.',
    timeframeMetric: 'rsi',
    fields: [
      { key: 'period', label: 'RSI period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'level', label: 'Level', kind: 'number', min: 1, max: 99, get: c => c.value, set: (v) => ({ value: v }) },
    ],
    defaults: tier => base({ left: 'rsi', leftFrame: frame('rsi', tier), leftPeriod: 14, operator: 'lt', rightType: 'value', value: 30 }),
    matches: c => c.left === 'rsi' && c.operator === 'lt' && c.rightType === 'value',
  },
  {
    id: 'rsiOverbought', group: 'Momentum', label: 'RSI overbought', hint: 'RSI is above a level — commonly used to flag an overbought pullback candidate.',
    timeframeMetric: 'rsi',
    fields: [
      { key: 'period', label: 'RSI period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'level', label: 'Level', kind: 'number', min: 1, max: 99, get: c => c.value, set: (v) => ({ value: v }) },
    ],
    defaults: tier => base({ left: 'rsi', leftFrame: frame('rsi', tier), leftPeriod: 14, operator: 'gt', rightType: 'value', value: 70 }),
    matches: c => c.left === 'rsi' && c.operator === 'gt' && c.rightType === 'value',
  },
  {
    id: 'rsiBullishCross', group: 'Momentum', label: 'RSI bullish momentum', hint: 'RSI crosses above a level, e.g. climbing back above 30.',
    timeframeMetric: 'rsi',
    fields: [
      { key: 'period', label: 'RSI period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'level', label: 'Level', kind: 'number', min: 1, max: 99, get: c => c.value, set: (v) => ({ value: v }) },
    ],
    defaults: tier => base({ left: 'rsi', leftFrame: frame('rsi', tier), leftPeriod: 14, operator: 'crossAbove', rightType: 'value', value: 30 }),
    matches: c => c.left === 'rsi' && c.operator === 'crossAbove' && c.rightType === 'value',
  },
  {
    id: 'rsiBearishCross', group: 'Momentum', label: 'RSI bearish momentum', hint: 'RSI crosses below a level, e.g. dropping under 70.',
    timeframeMetric: 'rsi',
    fields: [
      { key: 'period', label: 'RSI period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'level', label: 'Level', kind: 'number', min: 1, max: 99, get: c => c.value, set: (v) => ({ value: v }) },
    ],
    defaults: tier => base({ left: 'rsi', leftFrame: frame('rsi', tier), leftPeriod: 14, operator: 'crossBelow', rightType: 'value', value: 70 }),
    matches: c => c.left === 'rsi' && c.operator === 'crossBelow' && c.rightType === 'value',
  },
  {
    id: 'macdBullish', group: 'Momentum', label: 'MACD bullish crossover', hint: 'MACD line crosses above its signal line. This app computes a fixed 12/26 MACD with a 9-period signal.',
    timeframeMetric: 'macd',
    fields: [],
    defaults: tier => base({ left: 'macd', leftFrame: frame('macd', tier), operator: 'crossAbove', rightType: 'indicator', right: 'macdSignal', rightFrame: frame('macd', tier) }),
    matches: c => c.left === 'macd' && c.right === 'macdSignal' && c.operator === 'crossAbove',
  },
  {
    id: 'macdBearish', group: 'Momentum', label: 'MACD bearish crossover', hint: 'MACD line crosses below its signal line. This app computes a fixed 12/26 MACD with a 9-period signal.',
    timeframeMetric: 'macd',
    fields: [],
    defaults: tier => base({ left: 'macd', leftFrame: frame('macd', tier), operator: 'crossBelow', rightType: 'indicator', right: 'macdSignal', rightFrame: frame('macd', tier) }),
    matches: c => c.left === 'macd' && c.right === 'macdSignal' && c.operator === 'crossBelow',
  },
  // --- Breakout ---
  {
    id: 'nDayHighBreakout', group: 'Breakout', label: 'N-day high breakout', hint: 'Close crosses above the highest high of the preceding N candles.',
    timeframeMetric: 'highestHigh',
    fields: [{ key: 'period', label: 'Lookback (candles)', kind: 'number', min: 2, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) }],
    defaults: tier => base({ left: 'close', leftFrame: frame('close', tier), operator: 'crossAbove', rightType: 'indicator', right: 'highestHigh', rightFrame: frame('highestHigh', tier), rightPeriod: 20, rightOffset: 1 }),
    matches: c => c.left === 'close' && c.right === 'highestHigh' && c.operator === 'crossAbove',
  },
  {
    id: 'nDayLowBreakdown', group: 'Breakout', label: 'N-day low breakdown', hint: 'Close crosses below the lowest low of the preceding N candles.',
    timeframeMetric: 'lowestLow',
    fields: [{ key: 'period', label: 'Lookback (candles)', kind: 'number', min: 2, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) }],
    defaults: tier => base({ left: 'close', leftFrame: frame('close', tier), operator: 'crossBelow', rightType: 'indicator', right: 'lowestLow', rightFrame: frame('lowestLow', tier), rightPeriod: 20, rightOffset: 1 }),
    matches: c => c.left === 'close' && c.right === 'lowestLow' && c.operator === 'crossBelow',
  },
  {
    id: 'high52wBreakout', group: 'Breakout', label: '52-week high breakout', hint: 'Close crosses above the 52-week high.',
    timeframeMetric: 'high52w',
    fields: [],
    defaults: tier => base({ left: 'close', leftFrame: frame('high52w', tier), operator: 'crossAbove', rightType: 'indicator', right: 'high52w', rightFrame: frame('high52w', tier), rightOffset: 1 }),
    matches: c => c.left === 'close' && c.right === 'high52w' && c.operator === 'crossAbove',
  },
  {
    id: 'low52wBreakdown', group: 'Breakout', label: '52-week low breakdown', hint: 'Close crosses below the 52-week low.',
    timeframeMetric: 'low52w',
    fields: [],
    defaults: tier => base({ left: 'close', leftFrame: frame('low52w', tier), operator: 'crossBelow', rightType: 'indicator', right: 'low52w', rightFrame: frame('low52w', tier), rightOffset: 1 }),
    matches: c => c.left === 'close' && c.right === 'low52w' && c.operator === 'crossBelow',
  },
  // --- Volume ---
  {
    id: 'volumeSpike', group: 'Volume', label: 'Volume spike', hint: 'Volume rises above a multiple of its recent average.',
    timeframeMetric: 'rvol',
    fields: [
      { key: 'period', label: 'Average period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'value', label: 'Multiplier ×', kind: 'number', min: 1, max: 100, step: 0.1, get: c => c.value, set: (v) => ({ value: v }) },
    ],
    defaults: tier => base({ left: 'rvol', leftFrame: frame('rvol', tier), leftPeriod: 20, operator: 'gt', rightType: 'value', value: 2 }),
    matches: c => c.left === 'rvol' && c.operator === 'gt' && c.rightType === 'value',
  },
  {
    id: 'volumeDryUp', group: 'Volume', label: 'Volume dry-up', hint: 'Volume falls well below its recent average — often precedes a breakout or signals fading interest.',
    timeframeMetric: 'rvol',
    fields: [
      { key: 'period', label: 'Average period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'value', label: 'Below multiplier ×', kind: 'number', min: 0.05, max: 1, step: 0.05, get: c => c.value, set: (v) => ({ value: v }) },
    ],
    defaults: tier => base({ left: 'rvol', leftFrame: frame('rvol', tier), leftPeriod: 20, operator: 'lt', rightType: 'value', value: 0.5 }),
    matches: c => c.left === 'rvol' && c.operator === 'lt' && c.rightType === 'value',
  },
  // --- Volatility ---
  {
    id: 'atrExpansion', group: 'Volatility', label: 'ATR expansion', hint: 'Current ATR is higher than it was some candles ago — volatility is picking up.',
    timeframeMetric: 'atr',
    fields: [
      { key: 'period', label: 'ATR period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v, rightPeriod: v }) },
      { key: 'lookback', label: 'Compared to (candles ago)', kind: 'number', min: 1, max: 120, get: c => c.rightOffset, set: (v) => ({ rightOffset: v }) },
    ],
    defaults: tier => base({ left: 'atr', leftFrame: frame('atr', tier), leftPeriod: 14, operator: 'gt', rightType: 'indicator', right: 'atr', rightFrame: frame('atr', tier), rightPeriod: 14, rightOffset: 5 }),
    matches: c => c.left === 'atr' && c.right === 'atr' && c.operator === 'gt' && c.rightType === 'indicator' && (c.rightOffset ?? 0) > 0,
  },
  {
    id: 'bollingerBreakout', group: 'Volatility', label: 'Bollinger breakout', hint: 'Close crosses above the Bollinger upper band.',
    timeframeMetric: 'bollingerUpper',
    fields: [{ key: 'period', label: 'Band period', kind: 'number', min: 5, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) }],
    defaults: tier => base({ left: 'close', leftFrame: frame('bollingerUpper', tier), operator: 'crossAbove', rightType: 'indicator', right: 'bollingerUpper', rightFrame: frame('bollingerUpper', tier), rightPeriod: 20 }),
    matches: c => c.left === 'close' && c.right === 'bollingerUpper' && c.operator === 'crossAbove',
  },
  {
    id: 'bollingerBreakdown', group: 'Volatility', label: 'Bollinger breakdown', hint: 'Close crosses below the Bollinger lower band.',
    timeframeMetric: 'bollingerLower',
    fields: [{ key: 'period', label: 'Band period', kind: 'number', min: 5, max: 500, get: c => c.rightPeriod, set: (v) => ({ rightPeriod: v }) }],
    defaults: tier => base({ left: 'close', leftFrame: frame('bollingerLower', tier), operator: 'crossBelow', rightType: 'indicator', right: 'bollingerLower', rightFrame: frame('bollingerLower', tier), rightPeriod: 20 }),
    matches: c => c.left === 'close' && c.right === 'bollingerLower' && c.operator === 'crossBelow',
  },
  {
    id: 'bollingerSqueeze', group: 'Volatility', label: 'Bollinger squeeze', hint: 'The bands are narrowing — volatility is contracting, often ahead of a sharp move.',
    timeframeMetric: 'bollingerBandwidth',
    fields: [
      { key: 'period', label: 'Band period', kind: 'number', min: 5, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'lookback', label: 'Over how many candles', kind: 'number', min: 2, max: 120, get: c => c.lookback, set: (v) => ({ lookback: v }) },
    ],
    defaults: tier => base({ left: 'bollingerBandwidth', leftFrame: frame('bollingerBandwidth', tier), leftPeriod: 20, operator: 'decreasing', rightType: 'value', value: 0, lookback: 5 }),
    matches: c => c.left === 'bollingerBandwidth' && c.operator === 'decreasing',
  },
  {
    id: 'adxStrongTrend', group: 'Trend', label: 'ADX strong trend', hint: 'ADX rises above a level — the current trend (up or down) has real strength, regardless of direction.',
    timeframeMetric: 'adx',
    fields: [
      { key: 'period', label: 'ADX period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v }) },
      { key: 'value', label: 'Minimum ADX', kind: 'number', min: 1, max: 100, get: c => c.value, set: (v) => ({ value: v }) },
    ],
    defaults: tier => base({ left: 'adx', leftFrame: frame('adx', tier), leftPeriod: 14, operator: 'gt', rightType: 'value', value: 25 }),
    matches: c => c.left === 'adx' && c.operator === 'gt' && c.rightType === 'value',
  },
  {
    id: 'adxBullishTrend', group: 'Trend', label: 'ADX bullish trend (+DI cross)', hint: '+DI crosses above -DI — directional momentum turns bullish. Pair with ADX strong trend to filter for strength too.',
    timeframeMetric: 'diPlus',
    fields: [{ key: 'period', label: 'DI period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v, rightPeriod: v }) }],
    defaults: tier => base({ left: 'diPlus', leftFrame: frame('diPlus', tier), leftPeriod: 14, operator: 'crossAbove', rightType: 'indicator', right: 'diMinus', rightFrame: frame('diPlus', tier), rightPeriod: 14 }),
    matches: c => c.left === 'diPlus' && c.right === 'diMinus' && c.operator === 'crossAbove',
  },
  {
    id: 'adxBearishTrend', group: 'Trend', label: 'ADX bearish trend (-DI cross)', hint: '-DI crosses above +DI — directional momentum turns bearish. Pair with ADX strong trend to filter for strength too.',
    timeframeMetric: 'diMinus',
    fields: [{ key: 'period', label: 'DI period', kind: 'number', min: 2, max: 500, get: c => c.leftPeriod, set: (v) => ({ leftPeriod: v, rightPeriod: v }) }],
    defaults: tier => base({ left: 'diMinus', leftFrame: frame('diMinus', tier), leftPeriod: 14, operator: 'crossAbove', rightType: 'indicator', right: 'diPlus', rightFrame: frame('diMinus', tier), rightPeriod: 14 }),
    matches: c => c.left === 'diMinus' && c.right === 'diPlus' && c.operator === 'crossAbove',
  },
  {
    id: 'supertrendBuy', group: 'Trend', label: 'Supertrend buy', hint: 'Close crosses above the Supertrend line (fixed 10-period ATR, 3x multiplier).',
    timeframeMetric: 'supertrend',
    fields: [],
    defaults: tier => base({ left: 'close', leftFrame: frame('supertrend', tier), operator: 'crossAbove', rightType: 'indicator', right: 'supertrend', rightFrame: frame('supertrend', tier) }),
    matches: c => c.left === 'close' && c.right === 'supertrend' && c.operator === 'crossAbove',
  },
  {
    id: 'supertrendSell', group: 'Trend', label: 'Supertrend sell', hint: 'Close crosses below the Supertrend line (fixed 10-period ATR, 3x multiplier).',
    timeframeMetric: 'supertrend',
    fields: [],
    defaults: tier => base({ left: 'close', leftFrame: frame('supertrend', tier), operator: 'crossBelow', rightType: 'indicator', right: 'supertrend', rightFrame: frame('supertrend', tier) }),
    matches: c => c.left === 'close' && c.right === 'supertrend' && c.operator === 'crossBelow',
  },
  // --- Patterns ---
  {
    id: 'dojiCandle', group: 'Patterns', label: 'Doji candle', hint: 'The candle body is tiny relative to its range — indecision between buyers and sellers.',
    timeframeMetric: 'doji',
    fields: [],
    defaults: tier => base({ left: 'doji', leftFrame: frame('doji', tier), operator: 'eq', rightType: 'value', value: 1 }),
    matches: c => c.left === 'doji' && c.operator === 'eq',
  },
  {
    id: 'hammerCandle', group: 'Patterns', label: 'Hammer candle', hint: 'A small body near the top of the range with a long lower wick — a potential bullish reversal shape.',
    timeframeMetric: 'hammer',
    fields: [],
    defaults: tier => base({ left: 'hammer', leftFrame: frame('hammer', tier), operator: 'eq', rightType: 'value', value: 1 }),
    matches: c => c.left === 'hammer' && c.operator === 'eq',
  },
  {
    id: 'bullishEngulfing', group: 'Patterns', label: 'Bullish engulfing', hint: "A bullish candle's body fully engulfs the prior bearish candle's body.",
    timeframeMetric: 'bullishEngulfing',
    fields: [],
    defaults: tier => base({ left: 'bullishEngulfing', leftFrame: frame('bullishEngulfing', tier), operator: 'eq', rightType: 'value', value: 1 }),
    matches: c => c.left === 'bullishEngulfing' && c.operator === 'eq',
  },
  {
    id: 'bearishEngulfing', group: 'Patterns', label: 'Bearish engulfing', hint: "A bearish candle's body fully engulfs the prior bullish candle's body.",
    timeframeMetric: 'bearishEngulfing',
    fields: [],
    defaults: tier => base({ left: 'bearishEngulfing', leftFrame: frame('bearishEngulfing', tier), operator: 'eq', rightType: 'value', value: 1 }),
    matches: c => c.left === 'bearishEngulfing' && c.operator === 'eq',
  },
  {
    id: 'accumulation', group: 'Patterns', label: 'Accumulation (A/D rising)', hint: 'The Accumulation/Distribution line has risen for several candles — buying pressure is building.',
    timeframeMetric: 'accDist',
    fields: [{ key: 'lookback', label: 'Over how many candles', kind: 'number', min: 2, max: 120, get: c => c.lookback, set: (v) => ({ lookback: v }) }],
    defaults: tier => base({ left: 'accDist', leftFrame: frame('accDist', tier), operator: 'increasing', rightType: 'value', value: 0, lookback: 3 }),
    matches: c => c.left === 'accDist' && c.operator === 'increasing',
  },
  {
    id: 'distribution', group: 'Patterns', label: 'Distribution (A/D falling)', hint: 'The Accumulation/Distribution line has fallen for several candles — selling pressure is building.',
    timeframeMetric: 'accDist',
    fields: [{ key: 'lookback', label: 'Over how many candles', kind: 'number', min: 2, max: 120, get: c => c.lookback, set: (v) => ({ lookback: v }) }],
    defaults: tier => base({ left: 'accDist', leftFrame: frame('accDist', tier), operator: 'decreasing', rightType: 'value', value: 0, lookback: 3 }),
    matches: c => c.left === 'accDist' && c.operator === 'decreasing',
  },
  // --- Intraday ---
  {
    id: 'vwapBullishCross', group: 'Intraday', label: 'VWAP bullish cross', hint: 'Close crosses above the session VWAP.',
    timeframeMetric: 'vwap',
    fields: [],
    defaults: tier => base({ left: 'close', leftFrame: frame('vwap', tier), operator: 'crossAbove', rightType: 'indicator', right: 'vwap', rightFrame: frame('vwap', tier) }),
    matches: c => c.left === 'close' && c.right === 'vwap' && c.operator === 'crossAbove',
  },
  {
    id: 'vwapBearishCross', group: 'Intraday', label: 'VWAP bearish cross', hint: 'Close crosses below the session VWAP.',
    timeframeMetric: 'vwap',
    fields: [],
    defaults: tier => base({ left: 'close', leftFrame: frame('vwap', tier), operator: 'crossBelow', rightType: 'indicator', right: 'vwap', rightFrame: frame('vwap', tier) }),
    matches: c => c.left === 'close' && c.right === 'vwap' && c.operator === 'crossBelow',
  },
  {
    id: 'priceAboveVwap', group: 'Intraday', label: 'Price above VWAP', hint: 'Close is currently above the session VWAP.',
    timeframeMetric: 'vwap',
    fields: [],
    defaults: tier => base({ left: 'close', leftFrame: frame('vwap', tier), operator: 'gt', rightType: 'indicator', right: 'vwap', rightFrame: frame('vwap', tier) }),
    matches: c => c.left === 'close' && c.right === 'vwap' && c.operator === 'gt',
  },
  {
    id: 'priceBelowVwap', group: 'Intraday', label: 'Price below VWAP', hint: 'Close is currently below the session VWAP.',
    timeframeMetric: 'vwap',
    fields: [],
    defaults: tier => base({ left: 'close', leftFrame: frame('vwap', tier), operator: 'lt', rightType: 'indicator', right: 'vwap', rightFrame: frame('vwap', tier) }),
    matches: c => c.left === 'close' && c.right === 'vwap' && c.operator === 'lt',
  },
];

export const conditionPresetGroups: { label: string; options: { value: ConditionPresetId; label: string }[] }[] = [
  ...[...new Set(conditionPresets.map(p => p.group))].map(group => ({
    label: group,
    options: conditionPresets.filter(p => p.group === group).map(p => ({ value: p.id, label: p.label })),
  })),
  { label: 'Advanced', options: [{ value: 'custom' as const, label: 'Custom condition' }] },
];

export function getPreset(id: ConditionPresetId): ConditionPresetDef | undefined {
  return conditionPresets.find(preset => preset.id === id);
}

/** First matching preset shape wins; more specific presets (e.g. Golden cross) must precede generic ones (Bullish MA crossover). */
export function presetForCondition(condition: Condition): ConditionPresetId {
  return conditionPresets.find(preset => {
    if (!preset.matches(condition)) return false;
    const expected = preset.defaults('tactical');
    if (preset.fields.some(field => field.get(condition) === undefined)) return false;
    const patches = preset.fields.map(field => field.kind === 'number' ? field.set(field.get(condition)!, condition) : field.set(field.get(condition), condition));
    const editable = new Set(patches.flatMap(patch => Object.keys(patch)));
    const effective = (c: Condition, key: keyof Condition) => {
      if (key === 'leftPeriod' || key === 'rightPeriod') return c[key] ?? ruleFields[key === 'leftPeriod' ? c.left : c.right]?.period?.default;
      if (key === 'leftOffset' || key === 'rightOffset') return c[key] ?? 0;
      if (key === 'lookback') return c.lookback ?? 1;
      return c[key];
    };
    if (condition.rightType === 'indicator' && condition.leftFrame !== condition.rightFrame) return false;
    // A single shared period control cannot represent two different operand periods.
    if (patches.some(patch => (Object.keys(patch) as (keyof Condition)[]).some(key =>
      effective(condition, key) !== effective({ ...condition, ...patch }, key)))) return false;
    const hidden: (keyof Condition)[] = ['rightType', 'leftPeriod', 'leftOffset',
      ...(condition.rightType === 'indicator' ? ['rightPeriod', 'rightOffset', 'multiplier'] as const : ['value'] as const),
      ...(['increasing', 'decreasing', 'crossAbove', 'crossBelow'].includes(condition.operator) ? ['lookback'] as const : []),
    ];
    return hidden.every(key => editable.has(key) || effective(condition, key) === effective(expected, key));
  })?.id ?? 'custom';
}
