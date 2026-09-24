import { Form, Input } from "antd";
import type { PasswordProps } from "antd/es/input";
import { Controller, type FieldValues } from "react-hook-form";
import type { RhfFieldProps } from "./fieldTypes";

export function RhfPassword<T extends FieldValues>({
  name,
  control,
  label,
  required,
  ...props
}: RhfFieldProps<T> &
  Omit<
    PasswordProps,
    "name" | "value" | "defaultValue" | "onChange" | "onBlur"
  >) {
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
          help={
            fieldState.error && (
              <span id={`${name}-error`}>{fieldState.error.message}</span>
            )
          }
        >
          <Input.Password
            {...props}
            {...field}
            id={name}
            value={field.value ?? ""}
            aria-invalid={!!fieldState.error}
            aria-describedby={fieldState.error ? `${name}-error` : undefined}
          />
        </Form.Item>
      )}
    />
  );
}
