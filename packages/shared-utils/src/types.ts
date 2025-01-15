export interface Candidate {
  id: string;
  name: string;
  x?: number;
  y?: number;
  color?: string;
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

export interface CandidateScore {
  name: string;
  rank: number;
  isTied: boolean;
  metrics: CandidateMetrics;
  description: string;
}
