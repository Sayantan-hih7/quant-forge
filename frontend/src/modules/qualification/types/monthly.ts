export type MonthlyCategory = 'technical' | 'price-volume' | 'patterns' | 'fundamentals' | 'results-events' | 'news' | 'ownership' | 'sector-market' | 'derivatives' | 'performance';
export type MonthlyOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between' | 'notBetween' | 'crossAbove' | 'crossBelow' | 'increasing' | 'decreasing' | 'within' | 'aboveBy' | 'belowBy' | 'is' | 'isNot' | 'in' | 'notIn' | 'contains' | 'notContains';
export interface MonthlyCondition {
  category: MonthlyCategory; field: string; timeframe: '1mo'; operator: MonthlyOperator;
  operand: 'value' | 'field'; value: number; upper: number; compareField: string;
  multiplier: number; distance: number; lookback: number; choices: string[]; text: string;
}
export interface MonthlyRuleDefinition {
  name: string; description: string; timeframe: '1mo'; logic: 'AND' | 'OR';
  groups: { logic: 'AND' | 'OR'; conditions: MonthlyCondition[] }[];
}
export interface MonthlyRuleTemplate extends MonthlyRuleDefinition { tier: 'monthly'; id: string; revision: number }
