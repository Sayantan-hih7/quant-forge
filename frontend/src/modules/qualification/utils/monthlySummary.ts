import { monthlyFields } from '../config/monthlyFields';
import type { MonthlyCondition } from '../types/monthly';

export function monthlyConditionSummary(condition: MonthlyCondition) {
  const field = monthlyFields[condition.field];
  if (!field) return 'Unsupported field — review this condition.';
  const labels = condition.choices.map((value) => field.choices?.find((choice) => choice.value === value)?.label ?? value).join(' or ');
  const number = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 4 });
  const unit = field.unit === '%' ? '%' : field.unit ? ` ${field.unit}` : '';
  const left = field.label;
  const right = condition.operand === 'field' ? `${condition.multiplier === 1 ? '' : `${number(condition.multiplier)} × `}${monthlyFields[condition.compareField]?.label}` : `${number(condition.value)}${unit}`;
  const within = condition.lookback === 1 ? 'the last completed monthly candle' : `the last ${condition.lookback} completed monthly candles`;
  const operators = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠' };
  if (condition.operator in operators) return `${left} ${operators[condition.operator as keyof typeof operators]} ${right}`;
  switch (condition.operator) {
    case 'between': case 'notBetween': return `${left} ${condition.operator === 'between' ? 'between' : 'outside'} ${number(condition.value)} and ${number(condition.upper)}${unit}`;
    case 'crossAbove': case 'crossBelow': return `${left} crosses ${condition.operator === 'crossAbove' ? 'above' : 'below'} ${right} within ${within}`;
    case 'increasing': case 'decreasing': return `${left} is ${condition.operator} for ${condition.lookback} consecutive month${condition.lookback === 1 ? '' : 's'}`;
    case 'within': case 'aboveBy': case 'belowBy': return `${left} ${condition.operator === 'within' ? 'within' : condition.operator === 'aboveBy' ? 'above by at least' : 'below by at least'} ${condition.distance}% ${condition.operator === 'within' ? 'of' : 'relative to'} ${monthlyFields[condition.compareField]?.label}${condition.multiplier === 1 ? '' : ` × ${condition.multiplier}`}`;
    case 'is': case 'in': case 'isNot': case 'notIn': return `${left} ${['isNot', 'notIn'].includes(condition.operator) ? 'is not' : 'is'} ${labels}${condition.category === 'patterns' ? ` within ${within}` : ''}`;
    case 'contains': case 'notContains': return `${left} ${condition.operator === 'contains' ? 'contains' : 'does not contain'} “${condition.text}”`;
  }
}
