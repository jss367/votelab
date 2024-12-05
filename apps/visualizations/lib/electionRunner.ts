import { Candidate, Election, Vote } from '@votelab/shared-utils';

export type ElectionMethod =
  | 'plurality'
  | 'approval'
  | 'irv'
  | 'borda'
  | 'smithApproval';

export const methodDescriptions = {
  plurality: "Each voter's first choice gets one vote. Most votes wins.",
  approval: 'Each approved candidate gets one vote. Most votes wins.',
  irv: 'Eliminate last-place candidate and redistribute their votes until majority reached.',
  borda:
    'Points assigned by rank (n-1 for 1st, n-2 for 2nd, etc). Most points wins.',
  smithApproval:
    'Find smallest set of candidates who beat all others, then use approval voting among them.',
};

interface ElectionResults {
  winner: string;
  roundDetails: string[];
  voteCounts: Record<string, number>;
}

function runPluralityElection(
  votes: Vote[],
  candidates: Candidate[]
): ElectionResults {
  const voteCounts: Record<string, number> = {};
  candidates.forEach((c) => (voteCounts[c.id] = 0));

  // Count first preferences
  votes.forEach((vote) => {
    if (vote.ranking.length > 0) {
      voteCounts[vote.ranking[0]]++;
    }
  });

  const winner = Object.entries(voteCounts).reduce((a, b) =>
    a[1] > b[1] ? a : b
  )[0];

  return {
    winner,
    roundDetails: [`Final vote counts: ${JSON.stringify(voteCounts)}`],
    voteCounts,
  };
}

function runApprovalElection(
  votes: Vote[],
  candidates: Candidate[]
): ElectionResults {
  const voteCounts: Record<string, number> = {};
  candidates.forEach((c) => (voteCounts[c.id] = 0));

  // Count approvals
  votes.forEach((vote) => {
    vote.approved.forEach((candidateId) => {
      voteCounts[candidateId]++;
    });
  });

  const winner = Object.entries(voteCounts).reduce((a, b) =>
    a[1] > b[1] ? a : b
  )[0];

  return {
    winner,
    roundDetails: [`Final approval counts: ${JSON.stringify(voteCounts)}`],
    voteCounts,
  };
}

// Add other election methods (IRV, Borda, etc.) similarly...

export function runElection(
  method: ElectionMethod,
  votes: Vote[],
  candidates: Candidate[]
): ElectionResults {
  switch (method) {
    case 'plurality':
      return runPluralityElection(votes, candidates);
    case 'approval':
      return runApprovalElection(votes, candidates);
    // Add other methods...
    default:
      throw new Error(`Unsupported election method: ${method}`);
  }
}

// Helper function to create an Election object
export function createElection(
  title: string,
  candidates: Candidate[],
  votes: Vote[]
): Election {
  return {
    title,
    candidates,
    votes,
    createdAt: new Date().toISOString(),
  };
}
