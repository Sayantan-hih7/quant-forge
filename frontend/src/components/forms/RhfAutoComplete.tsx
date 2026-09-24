import { AutoComplete, Form, type AutoCompleteProps } from "antd";
import { Controller, type FieldValues } from "react-hook-form";
import type { RhfFieldProps } from "./fieldTypes";
export function RhfAutoComplete<T extends FieldValues>({
  name,
  control,
  label,
  required,
  filterOption,
  ...props
}: RhfFieldProps<T> &
  Omit<AutoCompleteProps, "value" | "defaultValue" | "onChange" | "onBlur">) {
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
          <AutoComplete
            {...props}
            {...field}
            id={name}
            value={field.value ?? ""}
            style={{ width: "100%" }}
            aria-invalid={!!fieldState.error}
            filterOption={filterOption ?? ((input, option) =>
              String(option?.value ?? "")
                .toLowerCase()
                .includes(input.toLowerCase())
            )}
          />
        </Form.Item>
      )}
    />
  );
}
