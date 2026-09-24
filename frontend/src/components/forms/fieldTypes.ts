import type { Control, FieldPath, FieldValues } from 'react-hook-form'
export interface RhfFieldProps<T extends FieldValues> {
  name: FieldPath<T>
  control: Control<T>
  label: string
  required?: boolean
}
