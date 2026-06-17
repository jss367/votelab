import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import React from 'react';
import ApprovalResults from './ApprovalResults';
import BordaResults from './BordaResults';
import CondorcetResults from './CondorcetResults';
import CumulativeResults from './CumulativeResults';
import ElectionResults from './ElectionResults';
import IRVResults from './IRVResults';
import MajorityJudgmentResults from './MajorityJudgmentResults';
import PluralityResults from './PluralityResults';
import RankedPairsResults from './RankedPairsResults';
import RRVResults from './RRVResults';
import ScoreResults from './ScoreResults';
import STARResults from './STARResults';
import STVResults from './STVResults';
import type { Election } from './types';

const MethodResults: React.FC<{ election: Election }> = ({ election }) => {
  const method = election.votingMethod || 'smithApproval';

  // The method-specific tally components sort zero counts and would surface an
  // arbitrary "winner" for an election with no ballots, or dereference the first
  // entry of an empty candidate list (e.g. an admin removes the last candidate
  // after votes were already cast). Guard centrally here so every method shows a
  // safe state (ElectionResults already does this for the smithApproval path).
  if (election.votes.length === 0 || election.candidates.length === 0) {
    return (
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle className="text-xl">
            Election Results: {election.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {election.candidates.length === 0
              ? 'This election has no candidates to tally.'
              : 'No votes have been cast yet.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  switch (method) {
    case 'plurality':
      return <PluralityResults election={election} />;
    case 'approval':
      return <ApprovalResults election={election} />;
    case 'irv':
      return <IRVResults election={election} />;
    case 'borda':
      return <BordaResults election={election} />;
    case 'condorcet':
      return <CondorcetResults election={election} />;
    case 'smithApproval':
      return <ElectionResults election={election} />;
    case 'rrv':
      return <RRVResults election={election} />;
    case 'star':
      return <STARResults election={election} />;
    case 'score':
      return <ScoreResults election={election} />;
    case 'stv':
      return <STVResults election={election} />;
    case 'rankedPairs':
      return <RankedPairsResults election={election} />;
    case 'majorityJudgment':
      return <MajorityJudgmentResults election={election} />;
    case 'cumulative':
      return <CumulativeResults election={election} />;
    default:
      return <ElectionResults election={election} />;
  }
};

export default MethodResults;
