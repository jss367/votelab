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

export type FieldType = 'text' | 'number' | 'date';

export interface CustomField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
}

export interface CustomFieldValue {
  fieldId: string;
  value: string | number | Date | null;
}

export interface Election {
  title: string;
  candidates: Candidate[];
  votes: Vote[];
  createdAt: string;
  submissionsClosed: boolean;
  votingOpen: boolean;
  createdBy: string;
  customFields?: CustomField[];
}
