import { SpatialCandidate, VoterBloc } from '@votelab/shared-utils';

export interface YeePreset {
  id: string;
  name: string;
  description: string;
  candidates: SpatialCandidate[];
  blocs?: VoterBloc[]; // Optional custom voter distribution
  approvalThreshold?: number; // Optional custom threshold
}

export const YEE_PRESETS: YeePreset[] = [
  {
    id: 'approval-failure',
    name: 'Approval Voting Failure',
    description: 'Four candidates in a square formation where approval voting can produce counterintuitive results',
    candidates: [
      { id: 'a', name: 'A', x: 0.4, y: 0.4, color: '#ef4444' },
      { id: 'b', name: 'B', x: 0.4, y: 0.6, color: '#3b82f6' },
      { id: 'c', name: 'C', x: 0.6, y: 0.4, color: '#22c55e' },
      { id: 'd', name: 'D', x: 0.6, y: 0.6, color: '#f59e0b' },
    ],
  },
  // Add more presets here following the same format:
  // {
  //   id: 'unique-id',
  //   name: 'Display Name',
  //   description: 'What this demonstrates',
  //   candidates: [...],
  // },
];
