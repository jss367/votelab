import { Input } from '@/components/ui/';
import { CustomField, CustomFieldValue } from './types';

interface CustomFieldsInputProps {
  fields: CustomField[];
  values: CustomFieldValue[];
  onChange: (values: CustomFieldValue[]) => void;
  disabled?: boolean;
}

const CustomFieldsInput = ({
  fields,
  values,
  onChange,
  disabled = false,
}: CustomFieldsInputProps) => {
  const updateFieldValue = (fieldId: string, value: string) => {
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;

    let parsedValue: string | number | Date | null = value;

    // Parse the value based on field type
    if (field.type === 'number') {
      parsedValue = value === '' ? null : Number(value);
    } else if (field.type === 'date') {
      parsedValue = value === '' ? null : new Date(value);
    }

    // Update or add the field value
    const existingIndex = values.findIndex((v) => v.fieldId === fieldId);
    if (existingIndex >= 0) {
      const newValues = [...values];
      newValues[existingIndex] = { fieldId, value: parsedValue };
      onChange(newValues);
    } else {
      onChange([...values, { fieldId, value: parsedValue }]);
    }
  };

  const getValue = (fieldId: string): string => {
    const fieldValue = values.find((v) => v.fieldId === fieldId);
    if (!fieldValue) return '';

    if (fieldValue.value instanceof Date) {
      return fieldValue.value.toISOString().split('T')[0];
    }

    return fieldValue.value?.toString() || '';
  };

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.id} className="space-y-1">
          <label className="text-sm font-medium text-slate-700">
            {field.name}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <Input
            type={
              field.type === 'date'
                ? 'date'
                : field.type === 'number'
                  ? 'number'
                  : 'text'
            }
            value={getValue(field.id)}
            onChange={(e) => updateFieldValue(field.id, e.target.value)}
            disabled={disabled}
            required={field.required}
            className="w-full"
          />
        </div>
      ))}
    </div>
  );
};

export default CustomFieldsInput;
