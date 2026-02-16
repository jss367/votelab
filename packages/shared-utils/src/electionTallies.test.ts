import { describe, it, expect } from 'vitest';
import {
  tallyPlurality,
  tallyApproval,
  tallyIRV,
  tallyBorda,
  tallyCondorcet,
} from './electionTallies.js';
import type { Candidate, Vote } from './types.js';

const candidates: Candidate[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
  { id: '3', name: 'Charlie' },
];

const votes: Vote[] = [
  { voterName: 'V1', ranking: ['1', '2', '3'], approved: ['1', '2'], timestamp: '' },
  { voterName: 'V2', ranking: ['1', '3', '2'], approved: ['1'], timestamp: '' },
  { voterName: 'V3', ranking: ['2', '3', '1'], approved: ['2', '3'], timestamp: '' },
  { voterName: 'V4', ranking: ['3', '2', '1'], approved: ['3'], timestamp: '' },
  { voterName: 'V5', ranking: ['1', '2', '3'], approved: ['1'], timestamp: '' },
];

describe('electionTallies', () => {
  describe('tallyPlurality', () => {
    it('Alice wins with 3 first-choice votes', () => {
      const result = tallyPlurality(votes, candidates);
      expect(result.winner).toBe('1');
      expect(result.counts[0]).toEqual({ candidateId: '1', name: 'Alice', count: 3 });
      expect(result.counts[1]).toEqual({ candidateId: '2', name: 'Bob', count: 1 });
      expect(result.counts[2]).toEqual({ candidateId: '3', name: 'Charlie', count: 1 });
    });
  });

  describe('tallyApproval', () => {
    it('Alice wins with 3 approvals', () => {
      const result = tallyApproval(votes, candidates);
      expect(result.winner).toBe('1');
      expect(result.counts[0]).toEqual({ candidateId: '1', name: 'Alice', count: 3 });
      // Bob and Charlie both have 2 approvals
      const bobEntry = result.counts.find((c) => c.candidateId === '2');
      const charlieEntry = result.counts.find((c) => c.candidateId === '3');
      expect(bobEntry!.count).toBe(2);
      expect(charlieEntry!.count).toBe(2);
    });
  });

  describe('tallyIRV', () => {
    it('Alice wins with majority in round 1', () => {
      const result = tallyIRV(votes, candidates);
      expect(result.winner).toBe('1');
      expect(result.rounds.length).toBeGreaterThanOrEqual(1);
      // Alice has 3/5 votes which is a majority
      expect(result.rounds[0].counts[0].candidateId).toBe('1');
      expect(result.rounds[0].counts[0].count).toBe(3);
    });

    it('handles elimination correctly when no majority in round 1', () => {
      // 4 candidates, no majority in first round
      const fourCandidates: Candidate[] = [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
        { id: 'd', name: 'D' },
      ];
      const fourVotes: Vote[] = [
        { voterName: 'V1', ranking: ['a', 'b', 'c', 'd'], approved: [], timestamp: '' },
        { voterName: 'V2', ranking: ['a', 'c', 'b', 'd'], approved: [], timestamp: '' },
        { voterName: 'V3', ranking: ['b', 'a', 'c', 'd'], approved: [], timestamp: '' },
        { voterName: 'V4', ranking: ['c', 'b', 'a', 'd'], approved: [], timestamp: '' },
        { voterName: 'V5', ranking: ['d', 'a', 'b', 'c'], approved: [], timestamp: '' },
      ];
      const result = tallyIRV(fourVotes, fourCandidates);
      expect(result.rounds.length).toBeGreaterThan(1);
      // D should be eliminated first (only 1 vote)
      expect(result.rounds[0].eliminated).toBe('d');
    });
  });

  describe('tallyBorda', () => {
    it('Alice wins with 6 points', () => {
      const result = tallyBorda(votes, candidates);
      expect(result.winner).toBe('1');
      // Alice: V1=2, V2=2, V3=0, V4=0, V5=2 = 6
      expect(result.scores[0]).toEqual({ candidateId: '1', name: 'Alice', score: 6 });
      // Bob: V1=1, V2=0, V3=2, V4=1, V5=1 = 5
      expect(result.scores[1]).toEqual({ candidateId: '2', name: 'Bob', score: 5 });
      // Charlie: V1=0, V2=1, V3=1, V4=2, V5=0 = 4
      expect(result.scores[2]).toEqual({ candidateId: '3', name: 'Charlie', score: 4 });
    });
  });

  describe('tallyCondorcet', () => {
    it('Alice is the Condorcet winner', () => {
      const result = tallyCondorcet(votes, candidates);
      expect(result.winner).toBe('1');
      // Alice beats Bob 3-2
      expect(result.matrix['1']['2']).toBe(3);
      expect(result.matrix['2']['1']).toBe(2);
      // Alice beats Charlie 3-2
      expect(result.matrix['1']['3']).toBe(3);
      expect(result.matrix['3']['1']).toBe(2);
    });

    it('returns null winner when there is a Condorcet cycle', () => {
      const cycleCandidates: Candidate[] = [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ];
      const cycleVotes: Vote[] = [
        { voterName: 'V1', ranking: ['a', 'b', 'c'], approved: [], timestamp: '' },
        { voterName: 'V2', ranking: ['b', 'c', 'a'], approved: [], timestamp: '' },
        { voterName: 'V3', ranking: ['c', 'a', 'b'], approved: [], timestamp: '' },
      ];
      const result = tallyCondorcet(cycleVotes, cycleCandidates);
      expect(result.winner).toBeNull();
      // A beats B 2-1, B beats C 2-1, C beats A 2-1
      expect(result.matrix['a']['b']).toBe(2);
      expect(result.matrix['b']['a']).toBe(1);
      expect(result.matrix['b']['c']).toBe(2);
      expect(result.matrix['c']['b']).toBe(1);
      expect(result.matrix['c']['a']).toBe(2);
      expect(result.matrix['a']['c']).toBe(1);
    });
  });
});
