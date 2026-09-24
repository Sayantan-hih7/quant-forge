import { stockIndices } from './stockIndices';
import type { MonthlyCategory, MonthlyCondition, MonthlyOperator, MonthlyRuleTemplate } from '../types/monthly';

export const monthlyCategories: { value: MonthlyCategory; label: string; description: string }[] = [
  { value: 'technical', label: 'Technical', description: 'Monthly indicators, crossovers and trend' },
  { value: 'price-volume', label: 'Price & Volume', description: 'Monthly price, delivery and liquidity' },
  { value: 'patterns', label: 'Patterns', description: 'Monthly chart and candlestick patterns' },
  { value: 'fundamentals', label: 'Fundamentals', description: 'Valuation, profitability and balance sheet' },
  { value: 'results-events', label: 'Results & Events', description: 'Reported results and events as of month-end' },
  { value: 'news', label: 'News & Sentiment', description: 'News during the completed month' },
  { value: 'ownership', label: 'Ownership', description: 'Promoter, institutional and pledge snapshots' },
  { value: 'sector-market', label: 'Sector & Market', description: 'Indices, sectors and relative strength' },
  { value: 'derivatives', label: 'F&O', description: 'Month-end derivatives and volatility' },
  { value: 'performance', label: 'Strategy Performance', description: 'Completed-month simulation statistics' },
];
type Choice = { value: string; label: string };
export interface MonthlyFieldDefinition {
  label: string; category: MonthlyCategory; kind: 'number' | 'category' | 'boolean' | 'text';
  unit?: string; series?: boolean; choices?: Choice[]; multiple?: boolean;
}
const choices = (...labels: string[]): Choice[] => labels.map((label) => ({ value: label, label }));
const numeric = (label: string, category: MonthlyCategory, unit: string, series = false): MonthlyFieldDefinition => ({ label, category, kind: 'number', unit, series });
const categorical = (label: string, category: MonthlyCategory, values: Choice[], multiple = false): MonthlyFieldDefinition => ({ label, category, kind: 'category', choices: values, multiple });
export const monthlyFields: Record<string, MonthlyFieldDefinition> = {
  ema5: numeric('EMA 5', 'technical', '₹', true), ema21: numeric('EMA 21', 'technical', '₹', true),
  sma50: numeric('SMA 50', 'technical', '₹', true), sma200: numeric('SMA 200', 'technical', '₹', true),
  rsi: numeric('RSI (14)', 'technical', 'points', true), adx: numeric('ADX (14)', 'technical', 'points', true),
  macd: numeric('MACD', 'technical', '₹', true), macdSignal: numeric('MACD signal', 'technical', '₹', true),
  close: numeric('Monthly close', 'price-volume', '₹', true), priceChange: numeric('Monthly price change', 'price-volume', '%', true),
  volume: numeric('Monthly volume', 'price-volume', 'shares', true), avgVolume6: numeric('6-month average volume', 'price-volume', 'shares', true),
  volumeRatio: numeric('Monthly volume ratio', 'price-volume', '×', true), delivery: numeric('Monthly delivery', 'price-volume', '%', true),
  tradedValue: numeric('Monthly traded value', 'price-volume', '₹ Cr', true),
  chartPattern: categorical('Chart pattern', 'patterns', choices('VCP', 'Cup & Handle', 'Double Bottom', 'Ascending Triangle', 'Flag', 'None')),
  patternState: categorical('Pattern status', 'patterns', choices('Detected', 'Breakout confirmed', 'Near breakout', 'Not detected')),
  candlePattern: categorical('Monthly candle pattern', 'patterns', choices('Bullish Engulfing', 'Bearish Engulfing', 'Hammer', 'Doji', 'Morning Star', 'None')),
  breakout: { label: 'Monthly breakout confirmed', category: 'patterns', kind: 'boolean', choices: choices('True', 'False') },
  marketCap: numeric('Market cap', 'fundamentals', '₹ Cr'), pe: numeric('P/E', 'fundamentals', 'ratio'),
  roe: numeric('Return on equity', 'fundamentals', '%'), roce: numeric('Return on capital employed', 'fundamentals', '%'),
  debtEquity: numeric('Debt / equity', 'fundamentals', 'ratio'), revenueGrowth: numeric('Reported revenue growth YoY', 'results-events', '%'),
  profitGrowth: numeric('Reported profit growth YoY', 'results-events', '%'), positiveQuarters: numeric('Consecutive positive quarters', 'results-events', 'quarters'),
  corporateEvent: categorical('Event during month', 'results-events', choices('Dividend', 'Bonus', 'Split', 'Buyback', 'None'), true),
  sentiment: categorical('Monthly news sentiment', 'news', choices('Positive', 'Neutral', 'Negative')),
  newsText: { label: 'News during month', category: 'news', kind: 'text' },
  pledge: numeric('Promoter pledge', 'ownership', '%'), promoterHolding: numeric('Promoter holding', 'ownership', '%'),
  fiiChange: numeric('FII holding change in month', 'ownership', '%'), diiChange: numeric('DII holding change in month', 'ownership', '%'),
  bulkActivity: categorical('Institutional activity', 'ownership', choices('Accumulation', 'Distribution', 'Neutral')),
  index: categorical('Index membership', 'sector-market', [...stockIndices], true),
  sector: categorical('Sector', 'sector-market', choices('Financials', 'Technology', 'Industrials', 'Consumer', 'Healthcare', 'Energy', 'Real estate', 'Telecom')),
  relativeStrength: numeric('Monthly RS vs NIFTY', 'sector-market', 'ratio', true),
  marketRegime: categorical('Month-end market regime', 'sector-market', choices('Bullish', 'Sideways', 'Bearish')),
  fnoEligible: { label: 'F&O eligible at month-end', category: 'derivatives', kind: 'boolean', choices: choices('True', 'False') },
  oiChange: numeric('Monthly open-interest change', 'derivatives', '%'), iv: numeric('Month-end implied volatility', 'derivatives', '%'),
  futuresActivity: categorical('Monthly futures activity', 'derivatives', choices('Long buildup', 'Short buildup', 'Short covering', 'Long unwinding')),
  winRate: numeric('Monthly backtest win rate', 'performance', '%'), profitFactor: numeric('Monthly backtest profit factor', 'performance', 'ratio'),
  drawdown: numeric('Monthly backtest drawdown', 'performance', '%'), paperTrades: numeric('Paper trades during month', 'performance', 'trades'),
};
export const monthlyOperatorLabels: Record<MonthlyOperator, string> = {
  gt: '> Greater than', gte: '≥ At least', lt: '< Less than', lte: '≤ At most', eq: '= Equal', neq: '≠ Not equal',
  between: 'Between', notBetween: 'Not between', crossAbove: 'Crosses above', crossBelow: 'Crosses below',
  increasing: 'Increasing', decreasing: 'Decreasing', within: 'Within % of', aboveBy: 'Above by %', belowBy: 'Below by %',
  is: 'Is', isNot: 'Is not', in: 'In', notIn: 'Not in', contains: 'Contains', notContains: 'Does not contain',
};
export function monthlyOperators(field: string): MonthlyOperator[] {
  const definition = monthlyFields[field];
  if (!definition) return [];
  if (definition.kind === 'text') return ['contains', 'notContains'];
  if (definition.kind === 'boolean') return ['is', 'isNot'];
  if (definition.kind === 'category') return ['is', 'isNot', 'in', 'notIn'];
  return ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'notBetween', ...(definition.series ? ['crossAbove', 'crossBelow', 'increasing', 'decreasing'] as MonthlyOperator[] : []), ...(definition.unit === '₹' ? ['within', 'aboveBy', 'belowBy'] as MonthlyOperator[] : [])];
}
export const isRange = (operator: MonthlyOperator) => ['between', 'notBetween'].includes(operator);
export const isTrend = (operator: MonthlyOperator) => ['increasing', 'decreasing'].includes(operator);
export const isDistance = (operator: MonthlyOperator) => ['within', 'aboveBy', 'belowBy'].includes(operator);
export function newMonthlyCondition(field = 'marketCap'): MonthlyCondition {
  const definition = monthlyFields[field];
  return { category: definition.category, field, timeframe: '1mo', operator: definition.kind === 'number' ? 'gte' : definition.kind === 'text' ? 'contains' : 'is', operand: 'value', value: field === 'marketCap' ? 3000 : 0, upper: 70, compareField: field === 'ema21' ? 'ema5' : definition.unit === '₹' ? 'ema21' : field, multiplier: 1, distance: 2, lookback: 1, choices: definition.choices?.length ? [definition.choices[0].value] : [], text: '' };
}
const condition = (field: string, rest: Partial<MonthlyCondition>) => ({ ...newMonthlyCondition(field), ...rest });
export const initialMonthlyRule: MonthlyRuleTemplate = {
  id: 'monthly-qualification', tier: 'monthly', revision: 1, name: 'Monthly qualification', description: 'Liquidity, delivery participation, balance-sheet quality and a monthly trend.', timeframe: '1mo', logic: 'AND',
  groups: [{ logic: 'AND', conditions: [
    condition('marketCap', { value: 3000 }), condition('tradedValue', { value: 100 }),
    condition('debtEquity', { operator: 'lte', value: 1 }), condition('pledge', { operator: 'lte', value: 5 }),
    condition('delivery', { value: 40 }), condition('ema5', { operand: 'field', compareField: 'ema21' }),
  ] }],
};
