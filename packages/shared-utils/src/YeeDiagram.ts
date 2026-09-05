import { SpatialCandidate, Voter } from './types.js';

export interface VoterPreference {
  candidateId: string;
  distance: number;
}

export type VotingMethod =
  | 'plurality'
  | 'approval'
  | 'irv'
  | 'borda'
  | 'condorcet'
  | 'smithApproval'
  | 'rrv'
  | 'star'
  | 'score'
  | 'stv'
  | 'rankedPairs'
  | 'majorityJudgment'
  | 'cumulative';

export interface YeeDiagramConfig {
  voters: Voter[];
  candidates: SpatialCandidate[];
  method: VotingMethod;
  resolution: number;
  approvalThreshold?: number;
}

export interface YeeDiagramResult {
  grid: string[][]; // 2D array of winner IDs
  resolution: number;
  candidates: SpatialCandidate[];
  method: VotingMethod;
}

export const distance = (x1: number, y1: number, x2: number, y2: number): number => {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
};

export const getVoterPreferences = (
  voter: Voter,
  candidates: SpatialCandidate[]
): VoterPreference[] => {
  return candidates
    .map(candidate => ({
      candidateId: candidate.id,
      distance: distance(voter.position.x, voter.position.y, candidate.x, candidate.y),
    }))
    .sort((a, b) => a.distance - b.distance);
};

export const computePluralityWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[]
): string => {
  const voteCounts: Record<string, number> = {};
  candidates.forEach(c => (voteCounts[c.id] = 0));

  voters.forEach(voter => {
    const prefs = getVoterPreferences(voter, candidates);
    if (prefs.length > 0) {
      voteCounts[prefs[0].candidateId]++;
    }
  });

  return Object.entries(voteCounts).reduce((a, b) =>
    a[1] > b[1] ? a : b
  )[0];
};

export const computeApprovalWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[],
  threshold: number
): string => {
  const approvalCounts: Record<string, number> = {};
  candidates.forEach(c => (approvalCounts[c.id] = 0));

  voters.forEach(voter => {
    const prefs = getVoterPreferences(voter, candidates);
    if (prefs.length === 0) return;

    // Always approve the closest candidate
    const closestDistance = prefs[0].distance;
    approvalCounts[prefs[0].candidateId]++;

    // Approve additional candidates within threshold of the closest
    // But never approve ALL candidates - stop before the last one
    const maxToApprove = prefs.length - 1;
    let approvedCount = 1;

    for (let i = 1; i < prefs.length && approvedCount < maxToApprove; i++) {
      if (prefs[i].distance <= closestDistance + threshold) {
        approvalCounts[prefs[i].candidateId]++;
        approvedCount++;
      }
    }
  });

  return Object.entries(approvalCounts).reduce((a, b) =>
    a[1] > b[1] ? a : b
  )[0];
};

export const computeBordaWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[]
): string => {
  const scores: Record<string, number> = {};
  candidates.forEach(c => (scores[c.id] = 0));

  const n = candidates.length;

  voters.forEach(voter => {
    const prefs = getVoterPreferences(voter, candidates);
    prefs.forEach((pref, index) => {
      scores[pref.candidateId] += (n - 1 - index);
    });
  });

  return Object.entries(scores).reduce((a, b) =>
    a[1] > b[1] ? a : b
  )[0];
};

export const computeIRVWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[]
): string => {
  const voterPrefs = voters.map(voter =>
    getVoterPreferences(voter, candidates).map(p => p.candidateId)
  );

  let remainingCandidates = candidates.map(c => c.id);

  while (remainingCandidates.length > 1) {
    const voteCounts: Record<string, number> = {};
    remainingCandidates.forEach(id => (voteCounts[id] = 0));

    voterPrefs.forEach(prefs => {
      const firstChoice = prefs.find(id => remainingCandidates.includes(id));
      if (firstChoice) {
        voteCounts[firstChoice]++;
      }
    });

    const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);

    const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] > totalVotes / 2) {
      return sorted[0][0];
    }

    const loser = sorted[sorted.length - 1][0];
    remainingCandidates = remainingCandidates.filter(id => id !== loser);
  }

  return remainingCandidates[0];
};

export const buildPairwiseMatrix = (
  voters: Voter[],
  candidates: SpatialCandidate[]
): Record<string, Record<string, number>> => {
  const matrix: Record<string, Record<string, number>> = {};

  candidates.forEach(c1 => {
    matrix[c1.id] = {};
    candidates.forEach(c2 => {
      if (c1.id !== c2.id) {
        matrix[c1.id][c2.id] = 0;
      }
    });
  });

  voters.forEach(voter => {
    const prefs = getVoterPreferences(voter, candidates);
    for (let i = 0; i < prefs.length; i++) {
      for (let j = i + 1; j < prefs.length; j++) {
        matrix[prefs[i].candidateId][prefs[j].candidateId]++;
      }
    }
  });

  return matrix;
};

export const computeCondorcetWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[]
): string => {
  const matrix = buildPairwiseMatrix(voters, candidates);

  for (const c1 of candidates) {
    let isWinner = true;
    for (const c2 of candidates) {
      if (c1.id === c2.id) continue;
      if (matrix[c1.id][c2.id] <= matrix[c2.id][c1.id]) {
        isWinner = false;
        break;
      }
    }
    if (isWinner) {
      return c1.id;
    }
  }

  return computeIRVWinner(voters, candidates);
};

/**
 * Smith set: the smallest non-empty set of candidates such that every member
 * strictly beats every non-member head-to-head.
 *
 * Computed on the "beats-or-ties" graph (edge a -> b when a does at least as
 * well as b). That relation is complete, so its condensation is a total order
 * and its top strongly connected component is exactly the Smith set: members
 * reach every candidate, and nobody outside can reach in (which would require
 * beating-or-tying a member). Working on strict "beats" edges instead would
 * split tied top candidates into separate components and miss cases like
 * A ties B, both beat C, where the Smith set is {A, B}.
 */
export const computeSmithSet = (
  matrix: Record<string, Record<string, number>>,
  candidateIds: string[]
): string[] => {
  const n = candidateIds.length;
  if (n === 0) return [];
  const beatsOrTies = (a: string, b: string): boolean =>
    (matrix[a]?.[b] ?? 0) >= (matrix[b]?.[a] ?? 0);

  const reachesAll = (start: string): boolean => {
    const seen = new Set<string>([start]);
    const stack = [start];
    while (stack.length) {
      const node = stack.pop()!;
      for (const next of candidateIds) {
        if (!seen.has(next) && beatsOrTies(node, next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return seen.size === n;
  };

  return candidateIds.filter(reachesAll);
};

export const computeSmithApprovalWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[],
  threshold: number
): string => {
  const matrix = buildPairwiseMatrix(voters, candidates);
  const smithSet = computeSmithSet(matrix, candidates.map(c => c.id));

  const smithCandidates = candidates.filter(c => smithSet.includes(c.id));
  return computeApprovalWinner(voters, smithCandidates, threshold);
};

export const computeWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[],
  method: VotingMethod,
  approvalThreshold: number = 0.3
): string => {
  switch (method) {
    case 'plurality':
      return computePluralityWinner(voters, candidates);
    case 'approval':
      return computeApprovalWinner(voters, candidates, approvalThreshold);
    case 'irv':
      return computeIRVWinner(voters, candidates);
    case 'borda':
      return computeBordaWinner(voters, candidates);
    case 'condorcet':
      return computeCondorcetWinner(voters, candidates);
    case 'smithApproval':
      return computeSmithApprovalWinner(voters, candidates, approvalThreshold);
    default:
      throw new Error(`Unknown voting method: ${method}`);
  }
};

/**
 * Generates a Yee diagram.
 *
 * For each cell in the grid, we find all voters within a certain radius of that cell's
 * center and compute who wins the election among just those voters. This shows the
 * local preference at each point in the political space.
 *
 * The radius is set large enough to capture meaningful voter samples while still
 * showing spatial variation.
 */
export const generateYeeDiagram = (config: YeeDiagramConfig): YeeDiagramResult => {
  const { voters, candidates, method, resolution, approvalThreshold = 0.3 } = config;

  const grid: string[][] = [];

  // Use a fixed radius that doesn't depend on resolution
  // This ensures consistent behavior across resolution changes
  const sampleRadius = 0.12;

  for (let row = 0; row < resolution; row++) {
    const gridRow: string[] = [];
    for (let col = 0; col < resolution; col++) {
      const cellX = (col + 0.5) / resolution;
      const cellY = (row + 0.5) / resolution;

      // Find voters near this cell
      const nearbyVoters = voters.filter(voter => {
        const dx = voter.position.x - cellX;
        const dy = voter.position.y - cellY;
        return Math.sqrt(dx * dx + dy * dy) <= sampleRadius;
      });

      let winner: string;
      if (nearbyVoters.length >= 3) {
        // Enough voters to compute a meaningful result
        winner = computeWinner(nearbyVoters, candidates, method, approvalThreshold);
      } else {
        // Not enough voters - use closest candidate to cell center as fallback
        const cellAsVoter: Voter = { position: { x: cellX, y: cellY } };
        const prefs = getVoterPreferences(cellAsVoter, candidates);
        winner = prefs[0].candidateId;
      }

      gridRow.push(winner);
    }
    grid.push(gridRow);
  }

  return {
    grid,
    resolution,
    candidates,
    method,
  };
};
