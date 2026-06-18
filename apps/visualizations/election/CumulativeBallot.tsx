import React, { useState } from 'react';
import CandidateDetails from './CandidateDetails';
import type { Candidate, CustomField } from './types';

interface CumulativeBallotProps {
  candidates: Candidate[];
  customFields?: CustomField[];
  pointBudget: number;
  onChange: (data: { ranking: string[]; approved: string[]; scores: Record<string, number> }) => void;
}

const CumulativeBallot: React.FC<CumulativeBallotProps> = ({ candidates, customFields, pointBudget, onChange }) => {
  const [points, setPoints] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    candidates.forEach((c) => { initial[c.id] = 0; });
    return initial;
  });

  // Only count points for candidates still on the ballot. If an admin removes a
  // candidate mid-vote, its stale entry lingers in `points` with no control to
  // clear it; counting it would silently consume the budget and let the voter
  // get stuck at 0 remaining with points the tally ignores.
  const sumVisible = (pts: Record<string, number>) =>
    candidates.reduce((sum, c) => sum + (pts[c.id] ?? 0), 0);

  const totalUsed = sumVisible(points);
  const remaining = pointBudget - totalUsed;

  const handleChange = (candidateId: string, value: number) => {
    const currentOthers = totalUsed - (points[candidateId] ?? 0);
    const maxForThis = pointBudget - currentOthers;
    const clamped = Math.max(0, Math.min(maxForThis, value));
    const next = { ...points, [candidateId]: clamped };
    setPoints(next);
    // Emit scores only for current candidates so removed candidates' stale
    // points are never submitted.
    const scores: Record<string, number> = {};
    candidates.forEach((c) => {
      scores[c.id] = next[c.id] ?? 0;
    });
    onChange({ ranking: [], approved: [], scores });
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
          <div className="flex-grow">
            <CandidateDetails candidate={candidate} customFields={customFields} />
          </div>
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
