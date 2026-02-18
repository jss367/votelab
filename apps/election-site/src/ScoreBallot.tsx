import React, { useState } from 'react';
import CategoryBadges from './CategoryBadge';
import type { Candidate, CustomField } from './types';

interface ScoreBallotProps {
  candidates: Candidate[];
  customFields?: CustomField[];
  maxScore?: number;
  onChange: (data: { ranking: string[]; approved: string[]; scores: Record<string, number> }) => void;
}

const ScoreBallot: React.FC<ScoreBallotProps> = ({ candidates, customFields, maxScore = 10, onChange }) => {
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    candidates.forEach(c => { initial[c.id] = 0; });
    return initial;
  });

  const handleChange = (candidateId: string, value: number) => {
    const clamped = Math.max(0, Math.min(maxScore, value));
    const next = { ...scores, [candidateId]: clamped };
    setScores(next);
    onChange({ ranking: [], approved: [], scores: next });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">{`Score each candidate from 0 (worst) to ${maxScore} (best):`}</p>
      {candidates.map((candidate) => (
        <div
          key={candidate.id}
          className="flex items-center gap-4 p-3 rounded-lg border bg-slate-50 border-slate-200"
        >
          <div className="flex items-center gap-2 flex-grow">
            <span className="font-medium text-slate-700">{candidate.name}</span>
            <CategoryBadges candidate={candidate} customFields={customFields} />
          </div>
          <input
            type="range"
            min={0}
            max={maxScore}
            value={scores[candidate.id] ?? 0}
            onChange={(e) => handleChange(candidate.id, parseInt(e.target.value, 10))}
            className="w-32 accent-blue-500"
          />
          <input
            type="number"
            min={0}
            max={maxScore}
            value={scores[candidate.id] ?? 0}
            onChange={(e) => handleChange(candidate.id, parseInt(e.target.value, 10) || 0)}
            className="w-14 text-center p-1 rounded border border-slate-300 text-sm"
          />
        </div>
      ))}
    </div>
  );
};

export default ScoreBallot;
