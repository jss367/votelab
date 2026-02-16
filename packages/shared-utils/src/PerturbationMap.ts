import { SpatialCandidate, Voter } from './types.js';
import { VotingMethod, computeWinner, distance } from './YeeDiagram.js';

export interface PerturbationMapConfig {
  candidates: SpatialCandidate[];
  voters: Voter[];
  targetCandidate: SpatialCandidate;
  method: VotingMethod;
  resolution: number;
  maxVoterPercent: number;
  approvalThreshold?: number;
}

export interface PerturbationResult {
  grid: string[][]; // winner IDs, [row][col]
  targetCandidateId: string;
  resolution: number;
  method: VotingMethod;
}

export interface PerturbationCellInfo {
  voterPercent: number;
  shiftMagnitude: number;
  winner: string;
  votersShifted: number;
}

/**
 * Find voters who don't rank targetCandidate first, sorted by distance to target.
 * These are the "persuadable" voters.
 */
const findNonSupporters = (
  voters: Voter[],
  candidates: SpatialCandidate[],
  targetCandidate: SpatialCandidate
): Voter[] => {
  return voters
    .filter((voter) => {
      // Find closest candidate
      let closestId = candidates[0].id;
      let closestDist = distance(
        voter.position.x,
        voter.position.y,
        candidates[0].x,
        candidates[0].y
      );

      for (const c of candidates) {
        const d = distance(voter.position.x, voter.position.y, c.x, c.y);
        if (d < closestDist) {
          closestDist = d;
          closestId = c.id;
        }
      }

      return closestId !== targetCandidate.id;
    })
    .sort((a, b) => {
      const distA = distance(
        a.position.x,
        a.position.y,
        targetCandidate.x,
        targetCandidate.y
      );
      const distB = distance(
        b.position.x,
        b.position.y,
        targetCandidate.x,
        targetCandidate.y
      );
      return distA - distB; // Closest non-supporters first
    });
};

/**
 * Shift a voter's position toward the target candidate by a given magnitude.
 * magnitude=1 means move all the way to the candidate's position.
 */
const shiftVoterToward = (
  voter: Voter,
  target: SpatialCandidate,
  magnitude: number
): Voter => {
  const dx = target.x - voter.position.x;
  const dy = target.y - voter.position.y;

  return {
    ...voter,
    position: {
      x: voter.position.x + dx * magnitude,
      y: voter.position.y + dy * magnitude,
    },
  };
};

/**
 * Generate a perturbation map showing election outcomes as voters shift toward a target candidate.
 *
 * X-axis (columns): percentage of voters who shift (0 to maxVoterPercent)
 * Y-axis (rows): magnitude of shift (0 = no movement, 1 = move to candidate position)
 */
export const generatePerturbationMap = (
  config: PerturbationMapConfig
): PerturbationResult => {
  const {
    candidates,
    voters,
    targetCandidate,
    method,
    resolution,
    maxVoterPercent,
    approvalThreshold = 0.3,
  } = config;

  const grid: string[][] = [];
  const nonSupporters = findNonSupporters(voters, candidates, targetCandidate);

  for (let row = 0; row < resolution; row++) {
    const gridRow: string[] = [];

    for (let col = 0; col < resolution; col++) {
      // X-axis: voter percentage (0 to maxVoterPercent)
      const voterPercent = (col / (resolution - 1)) * maxVoterPercent;
      // Y-axis: shift magnitude (0 to 1)
      const shiftMagnitude = row / (resolution - 1);

      // Number of non-supporters to shift
      const numToShift = Math.round(voterPercent * nonSupporters.length);

      // Create perturbed voter list
      const perturbedVoters = voters.map((v) => ({ ...v }));

      // Shift the selected non-supporters
      const votersToShift = nonSupporters.slice(0, numToShift);
      const voterPositionMap = new Map(
        voters.map((v, i) => [`${v.position.x},${v.position.y}`, i])
      );

      for (const voter of votersToShift) {
        const key = `${voter.position.x},${voter.position.y}`;
        const idx = voterPositionMap.get(key);
        if (idx !== undefined) {
          perturbedVoters[idx] = shiftVoterToward(
            perturbedVoters[idx],
            targetCandidate,
            shiftMagnitude
          );
        }
      }

      // Run election
      const winner = computeWinner(
        perturbedVoters,
        candidates,
        method,
        approvalThreshold
      );
      gridRow.push(winner);
    }

    grid.push(gridRow);
  }

  return {
    grid,
    targetCandidateId: targetCandidate.id,
    resolution,
    method,
  };
};

/**
 * Get detailed info about a specific cell in the perturbation map.
 */
export const getPerturbationCellInfo = (
  config: PerturbationMapConfig,
  row: number,
  col: number
): PerturbationCellInfo => {
  const { voters, candidates, targetCandidate, resolution, maxVoterPercent } =
    config;

  const voterPercent = (col / (resolution - 1)) * maxVoterPercent;
  const shiftMagnitude = row / (resolution - 1);

  const nonSupporters = findNonSupporters(voters, candidates, targetCandidate);
  const votersShifted = Math.round(voterPercent * nonSupporters.length);

  // Recompute winner for this cell
  const perturbedVoters = voters.map((v) => ({ ...v }));
  const votersToShift = nonSupporters.slice(0, votersShifted);
  const voterPositionMap = new Map(
    voters.map((v, i) => [`${v.position.x},${v.position.y}`, i])
  );

  for (const voter of votersToShift) {
    const key = `${voter.position.x},${voter.position.y}`;
    const idx = voterPositionMap.get(key);
    if (idx !== undefined) {
      perturbedVoters[idx] = shiftVoterToward(
        perturbedVoters[idx],
        targetCandidate,
        shiftMagnitude
      );
    }
  }

  const winner = computeWinner(
    perturbedVoters,
    candidates,
    config.method,
    config.approvalThreshold ?? 0.3
  );

  return {
    voterPercent,
    shiftMagnitude,
    winner,
    votersShifted,
  };
};
