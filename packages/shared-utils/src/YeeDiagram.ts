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

export const computeSmithSet = (
  matrix: Record<string, Record<string, number>>,
  candidateIds: string[]
): string[] => {
  const beats = new Map<string, Set<string>>();
  candidateIds.forEach(id => beats.set(id, new Set()));

  candidateIds.forEach(c1 => {
    candidateIds.forEach(c2 => {
      if (c1 !== c2 && matrix[c1][c2] > matrix[c2][c1]) {
        beats.get(c1)!.add(c2);
      }
    });
  });

  const visited = new Set<string>();
  const finishOrder: string[] = [];

  const dfs1 = (node: string) => {
    if (visited.has(node)) return;
    visited.add(node);
    beats.get(node)!.forEach(next => dfs1(next));
    finishOrder.push(node);
  };

  candidateIds.forEach(id => dfs1(id));

  const reversedBeats = new Map<string, Set<string>>();
  candidateIds.forEach(id => reversedBeats.set(id, new Set()));
  candidateIds.forEach(c1 => {
    beats.get(c1)!.forEach(c2 => {
      reversedBeats.get(c2)!.add(c1);
    });
  });

  visited.clear();
  const components: string[][] = [];

  const dfs2 = (node: string, component: string[]) => {
    if (visited.has(node)) return;
    visited.add(node);
    component.push(node);
    reversedBeats.get(node)!.forEach(next => dfs2(next, component));
  };

  for (let i = finishOrder.length - 1; i >= 0; i--) {
    const node = finishOrder[i];
    if (!visited.has(node)) {
      const component: string[] = [];
      dfs2(node, component);
      components.push(component);
    }
  }

  for (const component of components) {
    const componentSet = new Set(component);
    const beatsAllOutside = candidateIds
      .filter(id => !componentSet.has(id))
      .every(outside =>
        component.some(inside =>
          matrix[inside][outside] > matrix[outside][inside]
        )
      );

    if (beatsAllOutside || component.length === candidateIds.length) {
      return component;
    }
  }

  return candidateIds;
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

  // Debug: log input parameters
  console.log('[YeeDiagram] Starting generation:', {
    voterCount: voters.length,
    candidateCount: candidates.length,
    candidates: candidates.map(c => ({ id: c.id, name: c.name, x: c.x.toFixed(2), y: c.y.toFixed(2) })),
    method,
    resolution,
    approvalThreshold,
    sampleRadius,
  });

  // Debug: sample a few cells
  const debugCells: Array<{ row: number; col: number; x: number; y: number; nearbyCount: number; winner: string }> = [];

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

      // Debug: capture corner and center cells
      if ((row === 0 && col === 0) ||
          (row === 0 && col === resolution - 1) ||
          (row === resolution - 1 && col === 0) ||
          (row === resolution - 1 && col === resolution - 1) ||
          (row === Math.floor(resolution / 2) && col === Math.floor(resolution / 2))) {
        debugCells.push({
          row, col,
          x: parseFloat(cellX.toFixed(3)),
          y: parseFloat(cellY.toFixed(3)),
          nearbyCount: nearbyVoters.length,
          winner,
        });
      }

      gridRow.push(winner);
    }
    grid.push(gridRow);
  }

  console.log('[YeeDiagram] Sample cells:', debugCells);

  // Count winners across the grid
  const winnerCounts: Record<string, number> = {};
  grid.forEach(row => row.forEach(w => {
    winnerCounts[w] = (winnerCounts[w] || 0) + 1;
  }));
  console.log('[YeeDiagram] Winner distribution:', winnerCounts);

  return {
    grid,
    resolution,
    candidates,
    method,
  };
};
