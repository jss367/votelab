import { Input } from '@repo/ui';
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
    if (!field) {
      return;
    }

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
    if (!fieldValue) {
      return '';
    }

    if (fieldValue.value instanceof Date) {
      // Ensure we have a valid date before splitting
      const isoString = fieldValue.value.toISOString();
      const datePart = isoString.split('T')[0];
      return datePart || ''; // Provide empty string fallback
    }

    // Handle null/undefined case
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
          {field.type === 'textarea' ? (
            <textarea
              value={getValue(field.id)}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              disabled={disabled}
              required={field.required}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          ) : (
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
          )}
        </div>
      ))}
    </div>
  );
};

export default CustomFieldsInput;
