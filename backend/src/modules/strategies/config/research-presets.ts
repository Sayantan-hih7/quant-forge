import type { StrategyDraft, Risk } from '../validations/strategy.validation.js';

type Condition = { left: string; leftFrame: string; operator: string; rightType: string; right: string; rightFrame: string; value: number; multiplier: number; tolerance: number };
const c = (left: string, frame: string, operator: string, right: string | number, tolerance = 2): Condition => ({
  left, leftFrame: frame, operator, rightType: typeof right === 'number' ? 'value' : 'indicator',
  right: typeof right === 'string' ? right : 'ema20', rightFrame: frame, value: typeof right === 'number' ? right : 0, multiplier: 1, tolerance,
});
const risk: Risk = { initialCapital: 100000, riskPercent: 1, maxPositions: 4, timeframe: '1d', stopMode: 'ATR', stopPercent: 4,
  atrPeriod: 14, atrMultiplier: 2, targetR: 2, overnight: true, slippagePercent: 0.05, feePercent: 0.1 };
function rule(side: 'BUY' | 'SELL', horizon: string, cadence: string, description: string, conditions: Condition[], logic = 'AND') {
  return { name: side === 'BUY' ? 'Buy entry' : 'Sell exit', description, tier: 'tactical', horizon, side, cadence, logic: 'AND', groups: [{ logic, conditions }] };
}
export interface ResearchPreset { key: string; id: string; title: string; summary: string; days: number; draft: StrategyDraft }
export const researchPresets: ResearchPreset[] = [
  { key: 'intraday', id: '593c7c89-a362-4f30-a334-f1d43c000001', title: 'Intraday · VWAP momentum', days: 30,
    summary: '5-minute momentum above VWAP, with a daily trend filter. Exit on weakness or before the session ends.',
    draft: { name: 'Intraday · VWAP momentum',
      entry: rule('BUY', 'intraday', '5m', 'Daily close above SMA 200; 5-minute close above VWAP, EMA 5 above EMA 20 and relative volume at least 1.3.', [c('close', '1d', 'gt', 'sma200'), c('close', '5m', 'gt', 'vwap'), c('ema5', '5m', 'gt', 'ema20'), c('rvol', '5m', 'gte', 1.3)]),
      exit: rule('SELL', 'intraday', '5m', 'Exit when a 5-minute close falls below VWAP or EMA 5 falls below EMA 20. Protective exits remain active.', [c('close', '5m', 'lt', 'vwap'), c('ema5', '5m', 'lt', 'ema20')], 'OR'),
      risk: { ...risk, riskPercent: 0.5, timeframe: '5m', overnight: false, atrMultiplier: 2, slippagePercent: 0.02, feePercent: 0.03 } } },
  { key: 'swing', id: '593c7c89-a362-4f30-a334-f1d43c000002', title: 'Swing · Trend pullback', days: 365,
    summary: 'Daily uptrend near EMA 20 with RSI confirmation. Hold overnight; sell when the trend or momentum weakens.',
    draft: { name: 'Swing · Trend pullback',
      entry: rule('BUY', 'swing', 'daily', 'Daily close above SMA 200 and EMA 20; EMA 5 above EMA 20; close within 3% of EMA 20 and RSI at least 50.', [c('close', '1d', 'gt', 'sma200'), c('ema5', '1d', 'gt', 'ema20'), c('close', '1d', 'gt', 'ema20'), c('close', '1d', 'within', 'ema20', 3), c('rsi', '1d', 'gte', 50)]),
      exit: rule('SELL', 'swing', 'daily', 'Exit when daily close falls below EMA 20 or daily RSI falls below 45.', [c('close', '1d', 'lt', 'ema20'), c('rsi', '1d', 'lt', 45)], 'OR'),
      risk: { ...risk, atrMultiplier: 2.5, targetR: 3 } } },
  { key: 'long-term', id: '593c7c89-a362-4f30-a334-f1d43c000003', title: 'Long term · Weekly trend', days: 1095,
    summary: 'Completed weekly trend plus a daily SMA 200 filter. A wider trailing stop allows longer holding periods.',
    draft: { name: 'Long term · Weekly trend',
      entry: rule('BUY', 'long-term', 'daily', 'Daily close above SMA 200; completed weekly close above EMA 20 and weekly EMA 5 above EMA 20.', [c('close', '1d', 'gt', 'sma200'), c('close', '1w', 'gt', 'ema20'), c('ema5', '1w', 'gt', 'ema20')]),
      exit: rule('SELL', 'long-term', 'daily', 'Exit when the completed weekly close falls below weekly EMA 20. A 10% trailing stop also protects the position.', [c('close', '1w', 'lt', 'ema20')]),
      risk: { ...risk, stopMode: 'trailing', stopPercent: 10, targetR: 5 } } },
];
