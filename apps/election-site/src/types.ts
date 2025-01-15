import type { Election } from '@votelab/shared-utils';

export interface CandidateSubmission {
  candidateId: string;
  submittedBy: string;
  submittedAt: string;
}

export interface RunningElection extends Election {
  allowNewCandidates: boolean;
  submissionDeadline: string | null;
  votingOpen: boolean;
  creatorId: string;
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
