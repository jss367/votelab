import type { Candidate, CustomField } from './types';

const PALETTE = [
  { bg: 'bg-blue-100', text: 'text-blue-800' },
  { bg: 'bg-green-100', text: 'text-green-800' },
  { bg: 'bg-amber-100', text: 'text-amber-800' },
  { bg: 'bg-rose-100', text: 'text-rose-800' },
  { bg: 'bg-purple-100', text: 'text-purple-800' },
  { bg: 'bg-teal-100', text: 'text-teal-800' },
  { bg: 'bg-orange-100', text: 'text-orange-800' },
  { bg: 'bg-pink-100', text: 'text-pink-800' },
];

export const getCategoryColor = (value: string, options: string[]) => {
  const index = options.indexOf(value);
  return PALETTE[(index >= 0 ? index : 0) % PALETTE.length]!;
};

interface CategoryBadgesProps {
  candidate: Candidate;
  customFields?: CustomField[];
}

const CategoryBadges: React.FC<CategoryBadgesProps> = ({ candidate, customFields }) => {
  if (!customFields || !candidate.customFields) return null;

  const selectFields = customFields.filter((f) => f.type === 'select' || f.type === 'multiselect');
  if (selectFields.length === 0) return null;

  return (
    <>
      {selectFields.map((field) => {
        const raw = candidate.customFields?.find((cf) => cf.fieldId === field.id)?.value;
        if (!raw) return null;

        // Handle both single select (string) and multiselect (string[])
        const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
        if (values.length === 0) return null;

        return values.map((value) => {
          const color = getCategoryColor(value, field.options || []);
          return (
            <span
              key={`${field.id}-${value}`}
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color.bg} ${color.text}`}
            >
              {value}
            </span>
          );
        });
      })}
    </>
  );
};

export default CategoryBadges;
