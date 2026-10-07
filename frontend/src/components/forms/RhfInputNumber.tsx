import { Form, InputNumber, type InputNumberProps } from "antd";
import { Controller, type FieldValues } from "react-hook-form";
import type { RhfFieldProps } from "./fieldTypes";
export function RhfInputNumber<T extends FieldValues>({
  name,
  control,
  label,
  required,
  emptyAsUndefined = false,
  ...props
}: RhfFieldProps<T> & { emptyAsUndefined?: boolean } &
  Omit<InputNumberProps, "value" | "defaultValue" | "onChange" | "onBlur">) {
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
          <InputNumber
            {...props}
            {...field}
            onChange={value => field.onChange(emptyAsUndefined && value === null ? undefined : value)}
            id={name}
            style={{ width: "100%" }}
            aria-invalid={!!fieldState.error}
          />
        </Form.Item>
      )}
    />
  );
}
