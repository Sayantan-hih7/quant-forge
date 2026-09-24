import { z } from 'zod';
import { isDistance, isRange, monthlyCategories, monthlyFields, monthlyOperators } from '../config/monthlyFields';
import type { MonthlyCategory, MonthlyOperator } from '../types/monthly';

const finite = z.number({ invalid_type_error: 'Enter a number' }).finite();
const baseSchema = z.object({
  name: z.string().trim().min(3).max(60), description: z.string().trim().max(200), timeframe: z.literal('1mo'), logic: z.enum(['AND', 'OR']),
  groups: z.array(z.object({ logic: z.enum(['AND', 'OR']), conditions: z.array(z.object({
    category: z.enum(monthlyCategories.map((category) => category.value) as [MonthlyCategory, ...MonthlyCategory[]]),
    field: z.string(), timeframe: z.literal('1mo'), operator: z.string() as z.ZodType<MonthlyOperator>, operand: z.enum(['value', 'field']),
    value: finite, upper: finite, compareField: z.string(), multiplier: finite.positive().max(100), distance: finite.min(0).max(100),
    lookback: finite.int().min(1).max(24), choices: z.array(z.string()), text: z.string().max(120),
  })).min(1).max(12) })).min(1).max(6),
});
export const createMonthlyRuleSchema = (choices?: Record<string, { value: string; label: string }[]>) => baseSchema.superRefine((rule, ctx) => {
  rule.groups.forEach((group, gi) => group.conditions.forEach((condition, ci) => {
    const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: ['groups', gi, 'conditions', ci, field], message });
    const field = monthlyFields[condition.field];
    if (!field) return issue('field', 'Choose a supported monthly field');
    if (field.category !== condition.category) issue('field', 'Choose a field from this category');
    if (!monthlyOperators(condition.field).includes(condition.operator)) issue('operator', 'Choose an operator supported by this field');
    if (field.kind === 'number') {
      if (isRange(condition.operator) && condition.value > condition.upper) issue('upper', 'Upper bound must be at least the lower bound');
      if ((condition.operand === 'field' && !isRange(condition.operator)) || isDistance(condition.operator)) {
        const right = monthlyFields[condition.compareField];
        if (!right || right.kind !== 'number' || right.unit !== field.unit) issue('compareField', 'Compare monthly fields with matching units');
        if (condition.operator.startsWith('cross') && !right?.series) issue('compareField', 'Crossovers need a monthly series');
      }
    } else if (field.kind === 'text') {
      if (!condition.text.trim()) issue('text', 'Enter a keyword or phrase');
    } else {
      if (!condition.choices.length || condition.choices.some((value) => !(choices?.[condition.field] ?? field.choices)?.some((option) => option.value === value))) issue('choices', 'Choose a supported value');
      if (['is', 'isNot'].includes(condition.operator) && condition.choices.length !== 1) issue('choices', 'Choose one value, or use In / Not in');
    }
  }));
});
export const monthlyRuleSchema = createMonthlyRuleSchema();
