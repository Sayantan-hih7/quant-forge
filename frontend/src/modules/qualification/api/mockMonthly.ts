import { monthlyFields } from '../config/monthlyFields';
import { mockMarket } from './mockMarket';
import type { CandidateStock, MonthlyCache } from '../types';
import type { MonthlyCondition, MonthlyRuleDefinition, MonthlyRuleTemplate } from '../types/monthly';

// Completed monthly bars and month-end snapshots are synthetic fixtures, never live quotes.
export function monthlyValue(stock: CandidateStock, field: string, offset = 0): number | string | string[] {
  const i = stock.index;
  const price = stock.close * (1 - offset * 0.012);
  const pattern = (values: string[]) => values[(i + offset) % values.length];
  switch (field) {
    case 'close': return price;
    case 'ema5': return price * (i < 80 ? (offset > 2 && i % 3 === 1 ? 0.95 : 0.99) : 0.92);
    case 'ema21': return price * 0.97;
    case 'sma50': return price * 0.91;
    case 'sma200': return price * (i < 120 ? 0.82 : 1.12);
    case 'rsi': return 45 + i % 8 * 4 - offset;
    case 'adx': return 18 + i % 12 * 2 - offset;
    case 'macd': return price * (i % 3 ? 0.01 : -0.005);
    case 'macdSignal': return price * 0.008;
    case 'priceChange': return 2 + i % 8 - offset * 0.3;
    case 'volume': return stock.avgVolume20 * 20 * (1 + i % 5 * 0.3) * (1 - offset * 0.01);
    case 'avgVolume6': return stock.avgVolume20 * 20;
    case 'volumeRatio': return 1 + i % 5 * 0.3;
    case 'delivery': return i < 80 ? 42 + i % 18 : 20 + i % 24;
    case 'tradedValue': return stock.turnover * 20;
    case 'chartPattern': return pattern(['VCP', 'Cup & Handle', 'Double Bottom', 'Ascending Triangle', 'Flag', 'None']);
    case 'patternState': return pattern(['Detected', 'Breakout confirmed', 'Near breakout', 'Not detected']);
    case 'candlePattern': return pattern(['Bullish Engulfing', 'Bearish Engulfing', 'Hammer', 'Doji', 'Morning Star', 'None']);
    case 'breakout': return i % 3 ? 'True' : 'False';
    case 'marketCap': return stock.marketCap;
    case 'pe': return 12 + i % 22;
    case 'roe': return stock.roe;
    case 'roce': return stock.roe + 3;
    case 'debtEquity': return stock.debtEquity;
    case 'revenueGrowth': return stock.growth;
    case 'profitGrowth': return stock.growth + 4;
    case 'positiveQuarters': return 1 + i % 8;
    case 'corporateEvent': return [pattern(['Dividend', 'Bonus', 'Split', 'Buyback', 'None'])];
    case 'sentiment': return pattern(['Positive', 'Neutral', 'Negative']);
    case 'newsText': return pattern(['Order win and capacity expansion', 'Quarterly earnings announced', 'Rating downgrade and litigation']);
    case 'pledge': return stock.pledge;
    case 'promoterHolding': return 35 + i % 36;
    case 'fiiChange': return (i % 9 - 3) / 10;
    case 'diiChange': return (i % 7 - 2) / 10;
    case 'bulkActivity': return pattern(['Accumulation', 'Distribution', 'Neutral']);
    case 'index': return stock.indices;
    case 'sector': return stock.sector;
    case 'relativeStrength': return 0.8 + i % 12 / 10;
    case 'marketRegime': return 'Bullish';
    case 'fnoEligible': return i < 180 ? 'True' : 'False';
    case 'oiChange': return i < 180 ? i % 20 - 4 : NaN;
    case 'iv': return i < 180 ? 15 + i % 24 : NaN;
    case 'futuresActivity': return i < 180 ? pattern(['Long buildup', 'Short buildup', 'Short covering', 'Long unwinding']) : '';
    case 'winRate': return 40 + i % 40;
    case 'profitFactor': return 1 + i % 20 / 10;
    case 'drawdown': return 3 + i % 15;
    case 'paperTrades': return 4 + i % 24;
    default: return NaN;
  }
}
export function monthlyConditionMatches(stock: CandidateStock, condition: MonthlyCondition): boolean {
  const definition = monthlyFields[condition.field];
  if (!definition || condition.timeframe !== '1mo') return false;
  const evaluate = (offset: number) => {
    const left = monthlyValue(stock, condition.field, offset);
    if (definition.kind === 'text') {
      const found = String(left).toLowerCase().includes(condition.text.trim().toLowerCase());
      return condition.operator === 'contains' ? found : !found;
    }
    if (definition.kind !== 'number') {
      if (left === '') return false;
      const values = Array.isArray(left) ? left : [String(left)];
      const found = condition.choices.some((choice) => values.includes(choice));
      return ['isNot', 'notIn'].includes(condition.operator) ? !found : found;
    }
    const lhs = Number(left);
    const rhs = condition.operand === 'field' || ['within', 'aboveBy', 'belowBy'].includes(condition.operator) ? Number(monthlyValue(stock, condition.compareField, offset)) * condition.multiplier : condition.value;
    if (!Number.isFinite(lhs) || !Number.isFinite(rhs)) return false;
    switch (condition.operator) {
      case 'gt': return lhs > rhs;
      case 'gte': return lhs >= rhs;
      case 'lt': return lhs < rhs;
      case 'lte': return lhs <= rhs;
      case 'eq': return lhs === rhs;
      case 'neq': return lhs !== rhs;
      case 'between': return lhs >= condition.value && lhs <= condition.upper;
      case 'notBetween': return lhs < condition.value || lhs > condition.upper;
      case 'within': return rhs !== 0 && Math.abs(lhs - rhs) / Math.abs(rhs) * 100 <= condition.distance;
      case 'aboveBy': return rhs !== 0 && (lhs - rhs) / Math.abs(rhs) * 100 >= condition.distance;
      case 'belowBy': return rhs !== 0 && (rhs - lhs) / Math.abs(rhs) * 100 >= condition.distance;
      case 'crossAbove': case 'crossBelow': {
        const previous = Number(monthlyValue(stock, condition.field, offset + 1));
        const previousRight = condition.operand === 'field' ? Number(monthlyValue(stock, condition.compareField, offset + 1)) * condition.multiplier : condition.value;
        return condition.operator === 'crossAbove' ? lhs > rhs && previous <= previousRight : lhs < rhs && previous >= previousRight;
      }
      case 'increasing': return lhs > Number(monthlyValue(stock, condition.field, offset + 1));
      case 'decreasing': return lhs < Number(monthlyValue(stock, condition.field, offset + 1));
      default: return false;
    }
  };
  const occurrences = Array.from({ length: condition.lookback }, (_, index) => index);
  if (['increasing', 'decreasing'].includes(condition.operator)) return occurrences.every(evaluate);
  if (condition.operator.startsWith('cross') || condition.category === 'patterns') return ['isNot', 'notIn'].includes(condition.operator) ? occurrences.every(evaluate) : occurrences.some(evaluate);
  return evaluate(0);
}
export function monthlyRuleMatches(stock: CandidateStock, rule: MonthlyRuleDefinition) {
  if (rule.timeframe !== '1mo') return false;
  const groups = rule.groups.map((group) => group.logic === 'AND' ? group.conditions.every((condition) => monthlyConditionMatches(stock, condition)) : group.conditions.some((condition) => monthlyConditionMatches(stock, condition)));
  return rule.logic === 'AND' ? groups.every(Boolean) : groups.some(Boolean);
}
export function createMonthlySnapshot(rule: MonthlyRuleTemplate, month: string, dataMonth: string, time: number): MonthlyCache {
  return { id: crypto.randomUUID(), month, dataMonth, createdAt: new Date(time).toISOString(), sourceCount: mockMarket.length, rule: structuredClone(rule), candidates: mockMarket.filter((stock) => monthlyRuleMatches(stock, rule)) };
}
