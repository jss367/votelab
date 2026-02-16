import React, { useState } from 'react';
import type { Candidate } from './types';

interface PluralityBallotProps {
  candidates: Candidate[];
  onChange: (data: { ranking: string[]; approved: string[] }) => void;
}

const PluralityBallot: React.FC<PluralityBallotProps> = ({ candidates, onChange }) => {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    setSelected(id);
    onChange({ ranking: [id], approved: [] });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">Pick one candidate:</p>
      {candidates.map((candidate) => (
        <label
          key={candidate.id}
          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
            selected === candidate.id
              ? 'bg-blue-50 border-blue-300'
              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <input
            type="radio"
            name="plurality-vote"
            value={candidate.id}
            checked={selected === candidate.id}
            onChange={() => handleSelect(candidate.id)}
            className="h-4 w-4 text-blue-600"
          />
          <span className="font-medium text-slate-700">{candidate.name}</span>
        </label>
      ))}
    </div>
  );
};

export default PluralityBallot;
