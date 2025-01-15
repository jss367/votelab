export interface CandidateSubmission {
  candidateId: string;
  submittedBy: string;
  submittedAt: string;
}

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
  submissionsClosed: boolean;
  votingOpen: boolean;
  createdBy: string;
}
