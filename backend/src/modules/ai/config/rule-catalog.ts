import { ruleFields } from '../../../shared/rule-fields.js';
// Shared with the manual builders and calculation engine.
export const monthlyCatalog = Object.fromEntries(Object.entries(ruleFields).filter(([, field]) => field.monthly).map(([id, field]) => [id, {
  ...field, series: field.source === 'candles', categorical: field.unit === 'category',
}]));
export const tradingCatalog = Object.fromEntries(Object.entries(ruleFields).filter(([, field]) => field.trading));
