import { Form, Input, type InputProps } from "antd";
import { Controller, type FieldValues } from "react-hook-form";
import type { RhfFieldProps } from "./fieldTypes";
export function RhfInput<T extends FieldValues>({
  name,
  control,
  label,
  required,
  ...props
}: RhfFieldProps<T> &
  Omit<InputProps, "name" | "value" | "defaultValue" | "onChange" | "onBlur">) {
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
          <Input
            {...props}
            {...field}
            id={name}
            value={field.value ?? ""}
            aria-invalid={!!fieldState.error}
          />
        </Form.Item>
      )}
    />
  );
}
