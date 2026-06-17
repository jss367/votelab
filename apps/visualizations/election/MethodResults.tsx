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
