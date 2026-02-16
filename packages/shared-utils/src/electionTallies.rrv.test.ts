import { describe, it, expect } from 'vitest';
import { tallyRRV } from './electionTallies.js';
import type { Candidate, Vote } from './types.js';

const candidates: Candidate[] = [
  { id: '1', name: 'Book A' },
  { id: '2', name: 'Book B' },
  { id: '3', name: 'Book C' },
  { id: '4', name: 'Book D' },
];

describe('tallyRRV', () => {
  it('picks the highest-scored candidate first', () => {
    const votes: Vote[] = [
      { voterName: 'V1', ranking: [], approved: [], scores: { '1': 10, '2': 5, '3': 0, '4': 0 }, timestamp: '' },
      { voterName: 'V2', ranking: [], approved: [], scores: { '1': 8, '2': 6, '3': 2, '4': 1 }, timestamp: '' },
      { voterName: 'V3', ranking: [], approved: [], scores: { '1': 9, '2': 4, '3': 3, '4': 2 }, timestamp: '' },
    ];
    const result = tallyRRV(votes, candidates, 1);
    expect(result.winners[0].name).toBe('Book A');
    expect(result.winners).toHaveLength(1);
    expect(result.rounds).toHaveLength(1);
  });

  it('reweights ballots so second winner reflects proportionality', () => {
    // Group 1 (2 voters): loves A, hates B
    // Group 2 (2 voters): loves B, hates A
    // Without reweighting, A and B would tie for first. With reweighting,
    // after A wins, group 1 gets downweighted and B wins round 2.
    const votes: Vote[] = [
      { voterName: 'V1', ranking: [], approved: [], scores: { '1': 10, '2': 0, '3': 5, '4': 3 }, timestamp: '' },
      { voterName: 'V2', ranking: [], approved: [], scores: { '1': 10, '2': 0, '3': 4, '4': 2 }, timestamp: '' },
      { voterName: 'V3', ranking: [], approved: [], scores: { '1': 0, '2': 10, '3': 5, '4': 3 }, timestamp: '' },
      { voterName: 'V4', ranking: [], approved: [], scores: { '1': 0, '2': 10, '3': 4, '4': 2 }, timestamp: '' },
    ];
    const result = tallyRRV(votes, candidates, 2);
    // First winner: tie between A and B, A or B wins (depends on iteration order, A first)
    // Second winner: the other one should win due to reweighting
    expect(result.winners).toHaveLength(2);
    const winnerNames = result.winners.map(w => w.name);
    expect(winnerNames).toContain('Book A');
    expect(winnerNames).toContain('Book B');
  });

  it('handles voters who gave winner a 0 (weight stays the same)', () => {
    const votes: Vote[] = [
      { voterName: 'V1', ranking: [], approved: [], scores: { '1': 10, '2': 0, '3': 0 }, timestamp: '' },
      { voterName: 'V2', ranking: [], approved: [], scores: { '1': 0, '2': 10, '3': 5 }, timestamp: '' },
    ];
    const threeC = candidates.slice(0, 3);
    const result = tallyRRV(votes, threeC, 2);
    // A wins first (10 vs 10 tie, A first). V2 gave A a 0, so V2 keeps full weight.
    // Round 2: V1 weight = 1/2 = 0.5. V2 weight = 1.0
    // B weighted score: 0.5*0 + 1.0*10 = 10. C weighted score: 0.5*0 + 1.0*5 = 5.
    expect(result.winners[1].name).toBe('Book B');
  });

  it('limits winners to number of candidates', () => {
    const votes: Vote[] = [
      { voterName: 'V1', ranking: [], approved: [], scores: { '1': 10, '2': 5 }, timestamp: '' },
    ];
    const twoC = candidates.slice(0, 2);
    const result = tallyRRV(votes, twoC, 5); // asking for 5 but only 2 candidates
    expect(result.winners).toHaveLength(2);
  });

  it('handles missing scores (treated as 0)', () => {
    const votes: Vote[] = [
      { voterName: 'V1', ranking: [], approved: [], scores: { '1': 10 }, timestamp: '' },
      { voterName: 'V2', ranking: [], approved: [], scores: { '2': 8 }, timestamp: '' },
    ];
    const twoC = candidates.slice(0, 2);
    const result = tallyRRV(votes, twoC, 2);
    expect(result.winners[0].name).toBe('Book A'); // 10 > 8
    expect(result.winners[1].name).toBe('Book B');
  });
});
