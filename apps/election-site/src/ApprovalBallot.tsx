import React, { useState } from 'react';
import CategoryBadges from './CategoryBadge';
import type { Candidate, CustomField } from './types';

interface ApprovalBallotProps {
  candidates: Candidate[];
  customFields?: CustomField[];
  onChange: (data: { ranking: string[]; approved: string[] }) => void;
}

const ApprovalBallot: React.FC<ApprovalBallotProps> = ({ candidates, customFields, onChange }) => {
  const [approved, setApproved] = useState<Set<string>>(new Set());

  const handleToggle = (id: string) => {
    const next = new Set(approved);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setApproved(next);
    onChange({ ranking: [], approved: Array.from(next) });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">Check all candidates you approve of:</p>
      {candidates.map((candidate) => (
        <label
          key={candidate.id}
          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
            approved.has(candidate.id)
              ? 'bg-green-50 border-green-300'
              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <input
            type="checkbox"
            checked={approved.has(candidate.id)}
            onChange={() => handleToggle(candidate.id)}
            className="h-4 w-4 rounded text-green-600"
          />
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">{candidate.name}</span>
            <CategoryBadges candidate={candidate} customFields={customFields} />
          </div>
        </label>
      ))}
    </div>
  );
};

export default ApprovalBallot;
