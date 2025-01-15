import { Button, Input, Select } from '@repo/ui';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CustomField, FieldType } from './types';

interface CustomFieldsManagerProps {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
}

const CustomFieldsManager = ({
  fields,
  onChange,
}: CustomFieldsManagerProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const addField = () => {
    const newField: CustomField = {
      id: Date.now().toString(),
      name: '',
      type: 'text',
      required: false,
    };
    onChange([...fields, newField]);
  };

  const updateField = (id: string, updates: Partial<CustomField>) => {
    onChange(
      fields.map((field) =>
        field.id === id ? { ...field, ...updates } : field
      )
    );
  };

  const removeField = (id: string) => {
    onChange(fields.filter((field) => field.id !== id));
  };

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-slate-500" />
          <h3 className="font-medium text-slate-900">
            Custom Candidate Fields
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Hide' : 'Show'} Fields
        </Button>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.id} className="flex items-center gap-3">
              <Input
                placeholder="Field Name"
                value={field.name}
                onChange={(e) =>
                  updateField(field.id, { name: e.target.value })
                }
                className="flex-grow"
              />

              <Select
                value={field.type}
                onValueChange={(value: FieldType) =>
                  updateField(field.id, { type: value })
                }
                className="w-32"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
              </Select>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) =>
                    updateField(field.id, { required: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label className="text-sm text-slate-600">Required</label>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeField(field.id)}
                className="text-slate-500 hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={addField}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Field
          </Button>
        </div>
      )}
    </div>
  );
};

export default CustomFieldsManager;
