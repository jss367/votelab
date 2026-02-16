import React, { useState } from 'react';
import type { Candidate } from './types';

const GRADES = ['Reject', 'Poor', 'Acceptable', 'Good', 'Very Good', 'Excellent'];
const GRADE_COLORS = [
  'bg-red-100 border-red-300 text-red-800',
  'bg-orange-100 border-orange-300 text-orange-800',
  'bg-yellow-100 border-yellow-300 text-yellow-800',
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-green-100 border-green-300 text-green-800',
  'bg-emerald-100 border-emerald-300 text-emerald-800',
];

interface GradeBallotProps {
  candidates: Candidate[];
  onChange: (data: { ranking: string[]; approved: string[]; scores: Record<string, number> }) => void;
}

const GradeBallot: React.FC<GradeBallotProps> = ({ candidates, onChange }) => {
  const [grades, setGrades] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    candidates.forEach((c) => { initial[c.id] = -1; });
    return initial;
  });

  const handleChange = (candidateId: string, grade: number) => {
    const next = { ...grades, [candidateId]: grade };
    setGrades(next);
    const scores: Record<string, number> = {};
    for (const [id, g] of Object.entries(next)) {
      scores[id] = g < 0 ? 0 : g;
    }
    onChange({ ranking: [], approved: [], scores });
  };

  return (
    <div className="space-y-3">
      {candidates.map((candidate) => (
        <div
          key={candidate.id}
          className="p-3 rounded-lg border bg-slate-50 border-slate-200 space-y-2"
        >
          <span className="font-medium text-slate-700">{candidate.name}</span>
          <div className="flex flex-wrap gap-1">
            {GRADES.map((label, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleChange(candidate.id, index)}
                className={`px-2 py-1 text-xs rounded border transition-all ${
                  grades[candidate.id] === index
                    ? `${GRADE_COLORS[index]} font-bold ring-2 ring-offset-1 ring-blue-400`
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default GradeBallot;
