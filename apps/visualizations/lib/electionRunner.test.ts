import { describe, expect, it } from 'vitest';
import type { Candidate, Vote } from '@votelab/shared-utils';
import { runElection } from './electionRunner';

const candidates: Candidate[] = [
  { id: 'A', name: 'A' },
  { id: 'B', name: 'B' },
  { id: 'C', name: 'C' },
];
const vote = (ranking: string[], approved: string[] = []): Vote => ({
  voterName: 'v',
  ranking,
  approved,
  timestamp: '',
});

describe('runElection smithApproval', () => {
  it('treats unranked candidates as below ranked ones on truncated ballots', () => {
    // Two ballots rank only A; one ranks B over C. A beats B and C 2-1, so the
    // Smith set is {A} and C's approvals must not be able to elect C.
    const votes = [vote(['A']), vote(['A']), vote(['B', 'C'], ['C'])];
    const result = runElection('smithApproval', votes, candidates);
    expect(result.roundDetails[0]).toBe('Smith set: A');
    expect(result.winner).toBe('A');
  });

  it('runs approval among a tied Smith set only', () => {
    // A ties B, both beat C. C has the most approvals but is outside the set.
    const votes = [
      vote(['A', 'B', 'C'], ['A']),
      vote(['B', 'A', 'C'], ['B', 'C']),
      vote(['A', 'B', 'C'], ['C']),
      vote(['B', 'A', 'C'], ['C']),
    ];
    const result = runElection('smithApproval', votes, candidates);
    expect(result.roundDetails[0]).toBe('Smith set: A, B');
    expect(['A', 'B']).toContain(result.winner);
    expect(result.voteCounts).not.toHaveProperty('C');
  });
});

describe('runElection condorcet', () => {
  it('finds the Condorcet winner with truncated ballots', () => {
    const votes = [vote(['A']), vote(['A']), vote(['B', 'C'])];
    const result = runElection('condorcet', votes, candidates);
    expect(result.winner).toBe('A');
  });
});
