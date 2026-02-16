import React, { useState } from 'react';
import type { Candidate } from './types';

interface CumulativeBallotProps {
  candidates: Candidate[];
  pointBudget: number;
  onChange: (data: { ranking: string[]; approved: string[]; scores: Record<string, number> }) => void;
}

const CumulativeBallot: React.FC<CumulativeBallotProps> = ({ candidates, pointBudget, onChange }) => {
  const [points, setPoints] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    candidates.forEach((c) => { initial[c.id] = 0; });
    return initial;
  });

  const totalUsed = Object.values(points).reduce((sum, p) => sum + p, 0);
  const remaining = pointBudget - totalUsed;

  const handleChange = (candidateId: string, value: number) => {
    const currentOthers = totalUsed - (points[candidateId] ?? 0);
    const maxForThis = pointBudget - currentOthers;
    const clamped = Math.max(0, Math.min(maxForThis, value));
    const next = { ...points, [candidateId]: clamped };
    setPoints(next);
    onChange({ ranking: [], approved: [], scores: next });
  };

  return (
    <div className="space-y-3">
      <div className={`text-center p-2 rounded-lg font-medium ${
        remaining === 0 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
      }`}>
        {remaining} / {pointBudget} points remaining
      </div>
      {candidates.map((candidate) => (
        <div
          key={candidate.id}
          className="flex items-center gap-4 p-3 rounded-lg border bg-slate-50 border-slate-200"
        >
          <span className="font-medium text-slate-700 flex-grow">{candidate.name}</span>
          <input
            type="range"
            min={0}
            max={pointBudget}
            value={points[candidate.id] ?? 0}
            onChange={(e) => handleChange(candidate.id, parseInt(e.target.value, 10))}
            className="w-32 accent-blue-500"
          />
          <input
            type="number"
            min={0}
            max={pointBudget}
            value={points[candidate.id] ?? 0}
            onChange={(e) => handleChange(candidate.id, parseInt(e.target.value, 10) || 0)}
            className="w-14 text-center p-1 rounded border border-slate-300 text-sm"
          />
        </div>
      ))}
    </div>
  );
};

export default CumulativeBallot;
