import React from 'react';
import ApprovalResults from './ApprovalResults';
import BordaResults from './BordaResults';
import CondorcetResults from './CondorcetResults';
import ElectionResults from './ElectionResults';
import IRVResults from './IRVResults';
import PluralityResults from './PluralityResults';
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
    default:
      return <ElectionResults election={election} />;
  }
};

export default MethodResults;
