import { Form, Select, type SelectProps } from 'antd';
import { Controller, type FieldValues } from 'react-hook-form';
import type { RhfFieldProps } from './fieldTypes';

// Stores choices consistently as an array while presenting a single or multiple select.
export function RhfChoiceSelect<T extends FieldValues>({ name, control, label, required, multiple = false, ...props }: RhfFieldProps<T> & Omit<SelectProps, 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'mode'> & { multiple?: boolean }) {
  return <Controller name={name} control={control} render={({ field, fieldState }) => <Form.Item label={label} htmlFor={name} required={required} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
    <Select {...props} id={name} ref={field.ref} onBlur={field.onBlur} aria-invalid={!!fieldState.error} mode={multiple ? 'multiple' : undefined} value={multiple ? field.value : field.value?.[0]} onChange={(value: string | string[] | undefined) => field.onChange(value === undefined ? [] : Array.isArray(value) ? value : [value])} />
  </Form.Item>} />;
}
