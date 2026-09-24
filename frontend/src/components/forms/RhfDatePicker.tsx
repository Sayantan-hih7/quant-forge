import { DatePicker, Form, type DatePickerProps } from 'antd';
import dayjs from 'dayjs';
import { Controller, type FieldValues } from 'react-hook-form';
import type { RhfFieldProps } from './fieldTypes';

export function RhfDatePicker<T extends FieldValues>({ name, control, label, required, ...props }: RhfFieldProps<T> & Omit<DatePickerProps, 'value' | 'defaultValue' | 'onChange'>) {
  return <Controller name={name} control={control} render={({ field, fieldState }) => <Form.Item label={label} htmlFor={name} required={required} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
    <DatePicker {...props} multiple={false} id={name} ref={field.ref} value={field.value ? dayjs(field.value) : null} onBlur={field.onBlur} onChange={(value) => field.onChange(value && !Array.isArray(value) ? value.format('YYYY-MM-DD') : '')} aria-invalid={!!fieldState.error} style={{ width: '100%' }} />
  </Form.Item>} />;
}
