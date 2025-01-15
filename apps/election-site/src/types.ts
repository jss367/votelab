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

export enum ElectionPhase {
  ACCEPTING_CANDIDATES = 'accepting_candidates',
  CANDIDATES_LOCKED = 'candidates_locked',
  VOTING = 'voting',
  COMPLETED = 'completed',
}

// Helper function to determine current election phase
export const getElectionPhase = (election: RunningElection): ElectionPhase => {
  const now = new Date();

  if (!election.allowNewCandidates) {
    return election.votingOpen ? ElectionPhase.VOTING : ElectionPhase.COMPLETED;
  }

  if (
    election.submissionDeadline &&
    new Date(election.submissionDeadline) <= now
  ) {
    return election.votingOpen ? ElectionPhase.VOTING : ElectionPhase.COMPLETED;
  }

  return election.votingOpen
    ? ElectionPhase.VOTING
    : ElectionPhase.ACCEPTING_CANDIDATES;
};
