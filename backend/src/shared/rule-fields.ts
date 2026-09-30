import { settingsError, type CalculationSettings } from './indicator-settings.js';
import fields from '@quantforge/rule-catalog/fields.json' with { type: 'json' };

export interface RuleField {
  indicator?: string;
  label: string; category: string; unit: string; source: string;
  frames: string[]; monthly: boolean; trading: boolean; description: string;
  period?: { default: number; min: number; max: number }; offset: boolean;
}
export const ruleFields: Record<string, RuleField> = fields;
export function parameterError(field: string, period?: number, offset = 0, settings?: CalculationSettings): string | undefined {
  const definition = ruleFields[field];
  const settingIssue = settingsError(definition?.indicator, settings);
  if (settingIssue) return settingIssue;
  if (period !== undefined && (!definition?.period || !Number.isInteger(period) || period < definition.period.min || period > definition.period.max)) return `Choose a supported candle period for ${field}`;
  if (!Number.isInteger(offset) || offset < 0 || offset > 120 || (offset && !definition?.offset)) return `Choose a supported completed-candle offset for ${field}`;
}
