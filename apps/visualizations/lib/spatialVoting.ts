// Import base types but define spatial-specific types
import { Candidate, Election, Vote } from '@votelab/shared-utils';
import { VotingMethod } from './votingMethods';
export interface SpatialCandidate extends Candidate {
  x: number;
  y: number;
  color: string;
}

export interface SpatialVoter {
  x: number;
  y: number;
}

// Constants for spatial calculations
export const VOTER_RADIUS = 0.15;
export const DEFAULT_APPROVAL_THRESHOLD = 0.3;

// Calculate distance between two points
export const distance = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

// Calculate weighted vote based on distance
export const getWeight = (dist: number, radius: number): number => {
  if (dist >= radius) return 0;
  const x = dist / radius;
  return 1 - x * x; // Quadratic falloff for smoother weight distribution
};

// Type guard to check if candidates have spatial data
export const isSpatialCandidate = (
  candidate: Candidate
): candidate is SpatialCandidate => {
  return (
    typeof candidate.x === 'number' &&
    typeof candidate.y === 'number' &&
    typeof (candidate as SpatialCandidate).color === 'string'
  );
};

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

// Convert a single spatial position into a Vote object
export function generateVoteFromPosition(
  voter: SpatialVoter,
  candidates: SpatialCandidate[],
  approvalThreshold: number = DEFAULT_APPROVAL_THRESHOLD
): Vote {
  // Calculate distances to all candidates
  const candidateDistances = candidates.map((candidate) => ({
    id: candidate.id,
    distance: distance(voter.x, voter.y, candidate.x, candidate.y),
  }));

  // Sort by distance to create ranking
  const ranking = [...candidateDistances]
    .sort((a, b) => a.distance - b.distance)
    .map((c) => c.id);

  // Determine approved candidates based on threshold
  const approved = candidateDistances
    .filter((c) => c.distance <= approvalThreshold)
    .map((c) => c.id);

  // If no candidates approved, approve the closest one
  if (approved.length === 0) {
    approved.push(ranking[0]);
  }

  return {
    voterName: `Voter at (${voter.x.toFixed(2)}, ${voter.y.toFixed(2)})`,
    ranking,
    approved,
    timestamp: new Date().toISOString(),
  };
}

// Generate multiple votes from spatial data
export function generateVotesFromSpatialData(
  voters: SpatialVoter[],
  candidates: Candidate[],
  options: { approvalThreshold?: number } = {}
): Vote[] {
  // Validate that all candidates have spatial data
  if (!candidates.every(isSpatialCandidate)) {
    throw new Error(
      'All candidates must have spatial coordinates (x, y) and color'
    );
  }

  const spatialCandidates = candidates as SpatialCandidate[];
  const { approvalThreshold = DEFAULT_APPROVAL_THRESHOLD } = options;

  return voters.map((voter) =>
    generateVoteFromPosition(voter, spatialCandidates, approvalThreshold)
  );
}

export function createElectionFromSpatialVotes(
  title: string,
  candidates: Candidate[],
  voters: SpatialVoter[],
  options: { approvalThreshold?: number } = {}
): Election {
  const votes = generateVotesFromSpatialData(voters, candidates, options);

  return {
    title,
    candidates,
    votes,
    createdAt: new Date().toISOString(),
  };
}

function getPairwisePreferences(
  voterX: number,
  voterY: number,
  candidates: SpatialCandidate[]
): [string, string][] {
  const prefs = getVoterPreference(voterX, voterY, candidates);
  const pairs: [string, string][] = [];

  // Create all possible pairs in order of preference
  for (let i = 0; i < prefs.length; i++) {
    for (let j = i + 1; j < prefs.length; j++) {
      pairs.push([prefs[i].id, prefs[j].id]);
    }
  }

  return pairs;
}

function findSmithSet(
  voterX: number,
  voterY: number,
  candidates: SpatialCandidate[]
): Set<string> {
  const pairs = getPairwisePreferences(voterX, voterY, candidates);
  const defeats = new Map<string, Set<string>>();

  // Initialize defeats map
  candidates.forEach((c) => defeats.set(c.id, new Set<string>()));

  // Record all pairwise defeats
  pairs.forEach(([winner, loser]) => {
    defeats.get(winner)?.add(loser);
  });

  // Find Smith set
  const smithSet = new Set<string>(candidates.map((c) => c.id));
  let changed = true;

  while (changed) {
    changed = false;
    for (const candidate of smithSet) {
      for (const other of smithSet) {
        if (candidate !== other) {
          // If candidate doesn't beat other, and other beats candidate
          if (
            !defeats.get(candidate)?.has(other) &&
            defeats.get(other)?.has(candidate)
          ) {
            smithSet.delete(candidate);
            changed = true;
            break;
          }
        }
      }
      if (changed) break;
    }
  }

  return smithSet;
}

// Define the method signatures
type PluralityCalculator = (
  x: number,
  y: number,
  candidates: SpatialCandidate[]
) => string[];
type ApprovalCalculator = (
  x: number,
  y: number,
  candidates: SpatialCandidate[],
  threshold: number
) => string[];
type IRVCalculator = (
  x: number,
  y: number,
  candidates: SpatialCandidate[]
) => string[];
type BordaCalculator = (
  x: number,
  y: number,
  candidates: SpatialCandidate[]
) => string[];
type SmithApprovalCalculator = (
  x: number,
  y: number,
  candidates: SpatialCandidate[],
  threshold: number
) => string[];

export const spatialVoteCalculators = {
  plurality: ((x: number, y: number, candidates: SpatialCandidate[]) => {
    return [getVoterPreference(x, y, candidates)[0].id];
  }) as PluralityCalculator,

  approval: ((
    x: number,
    y: number,
    candidates: SpatialCandidate[],
    threshold: number
  ) => {
    const prefs = getVoterPreference(x, y, candidates);
    const approvedCandidates = prefs.filter((p) => p.dist <= threshold);
    return approvedCandidates.length > 0
      ? approvedCandidates.map((c) => c.id)
      : [prefs[0].id];
  }) as ApprovalCalculator,

  borda: ((x: number, y: number, candidates: SpatialCandidate[]) => {
    const prefs = getVoterPreference(x, y, candidates);
    const points = new Map<string, number>();

    prefs.forEach((p, i) => {
      points.set(p.id, candidates.length - 1 - i);
    });

    return [...points.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }) as BordaCalculator,

  irv: ((x: number, y: number, candidates: SpatialCandidate[]) => {
    return getVoterPreference(x, y, candidates).map((p) => p.id);
  }) as IRVCalculator,

  smithApproval: ((
    x: number,
    y: number,
    candidates: SpatialCandidate[],
    threshold: number
  ) => {
    const smithSet = findSmithSet(x, y, candidates);
    const smithCandidates = candidates.filter((c) => smithSet.has(c.id));
    return spatialVoteCalculators.approval(x, y, smithCandidates, threshold);
  }) as SmithApprovalCalculator,
};

// Type for accessing the calculators
export type SpatialVoteCalculator<M extends VotingMethod> = M extends 'approval'
  ? ApprovalCalculator
  : M extends 'smithApproval'
    ? SmithApprovalCalculator
    : PluralityCalculator | IRVCalculator | BordaCalculator;
