import { Form, Select, type SelectProps } from "antd";
import { Controller, type FieldValues } from "react-hook-form";
import type { RhfFieldProps } from "./fieldTypes";
export function RhfSelect<T extends FieldValues>({
  name,
  control,
  label,
  required,
  onValueChange,
  ...props
}: RhfFieldProps<T> & { onValueChange?: SelectProps['onChange'] } &
  Omit<SelectProps, "value" | "defaultValue" | "onChange" | "onBlur">) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Form.Item
          label={label}
          required={required}
          htmlFor={name}
          validateStatus={fieldState.error ? "error" : undefined}
          help={fieldState.error?.message}
        >
          <Select
            {...props}
            {...field}
            onChange={(value, option) => { field.onChange(value); onValueChange?.(value, option); }}
            id={name}
            aria-invalid={!!fieldState.error}
          />
        </Form.Item>
      )}
    />
  );
}
