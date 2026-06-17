import { Button, Input, Select } from '@repo/ui';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { electionTemplates } from './electionTemplates';
import { CustomField, FieldType } from './types';

interface CustomFieldsManagerProps {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
  onCandidateLabelChange?: (label: string) => void;
}

const CustomFieldsManager = ({
  fields,
  onChange,
  onCandidateLabelChange,
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

  const loadTemplate = (templateIndex: number) => {
    const template = electionTemplates[templateIndex];
    if (!template) return;

    if (fields.length > 0) {
      if (!window.confirm('This will replace your current fields. Continue?')) {
        return;
      }
    }

    const newFields: CustomField[] = template.fields.map((f) => ({
      ...f,
      id: Date.now().toString() + Math.random().toString(36).slice(2),
    }));

    onChange(newFields);
    onCandidateLabelChange?.(template.candidateLabel);
    setIsExpanded(true);
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
        <div className="flex items-center gap-2">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                loadTemplate(parseInt(e.target.value));
                e.target.value = '';
              }
            }}
            className="text-sm text-slate-500 bg-transparent border border-slate-300 rounded px-2 py-1 cursor-pointer hover:border-slate-400"
          >
            <option value="">Load template...</option>
            {electionTemplates.map((t, i) => (
              <option key={t.name} value={i}>
                {t.name}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Hide' : 'Show'} Fields
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.id}>
              <div className="flex items-center gap-3">
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
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    updateField(field.id, { type: e.target.value as FieldType })
                  }
                  className="w-32"
                >
                  <option value="text">Text</option>
                  <option value="textarea">Long Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="select">Select</option>
                  <option value="multiselect">Multi-Select</option>
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
              {(field.type === 'select' || field.type === 'multiselect') && (
                <div className="w-full mt-2 space-y-1">
                  {(field.options || []).map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-1">
                      <span className="text-xs text-slate-600">{opt}</span>
                      <button
                        onClick={() =>
                          updateField(field.id, {
                            options: field.options?.filter((_, i) => i !== oi),
                          })
                        }
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <Input
                    placeholder="Add option and press Enter..."
                    className="h-7 text-xs"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) {
                          updateField(field.id, {
                            options: [...(field.options || []), val],
                          });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={field.allowCustomOptions || false}
                      onChange={(e) =>
                        updateField(field.id, { allowCustomOptions: e.target.checked })
                      }
                      className="h-3 w-3 rounded border-gray-300"
                    />
                    <label className="text-xs text-slate-500">Allow submitters to add their own options</label>
                  </div>
                </div>
              )}
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
