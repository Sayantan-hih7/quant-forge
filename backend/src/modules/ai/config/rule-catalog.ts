import { indicatorCatalog, type IndicatorKind } from '../../../shared/indicator-settings.js';
import { ruleFields } from '../../../shared/rule-fields.js';
const ruleSettings = (kind: string | undefined) => kind ? Object.fromEntries(Object.entries(indicatorCatalog[kind as IndicatorKind]?.settings ?? {}).filter(([key]) => !['overbought', 'oversold', 'maPeriod'].includes(key))) : undefined;
// Shared with the manual builders and calculation engine.
export const monthlyCatalog = Object.fromEntries(Object.entries(ruleFields).filter(([, field]) => field.monthly).map(([id, field]) => [id, {
  ...field, settings: ruleSettings(field.indicator), series: field.source === 'candles', categorical: field.unit === 'category',
}]));
export const tradingCatalog = Object.fromEntries(Object.entries(ruleFields).filter(([, field]) => field.trading).map(([id,field]) => [id, {...field, settings: ruleSettings(field.indicator)}]));
