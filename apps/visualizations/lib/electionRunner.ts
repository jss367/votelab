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
  | 'condorcet'
  | 'smithApproval';

type ElectionRound = ElectionResult[];

export const methodDescriptions = {
  plurality: "Each voter's first choice gets one vote. Most votes wins.",
  approval: 'Each approved candidate gets one vote. Most votes wins.',
  irv: 'Eliminate last-place candidate and redistribute their votes until majority reached.',
  borda: 'Points assigned by rank (n-1 for 1st, n-2 for 2nd, etc). Most points wins.',
  condorcet: 'Winner must beat all other candidates in head-to-head comparisons. Falls back to IRV if no such winner exists.',
  smithApproval: 'Find smallest set of candidates who beat all others, then use approval voting among them.',
};

interface ElectionResults {
  winner: string;
  roundDetails: string[];
  voteCounts: Record<string, number>;
}

function runPluralityElection(votes: Vote[], candidates: Candidate[]): ElectionResults {
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

function runApprovalElection(votes: Vote[], candidates: Candidate[]): ElectionResults {
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

function runBordaElection(votes: Vote[], candidates: Candidate[]): ElectionResults {
  const voteCounts: Record<string, number> = {};
  candidates.forEach((c) => (voteCounts[c.id] = 0));

  // For each vote, award points based on ranking
  votes.forEach((vote) => {
    vote.ranking.forEach((candidateId, index) => {
      // Points are (n-1) for first place, (n-2) for second, etc.
      const points = candidates.length - 1 - index;
      voteCounts[candidateId] += points;
    });
  });

  const winner = Object.entries(voteCounts).reduce((a, b) =>
    a[1] > b[1] ? a : b
  )[0];

  return {
    winner,
    roundDetails: [`Final Borda counts: ${JSON.stringify(voteCounts)}`],
    voteCounts,
  };
}

function runIRVElection(votes: Vote[], candidates: Candidate[]): ElectionResults {
  let remainingCandidates = [...candidates];
  const currentBallots = [...votes];
  const rounds: string[] = [];

  while (remainingCandidates.length > 1) {
    // Count first preferences among remaining candidates
    const voteCounts: Record<string, number> = {};
    remainingCandidates.forEach((c) => (voteCounts[c.id] = 0));

    currentBallots.forEach((ballot) => {
      const firstChoice = ballot.ranking.find((candidateId) =>
        remainingCandidates.some((c) => c.id === candidateId)
      );
      if (firstChoice) {
        voteCounts[firstChoice]++;
      }
    });

    const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);
    rounds.push(`Round counts: ${JSON.stringify(voteCounts)}`);

    // Check for majority winner
    const leader = Object.entries(voteCounts).reduce((a, b) =>
      a[1] > b[1] ? a : b
    );

    if (leader[1] > totalVotes / 2) {
      return {
        winner: leader[0],
        roundDetails: rounds,
        voteCounts,
      };
    }

    // Eliminate candidate with fewest votes
    const loser = Object.entries(voteCounts).reduce((a, b) =>
      a[1] < b[1] ? a : b
    );
    remainingCandidates = remainingCandidates.filter((c) => c.id !== loser[0]);
    rounds.push(`Eliminated: ${loser[0]}`);
  }

  return {
    winner: remainingCandidates[0].id,
    roundDetails: rounds,
    voteCounts: { [remainingCandidates[0].id]: currentBallots.length },
  };
}

function runCondorcetElection(votes: Vote[], candidates: Candidate[]): ElectionResults {
  // Create pairwise preference matrix
  const preferences: Record<string, Record<string, number>> = {};
  candidates.forEach(c1 => {
    preferences[c1.id] = {};
    candidates.forEach(c2 => {
      if (c1.id !== c2.id) {
        preferences[c1.id][c2.id] = 0;
      }
    });
  });

  // Count pairwise preferences
  votes.forEach(vote => {
    for (let i = 0; i < vote.ranking.length; i++) {
      for (let j = i + 1; j < vote.ranking.length; j++) {
        preferences[vote.ranking[i]][vote.ranking[j]]++;
      }
    }
  });

  // Find Condorcet winner (if exists)
  let condorcetWinner: string | null = null;
  const details: string[] = [];

  candidateLoop: for (const c1 of candidates) {
    let isWinner = true;
    for (const c2 of candidates) {
      if (c1.id === c2.id) continue;
      if (preferences[c1.id][c2.id] <= preferences[c2.id][c1.id]) {
        isWinner = false;
        break;
      }
    }
    if (isWinner) {
      condorcetWinner = c1.id;
      break candidateLoop;
    }
  }

  if (condorcetWinner) {
    details.push(`Found Condorcet winner: ${condorcetWinner}`);
    details.push(`Pairwise preferences: ${JSON.stringify(preferences)}`);
    return {
      winner: condorcetWinner,
      roundDetails: details,
      voteCounts: { [condorcetWinner]: votes.length }
    };
  }

  // If no Condorcet winner, fall back to IRV
  details.push('No Condorcet winner found, falling back to IRV');
  const irvResult = runIRVElection(votes, candidates);
  return {
    ...irvResult,
    roundDetails: [...details, ...irvResult.roundDetails]
  };
}

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
    case 'borda':
      return runBordaElection(votes, candidates);
    case 'condorcet':
      return runCondorcetElection(votes, candidates);
    case 'smithApproval':
      // For now, fall back to approval since Smith set calculation isn't implemented
      return runApprovalElection(votes, candidates);
    default:
      throw new Error(`Unsupported election method: ${method}`);
  }
}

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
