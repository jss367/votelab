import type { VotingMethod } from '@votelab/shared-utils';
export type { VotingMethod };

export interface CandidateSubmission {
  candidateId: string;
  submittedBy: string;
  submittedAt: string;
}

export interface Candidate {
  id: string;
  name: string;
  customFields?: CustomFieldValue[];
  x?: number;
  y?: number;
  color?: string;
}

export interface Vote {
  voterName: string;
  ranking: string[];
  approved: string[];
  scores?: Record<string, number>;  // candidateId -> score (0-10), used by RRV
  timestamp: string;
}

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect';

export interface CustomField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  options?: string[];  // predefined options for select/multiselect fields
  allowCustomOptions?: boolean;  // allow submitters to add their own options
}

export interface CustomFieldValue {
  fieldId: string;
  value: string | number | Date | string[] | null;
}

export interface Election {
  title: string;
  votingMethod?: VotingMethod;  // optional for backward compat with existing elections
  candidates: Candidate[];
  votes: Vote[];
  createdAt: string;
  submissionsClosed: boolean;
  votingOpen: boolean;
  createdBy: string;
  customFields?: CustomField[];
}
