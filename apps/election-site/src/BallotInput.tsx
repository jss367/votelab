import React from 'react';
import ApprovalBallot from './ApprovalBallot';
import PluralityBallot from './PluralityBallot';
import RankedApprovalList from './RankedApprovalList';
import ScoreBallot from './ScoreBallot';
import type { Candidate, VotingMethod } from './types';

interface BallotInputProps {
  method: VotingMethod;
  candidates: Candidate[];
  onChange: (data: {
    ranking: Candidate[];
    approved: string[];
    scores?: Record<string, number>;
  }) => void;
}

const BALLOT_INSTRUCTIONS: Record<VotingMethod, string> = {
  plurality: 'Pick your one favorite candidate.',
  approval: 'Check all the candidates you approve of.',
  irv: 'Drag to rank candidates from most to least preferred.',
  borda: 'Drag to rank candidates from most to least preferred. Points are awarded by position.',
  condorcet: 'Drag to rank candidates from most to least preferred.',
  smithApproval: '1. Drag to rank the candidates in your preferred order.\n2. Drag the blue line to set your approval threshold — candidates above the line are approved.',
  rrv: 'Score each candidate from 0 (worst) to 10 (best).',
};

const BallotInput: React.FC<BallotInputProps> = ({ method, candidates, onChange }) => {
  const handleSimpleBallot = (data: { ranking: string[]; approved: string[] }) => {
    // Convert string IDs back to candidate objects for ranking
    const rankedCandidates = data.ranking
      .map(id => candidates.find(c => c.id === id))
      .filter((c): c is Candidate => c !== undefined);
    onChange({ ranking: rankedCandidates, approved: data.approved });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 whitespace-pre-line">
        {BALLOT_INSTRUCTIONS[method]}
      </p>

      {method === 'plurality' && (
        <PluralityBallot candidates={candidates} onChange={handleSimpleBallot} />
      )}

      {method === 'approval' && (
        <ApprovalBallot candidates={candidates} onChange={handleSimpleBallot} />
      )}

      {(method === 'irv' || method === 'borda' || method === 'condorcet') && (
        <RankedApprovalList
          candidates={candidates}
          onChange={({ ranking, approved }) => onChange({ ranking, approved })}
          showApprovalLine={false}
        />
      )}

      {method === 'smithApproval' && (
        <RankedApprovalList
          candidates={candidates}
          onChange={({ ranking, approved }) => onChange({ ranking, approved })}
          showApprovalLine={true}
        />
      )}

      {method === 'rrv' && (
        <ScoreBallot
          candidates={candidates}
          onChange={(data) => onChange({ ranking: [], approved: [], scores: data.scores })}
        />
      )}
    </div>
  );
};

export default BallotInput;
