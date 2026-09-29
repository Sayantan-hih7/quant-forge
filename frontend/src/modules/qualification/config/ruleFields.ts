import fields from '@quantforge/rule-catalog/fields.json' with { type: 'json' };
export type FieldId = keyof typeof fields;
export interface FieldDefinition {
  label: string; category: string; unit: string; source: string; frames: string[];
  monthly: boolean; trading: boolean; description: string; offset: boolean;
  period?: { default: number; min: number; max: number };
}
export const ruleFields: Record<string, FieldDefinition> = fields;
export const fieldUnits: Record<string, string> = { price: '₹', crore: '₹ Cr', percent: '%', ratio: 'ratio', points: 'points', shares: 'shares', category: '', flag: '' };
export function fieldLabel(id: string, period?: number, offset = 0) {
  const field = ruleFields[id];
  return `${field?.label ?? id}${field?.period ? ` (${period ?? field.period.default} candles)` : ''}${offset ? `, ${offset} completed candle${offset === 1 ? '' : 's'} earlier` : ''}`;
}
export function fieldParameterError(id: string, period?: number, offset = 0) {
  const field = ruleFields[id];
  if (period !== undefined && (!field?.period || period < field.period.min || period > field.period.max || !Number.isInteger(period))) return 'Choose a supported period for this field';
  if (!Number.isInteger(offset) || offset < 0 || offset > 120 || (offset && !field?.offset)) return 'Choose a supported completed-candle offset';
}
