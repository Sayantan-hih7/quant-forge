import '../../../styles/rule-fields.css';
import { Collapse, Form, InputNumber, Tooltip } from 'antd';
import { Controller, useWatch, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { ruleFields } from '../config/ruleFields';
import { indicatorCatalog, type IndicatorKind } from '../../stock-details/utils/indicatorCatalog';
import { IndicatorOptionsFields } from '../../stock-details/components/IndicatorOptionsFields';

/** Optional parameters keep old saved rules unchanged while showing effective defaults. */
export function RuleOperandParameters<T extends FieldValues>({ control, field, periodName, offsetName, monthly = false }: {
  control: Control<T>; field: string; periodName: FieldPath<T>; offsetName: FieldPath<T>; monthly?: boolean;
}) {
  const period = useWatch({ control, name: periodName });
  const definition = ruleFields[field];
  if (!definition) return null;
  const settingsName = periodName.replace(/period$/,'settings').replace(/Period$/,'Settings') as FieldPath<T>;
  const kind = definition.indicator as IndicatorKind | undefined;
  return <div className="rule-operand-parameters">
    {definition.period && <Controller control={control} name={periodName} render={({ field: input, fieldState }) => <Form.Item label={field.startsWith('openingRange') ? 'Opening minutes' : field.includes('Ema') ? 'EMA period' : 'Period (candles)'} htmlFor={periodName} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
      <InputNumber {...input} id={periodName} value={input.value ?? definition.period!.default} min={definition.period!.min} max={definition.period!.max} precision={0} onChange={value => input.onChange(value ?? undefined)} style={{ width: '100%' }} />
    </Form.Item>} />}
    {kind && Object.keys(indicatorCatalog[kind].settings).some(key => !['overbought','oversold','maPeriod'].includes(key)) && <Controller control={control} name={settingsName} render={({field: input,fieldState}) => <Collapse size="small" items={[{key:'settings',label:'Indicator settings',children:<><IndicatorOptionsFields monthly={monthly} kind={kind} period={period ?? definition.period?.default} prefix={settingsName} value={input.value??{}} onChange={input.onChange}/>{fieldState.error&&<p role="alert">{fieldState.error.message}</p>}<p className="muted">{indicatorCatalog[kind].description}</p></>}]} />}/>}
    {definition.offset && <Controller control={control} name={offsetName} render={({ field: input, fieldState }) => <Form.Item label={monthly ? 'Months earlier' : 'Candles earlier'} htmlFor={offsetName} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
      <InputNumber {...input} id={offsetName} value={input.value ?? 0} min={0} max={120} precision={0} onChange={value => input.onChange(value ?? undefined)} style={{ width: '100%' }} />
    </Form.Item>} />}
    <Tooltip title={`${definition.description}${definition.offset ? ' 0 = latest completed candle; 1 = the one before it.' : ''}`}><span tabIndex={0} className="rule-field-help">How this is measured</span></Tooltip>
  </div>;
}
