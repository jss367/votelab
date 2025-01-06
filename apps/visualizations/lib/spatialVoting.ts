// Import base types but define spatial-specific types
import { Candidate, Election, Vote } from '@votelab/shared-utils';
import { runElection } from './electionRunner';
import { VotingMethod } from './votingMethods';

export interface SpatialCandidate extends Candidate {
  x: number;
  y: number;
  color: string;
}

// Constants for spatial calculations
export const VOTER_RADIUS = 0.15;
export const DEFAULT_APPROVAL_THRESHOLD = 0.3;

// Base utility functions
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

// Helper to generate simulated voters around a point
function generateVotersAroundPoint(
  centerX: number,
  centerY: number,
  candidates: SpatialCandidate[],
  numVoters: number = 20,
  variance: number = 0.1
): Vote[] {
  const votes: Vote[] = [];

  for (let i = 0; i < numVoters; i++) {
    // Generate normally distributed coordinates
    let voterX: number, voterY: number;
    do {
      voterX = centerX + (Math.random() * 2 - 1) * variance;
      voterY = centerY + (Math.random() * 2 - 1) * variance;
    } while (voterX < 0 || voterX > 1 || voterY < 0 || voterY > 1);

    // Get voter's preferences
    const prefs = getVoterPreference(voterX, voterY, candidates);

    // Create vote object
    votes.push({
      ranking: prefs.map((p) => p.id),
      approved: prefs
        .filter((p) => p.dist <= DEFAULT_APPROVAL_THRESHOLD)
        .map((p) => p.id),
      timestamp: new Date().toISOString(),
      voterName: `Voter-${i}`,
    });
  }

  return votes;
}

// Type for accessing the calculators
export type SpatialVoteCalculator<M extends VotingMethod> = M extends 'approval'
  ? ApprovalCalculator
  : M extends 'smithApproval'
    ? SmithApprovalCalculator
    : PluralityCalculator | IRVCalculator | BordaCalculator;

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
    // For plurality, distance-based is actually correct
    return [getVoterPreference(x, y, candidates)[0].id];
  }) as PluralityCalculator,

  approval: ((
    x: number,
    y: number,
    candidates: SpatialCandidate[],
    threshold: number
  ) => {
    // Generate votes with approval threshold
    const votes = generateVotersAroundPoint(x, y, candidates);
    const election: Election = {
      title: 'Spatial Approval',
      candidates,
      votes,
      createdAt: new Date().toISOString(),
    };

    const results = runElection('approval', votes, candidates);
    return [results.winner];
  }) as ApprovalCalculator,

  irv: ((x: number, y: number, candidates: SpatialCandidate[]) => {
    // Generate votes
    const votes = generateVotersAroundPoint(x, y, candidates);
    const election: Election = {
      title: 'Spatial IRV',
      candidates,
      votes,
      createdAt: new Date().toISOString(),
    };

    const results = runElection('irv', votes, candidates);
    return [results.winner];
  }) as IRVCalculator,

  borda: ((x: number, y: number, candidates: SpatialCandidate[]) => {
    const votes = generateVotersAroundPoint(x, y, candidates);
    const election: Election = {
      title: 'Spatial Borda',
      candidates,
      votes,
      createdAt: new Date().toISOString(),
    };

    const results = runElection('borda', votes, candidates);
    return [results.winner];
  }) as BordaCalculator,

  smithApproval: ((
    x: number,
    y: number,
    candidates: SpatialCandidate[],
    threshold: number
  ) => {
    const votes = generateVotersAroundPoint(x, y, candidates);
    const election: Election = {
      title: 'Spatial Smith+Approval',
      candidates,
      votes,
      createdAt: new Date().toISOString(),
    };

    const results = runElection('smithApproval', votes, candidates);
    return [results.winner];
  }) as SmithApprovalCalculator,
};
