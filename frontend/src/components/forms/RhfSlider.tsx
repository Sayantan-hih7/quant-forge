import { Form, Slider } from "antd";
import { Controller, type FieldValues } from "react-hook-form";
import type { RhfFieldProps } from "./fieldTypes";

export function RhfSlider<T extends FieldValues>({
  name,
  control,
  label,
  min = 0.5,
  max = 2,
  step = 0.1,
}: RhfFieldProps<T> & { min?: number; max?: number; step?: number }) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Form.Item
          label={
            <span>
              {label} <strong className="slider-value">{field.value}×</strong>
            </span>
          }
          htmlFor={name}
          validateStatus={fieldState.error ? "error" : undefined}
          help={fieldState.error?.message}
        >
          <Slider
            id={name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            min={min}
            max={max}
            step={step}
            marks={{ 0.5: "0.5×", 1: "1×", 1.5: "1.5×", 2: "2×" }}
            ariaLabelForHandle={label}
            tooltip={{ formatter: (value) => `${value}×` }}
          />
        </Form.Item>
      )}
    />
  );
}
