import { Form, Switch, type SwitchProps } from 'antd';
import { Controller, type FieldValues } from 'react-hook-form';
import type { RhfFieldProps } from './fieldTypes';

export function RhfSwitch<T extends FieldValues>({ name, control, label, ...props }: RhfFieldProps<T> & Omit<SwitchProps, 'checked' | 'defaultChecked' | 'onChange'>) {
  return <Controller name={name} control={control} render={({ field, fieldState }) => <Form.Item label={label} htmlFor={name} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
    <Switch {...props} id={name} checked={!!field.value} onChange={(value) => { field.onChange(value); field.onBlur(); }} ref={field.ref} aria-invalid={!!fieldState.error} />
  </Form.Item>} />;
}
