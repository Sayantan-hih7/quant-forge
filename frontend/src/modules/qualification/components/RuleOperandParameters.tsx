import '../../../styles/rule-fields.css';
import { Form, InputNumber, Tooltip } from 'antd';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { ruleFields } from '../config/ruleFields';

/** Optional parameters keep old saved rules unchanged while showing effective defaults. */
export function RuleOperandParameters<T extends FieldValues>({ control, field, periodName, offsetName, monthly = false }: {
  control: Control<T>; field: string; periodName: FieldPath<T>; offsetName: FieldPath<T>; monthly?: boolean;
}) {
  const definition = ruleFields[field];
  if (!definition) return null;
  return <div className="rule-operand-parameters">
    {definition.period && <Controller control={control} name={periodName} render={({ field: input, fieldState }) => <Form.Item label={field.includes('Ema') ? 'EMA period' : 'Period (candles)'} htmlFor={periodName} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
      <InputNumber {...input} id={periodName} value={input.value ?? definition.period!.default} min={definition.period!.min} max={definition.period!.max} precision={0} onChange={value => input.onChange(value ?? undefined)} style={{ width: '100%' }} />
    </Form.Item>} />}
    {definition.offset && <Controller control={control} name={offsetName} render={({ field: input, fieldState }) => <Form.Item label={monthly ? 'Months earlier' : 'Candles earlier'} htmlFor={offsetName} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
      <InputNumber {...input} id={offsetName} value={input.value ?? 0} min={0} max={120} precision={0} onChange={value => input.onChange(value ?? undefined)} style={{ width: '100%' }} />
    </Form.Item>} />}
    <Tooltip title={`${definition.description}${definition.offset ? ' 0 = latest completed candle; 1 = the one before it.' : ''}`}><span tabIndex={0} className="rule-field-help">How this is measured</span></Tooltip>
  </div>;
}
