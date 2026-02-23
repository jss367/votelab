import CategoryBadges from './CategoryBadge';
import type { Candidate, CustomField } from './types';

interface CandidateDetailsProps {
  candidate: Candidate;
  customFields?: CustomField[];
}

const CandidateDetails: React.FC<CandidateDetailsProps> = ({ candidate, customFields }) => {
  const nonSelectFields = customFields?.filter(
    (f) => f.type !== 'select' && f.type !== 'multiselect'
  );

  const hasDetails = candidate.customFields && candidate.customFields.length > 0 && nonSelectFields && nonSelectFields.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-700">{candidate.name}</span>
        <CategoryBadges candidate={candidate} customFields={customFields} />
      </div>
      {hasDetails && (
        <div className="mt-1 text-sm text-slate-500 space-y-0.5">
          {nonSelectFields.map((fieldDef) => {
            const fieldValue = candidate.customFields?.find(
              (cf) => cf.fieldId === fieldDef.id
            );
            if (!fieldValue?.value) return null;
            const display = Array.isArray(fieldValue.value)
              ? fieldValue.value.join(', ')
              : fieldValue.value.toString();
            if (!display) return null;
            return (
              <div key={fieldDef.id}>
                <span className="font-medium text-slate-600">{fieldDef.name}:</span>{' '}
                {display}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CandidateDetails;
