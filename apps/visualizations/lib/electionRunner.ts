import { Candidate, Election, Vote } from '@votelab/shared-utils';

interface ElectionResult {
  name: string;
  votes: number;
  status: string;
}

export type ElectionMethod =
  | 'plurality'
  | 'approval'
  | 'irv'
  | 'borda'
  | 'smithApproval';

type ElectionRound = ElectionResult[];

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

function runIRVElection(
  votes: Vote[],
  candidates: Candidate[]
): ElectionResults {
  let remainingCandidates = [...candidates];
  const currentBallots = [...votes];

  while (remainingCandidates.length > 1) {
    // Count first preferences among remaining candidates
    const voteCounts: Record<string, number> = {};
    remainingCandidates.forEach((c) => (voteCounts[c.id] = 0));

    currentBallots.forEach((ballot) => {
      // Find the first preference that's still in the race
      const firstChoice = ballot.ranking.find((candidateId) =>
        remainingCandidates.some((c) => c.id === candidateId)
      );
      if (firstChoice) {
        voteCounts[firstChoice]++;
      }
    });

    const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);

    // Check for majority winner
    const leader = Object.entries(voteCounts).reduce((a, b) =>
      a[1] > b[1] ? a : b
    );

    if (leader[1] > totalVotes / 2) {
      // We have a winner!
      return {
        winner: leader[0],
        roundDetails: [`Final vote counts: ${JSON.stringify(voteCounts)}`],
        voteCounts,
      };
    }

    // No majority - eliminate candidate with fewest votes
    const loser = Object.entries(voteCounts).reduce((a, b) =>
      a[1] < b[1] ? a : b
    );

    // Remove the losing candidate for the next round
    remainingCandidates = remainingCandidates.filter((c) => c.id !== loser[0]);
  }

  // If we get here, only one candidate remains
  return {
    winner: remainingCandidates[0].id,
    roundDetails: [`Winner by elimination: ${remainingCandidates[0].id}`],
    voteCounts: { [remainingCandidates[0].id]: currentBallots.length },
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
    case 'irv':
      return runIRVElection(votes, candidates);
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
