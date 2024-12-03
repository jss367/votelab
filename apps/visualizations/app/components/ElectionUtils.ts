import { Candidate } from './types';

export const VOTER_RADIUS = 0.15; // Radius of voter influence
export const DEFAULT_APPROVAL_THRESHOLD = 0.3;

// Calculate distance between two points
export const distance = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

// Calculate weighted vote based on distance
export const getWeight = (dist: number, radius: number): number => {
  if (dist >= radius) {
    return 0;
  }
  // Modified to use quadratic falloff for smoother weight distribution
  const x = dist / radius;
  return 1 - (x * x);
};

export type VotingMethod = 'plurality' | 'approval' | 'irv';

export const runElection = (
  method: VotingMethod,
  voterX: number,
  voterY: number,
  candidates: Candidate[],
  approvalThreshold: number = DEFAULT_APPROVAL_THRESHOLD
): string => {
  if (candidates.length === 0) {
    throw new Error('No candidates provided');
  }

  if (candidates.length === 1) {
    return candidates[0].id;
  }

  switch (method) {
    case 'plurality': {
      // Calculate weights for all candidates
      const weights = candidates.map(candidate => ({
        id: candidate.id,
        weight: getWeight(distance(voterX, voterY, candidate.x, candidate.y), VOTER_RADIUS)
      }));

      // Return the candidate with highest weight
      return weights.reduce((a, b) => a.weight > b.weight ? a : b).id;
    }

    case 'approval': {
      const votes: Record<string, number> = {};
      candidates.forEach(candidate => {
        const dist = distance(voterX, voterY, candidate.x, candidate.y);
        votes[candidate.id] = dist <= approvalThreshold ?
          getWeight(dist, approvalThreshold) : 0;
      });

      // Find candidates with non-zero votes
      const approvedCandidates = Object.entries(votes)
        .filter(([_, weight]) => weight > 0);

      if (approvedCandidates.length === 0) {
        // If no candidates approved, fall back to plurality
        return runElection('plurality', voterX, voterY, candidates);
      }

      // Return candidate with highest approval weight
      return approvedCandidates
        .reduce((a, b) => b[1] > a[1] ? b : a)[0];
    }

    case 'irv': {
      // Calculate distances to all candidates
      const ranks = candidates
        .map(candidate => ({
          id: candidate.id,
          dist: distance(voterX, voterY, candidate.x, candidate.y)
        }))
        .sort((a, b) => a.dist - b.dist);

      // In single-voter scenario, just return closest candidate
      return ranks[0].id;
    }

    default:
      throw new Error(`Unsupported voting method: ${method}`);
  }
};

// Helper function to simulate an election with multiple voters
export const simulateElection = (
  method: VotingMethod,
  voters: Array<{ x: number, y: number }>,
  candidates: Candidate[],
  approvalThreshold: number = DEFAULT_APPROVAL_THRESHOLD
): Record<string, number> => {
  const votes: Record<string, number> = {};
  candidates.forEach(c => votes[c.id] = 0);

  voters.forEach(voter => {
    const winnerId = runElection(method, voter.x, voter.y, candidates, approvalThreshold);
    votes[winnerId]++;
  });

  return votes;
};
