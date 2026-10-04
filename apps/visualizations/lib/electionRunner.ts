import { Candidate, Election, Vote, computeSmithSet } from '@votelab/shared-utils';

export type ElectionMethod =
  | 'plurality'
  | 'approval'
  | 'irv'
  | 'borda'
  | 'condorcet'
  | 'smithApproval';

export const methodDescriptions = {
  plurality: "Each voter's first choice gets one vote. Most votes wins.",
  approval: 'Each approved candidate gets one vote. Most votes wins.',
  irv: 'Eliminate last-place candidate and redistribute their votes until majority reached.',
  borda:
    'Points assigned by rank (n-1 for 1st, n-2 for 2nd, etc). Most points wins.',
  condorcet:
    'Winner must beat all other candidates in head-to-head comparisons. Falls back to IRV if no such winner exists.',
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
      if (candidateId in voteCounts) voteCounts[candidateId]++;
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

function runBordaElection(
  votes: Vote[],
  candidates: Candidate[]
): ElectionResults {
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

function runIRVElection(
  votes: Vote[],
  candidates: Candidate[]
): ElectionResults {
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

/**
 * Pairwise preference matrix: matrix[a][b] = ballots ranking a above b.
 * A ranked candidate beats every unranked one (matching the shared tallies in
 * @votelab/shared-utils); a pair where neither is ranked contributes nothing.
 * Ids not in `candidates` are ignored.
 */
function buildPairwiseMatrix(
  votes: Vote[],
  candidates: Candidate[]
): Record<string, Record<string, number>> {
  const ids = candidates.map((c) => c.id);
  const matrix: Record<string, Record<string, number>> = {};
  for (const a of ids) {
    matrix[a] = {};
    for (const b of ids) if (a !== b) matrix[a][b] = 0;
  }
  for (const vote of votes) {
    const pos = new Map<string, number>();
    vote.ranking.forEach((id, i) => {
      if (id in matrix && !pos.has(id)) pos.set(id, i);
    });
    for (let x = 0; x < ids.length; x++) {
      for (let y = x + 1; y < ids.length; y++) {
        const a = ids[x];
        const b = ids[y];
        const pa = pos.get(a) ?? Infinity;
        const pb = pos.get(b) ?? Infinity;
        if (pa === Infinity && pb === Infinity) continue;
        if (pa < pb) matrix[a][b]++;
        else if (pb < pa) matrix[b][a]++;
      }
    }
  }
  return matrix;
}

function runCondorcetElection(
  votes: Vote[],
  candidates: Candidate[]
): ElectionResults {
  const preferences = buildPairwiseMatrix(votes, candidates);

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
      voteCounts: { [condorcetWinner]: votes.length },
    };
  }

  // If no Condorcet winner, fall back to IRV
  details.push('No Condorcet winner found, falling back to IRV');
  const irvResult = runIRVElection(votes, candidates);
  return {
    ...irvResult,
    roundDetails: [...details, ...irvResult.roundDetails],
  };
}

/**
 * Smith set + approval: restrict to the smallest set of candidates that beat
 * every outsider head-to-head, then pick the most-approved among them.
 */
function runSmithApprovalElection(
  votes: Vote[],
  candidates: Candidate[]
): ElectionResults {
  const ids = candidates.map((c) => c.id);
  const matrix = buildPairwiseMatrix(votes, candidates);
  const smithSet = new Set(computeSmithSet(matrix, ids));
  const smithCandidates = candidates.filter((c) => smithSet.has(c.id));
  const approval = runApprovalElection(votes, smithCandidates);
  return {
    ...approval,
    roundDetails: [
      `Smith set: ${[...smithSet].join(', ')}`,
      ...approval.roundDetails,
    ],
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
      return runSmithApprovalElection(votes, candidates);
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
