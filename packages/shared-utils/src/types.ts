export interface Candidate {
  id: string;
  name: string;
  x?: number;
  y?: number;
  color?: string;
}

export interface SpatialCandidate extends Candidate {
  x: number;
  y: number;
  color: string;
}

export interface Vote {
  voterName: string;
  ranking: string[];
  approved: string[];
  timestamp: string;
}

export interface Election {
  title: string;
  candidates: Candidate[];
  votes: Vote[];
  createdAt: string;
}

export interface PairwiseResult {
  candidate1: string;
  candidate2: string;
  candidate1Votes: number;
  candidate2Votes: number;
}

export interface Victory {
  winner: string;
  loser: string;
  margin: number;
}

export interface HeadToHeadVictory {
  winner: string;
  loser: string;
  margin: number;
}

export interface CandidateMetrics {
  approval: number;
  headToHead: number;
  margin: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface VoterBloc {
  id: string;
  position: Point2D;
  count: number;
  spread: number; // standard deviation for normal distribution
}

export interface VoterPopulation {
  blocs: VoterBloc[];
  totalCount: number;
}

export interface Voter {
  position: Point2D;
  blocId?: string; // which bloc this voter came from
}

export type VoterPreset = 'uniform' | 'centered' | 'polarized' | 'triangle' | 'custom';
