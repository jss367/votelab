export interface Candidate {
  id: string;
  name: string;
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

export interface Victory {
  winner: string;
  loser: string;
  margin: number;
}


export interface PairwiseResult {
  candidate1: string;
  candidate2: string;
  candidate1Votes: number;
  candidate2Votes: number;
}
