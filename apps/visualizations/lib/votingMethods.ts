import { Candidate } from '@votelab/shared-utils';

// Define a spatial-specific candidate type that requires x and y
export interface SpatialCandidate extends Candidate {
  x: number;
  y: number;
  color: string;
}

// Constants
export const methods = {
  plurality: 'Plurality',
  approval: 'Approval',
  borda: 'Borda Count',
  irv: 'Instant Runoff',
  smithApproval: 'Smith Set + Approval',
};

export const methodDescriptions = {
  plurality:
    'Each voter chooses their closest candidate. The candidate with the most votes wins.',
  approval:
    "Voters 'approve' all candidates within a certain distance. The most approved candidate wins.",
  borda:
    'Voters rank candidates by distance. Each rank gives points (n-1 for 1st, n-2 for 2nd, etc.). Highest points wins.',
  irv: 'Voters rank by distance. If no majority, eliminate last place and retry with remaining candidates.',
  smithApproval:
    'First finds candidates who beat all others outside their set in pairwise matchups (Smith set), then uses approval voting among them.',
};

// Utility functions
export const distance = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

export type VotingMethod = 'plurality' | 'approval' | 'irv';
