import { Candidate, Vote } from '@votelab/shared-utils';
import { ElectionMethod, runElection } from './electionRunner';
import { VotingMethod } from './votingMethods';

export interface SpatialCandidate extends Candidate {
  x: number;
  y: number;
  color: string;
}

interface VoterDistribution {
  mean: { x: number; y: number };
  variance: number;
  count: number;
}

interface ElectionResults {
  winner: string | string[];
  roundDetails: string[];
  voteCounts: Record<string, number>;
}

// Constants
export const VOTER_RADIUS = 0.15;
export const DEFAULT_APPROVAL_THRESHOLD = 0.3;
export const DEFAULT_VOTER_COUNT = 1000;
export const DEFAULT_VARIANCE = 0.1;

// Box-Muller transform for normal distribution
const randn_bm = (): number => {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

// Base utility functions
export const distance = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

export const getWeight = (dist: number, radius: number): number => {
  if (dist >= radius) return 0;
  const x = dist / radius;
  return 1 - x * x; // Quadratic falloff
};

// Get voter preference order based on distances
export const getVoterPreference = (
  voterX: number,
  voterY: number,
  candidates: SpatialCandidate[]
) => {
  return candidates
    .map((candidate) => ({
      id: candidate.id,
      dist: distance(voterX, voterY, candidate.x, candidate.y),
    }))
    .sort((a, b) => a.dist - b.dist);
};

// Generate normally distributed voters around a point
function generateVoterDistribution(
  params: VoterDistribution
): Array<{ x: number; y: number }> {
  const voters = [];

  for (let i = 0; i < params.count; i++) {
    let x: number, y: number;
    do {
      x = params.mean.x + randn_bm() * params.variance;
      y = params.mean.y + randn_bm() * params.variance;
    } while (x < 0 || x > 1 || y < 0 || y > 1);

    voters.push({ x, y });
  }

  return voters;
}

// Run a full election simulation for a point on the map
function simulateElectionAtPoint(
  point: { x: number; y: number },
  candidates: SpatialCandidate[],
  method: string,
  voterParams: Omit<VoterDistribution, 'mean'> = {
    count: DEFAULT_VOTER_COUNT,
    variance: DEFAULT_VARIANCE,
  }
): string[] {
  // Generate voter distribution centered at this point
  const voters = generateVoterDistribution({
    mean: point,
    ...voterParams,
  });

  // Generate ballots for each voter based on their position
  const votes = voters.map((voter) => {
    const prefs = getVoterPreference(voter.x, voter.y, candidates);

    return {
      ranking: prefs.map((p) => p.id),
      approved:
        method === 'approval'
          ? prefs
              .filter((p) => p.dist <= DEFAULT_APPROVAL_THRESHOLD)
              .map((p) => p.id)
          : [],
      timestamp: new Date().toISOString(),
      voterName: `sim-voter-${Math.random()}`,
    };
  });

  // Run election
  const results =
    method === 'condorcet'
      ? runCondorcetElection(votes, candidates)
      : runElection(method as ElectionMethod, votes, candidates);

  return Array.isArray(results.winner) ? results.winner : [results.winner];
}

// Condorcet implementation
function runCondorcetElection(
  votes: Vote[],
  candidates: Candidate[]
): ElectionResults {
  // Create pairwise preference matrix
  const preferences: Record<string, Record<string, number>> = {};
  candidates.forEach((c1) => {
    preferences[c1.id] = {};
    candidates.forEach((c2) => {
      if (c1.id !== c2.id) {
        preferences[c1.id][c2.id] = 0;
      }
    });
  });

  // Count pairwise preferences
  votes.forEach((vote) => {
    for (let i = 0; i < vote.ranking.length; i++) {
      for (let j = i + 1; j < vote.ranking.length; j++) {
        preferences[vote.ranking[i]][vote.ranking[j]]++;
      }
    }
  });

  // Find Condorcet winner (if exists)
  let condorcetWinner: string | null = null;
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

  // If no Condorcet winner, fall back to IRV
  if (!condorcetWinner) {
    return runElection('irv', votes, candidates);
  }

  return {
    winner: condorcetWinner,
    roundDetails: ['Condorcet winner found'],
    voteCounts: { [condorcetWinner]: votes.length },
  };
}

// Method calculator types
type BaseCalculator = (
  x: number,
  y: number,
  candidates: SpatialCandidate[]
) => string[];
type ThresholdCalculator = (
  x: number,
  y: number,
  candidates: SpatialCandidate[],
  threshold: number
) => string[];

export type SpatialVoteCalculator<M extends VotingMethod> = M extends
  | 'approval'
  | 'smithApproval'
  ? ThresholdCalculator
  : BaseCalculator;

// Generate a vote from a single position
export const generateVoteFromPosition = (
  position: { x: number; y: number },
  candidates: SpatialCandidate[],
  approvalThreshold: number = DEFAULT_APPROVAL_THRESHOLD
): Vote => {
  const prefs = getVoterPreference(position.x, position.y, candidates);

  return {
    ranking: prefs.map((p) => p.id),
    approved: prefs.filter((p) => p.dist <= approvalThreshold).map((p) => p.id),
    timestamp: new Date().toISOString(),
    voterName: `voter-${Math.random().toString(36).slice(2)}`,
  };
};

// Generate votes from multiple positions
export const generateVotesFromSpatialData = (
  voters: Array<{ x: number; y: number }>,
  candidates: SpatialCandidate[],
  approvalThreshold: number = DEFAULT_APPROVAL_THRESHOLD
): Vote[] => {
  return voters.map((voter) =>
    generateVoteFromPosition(voter, candidates, approvalThreshold)
  );
};

// The actual calculators
export const spatialVoteCalculators = {
  plurality: ((x, y, candidates) => {
    const prefs = getVoterPreference(x, y, candidates);
    return [prefs[0].id]; // Return closest candidate
  }) as BaseCalculator,

  approval: ((x, y, candidates, threshold = DEFAULT_APPROVAL_THRESHOLD) => {
    const prefs = getVoterPreference(x, y, candidates);
    return prefs.filter((p) => p.dist <= threshold).map((p) => p.id);
  }) as ThresholdCalculator,

  irv: ((x, y, candidates) => {
    const prefs = getVoterPreference(x, y, candidates);
    return prefs.map((p) => p.id); // Return full ranking by distance
  }) as BaseCalculator,

  condorcet: ((x, y, candidates) =>
    simulateElectionAtPoint(
      { x, y },
      candidates,
      'condorcet'
    )) as BaseCalculator,

  borda: ((x, y, candidates) => {
    const prefs = getVoterPreference(x, y, candidates);
    return prefs.map((p) => p.id); // Return full ranking by distance
  }) as BaseCalculator,

  smithApproval: ((x, y, candidates, threshold = DEFAULT_APPROVAL_THRESHOLD) => {
    const prefs = getVoterPreference(x, y, candidates);
    // For a single voter, Smith set is just the closest candidate
    // and approval is based on threshold
    const approved = prefs.filter((p) => p.dist <= threshold).map((p) => p.id);
    return approved.length > 0 ? approved : [prefs[0].id];
  }) as ThresholdCalculator,
} as const;

export type SpatialVotingMethod = keyof typeof spatialVoteCalculators;
