import { describe, expect, test } from 'vitest';
import {
  calculateSmithSet,
  getHeadToHeadVictories,
  getPairwiseResults,
  selectWinner,
} from './ElectionUtils';
import { Election } from './types';

describe('Election Result Calculations', () => {
  // Simple test case with clear winner
  const simpleTestElection: Election = {
    title: 'Test Election',
    candidates: [
      { id: '1', name: 'Candidate 1' },
      { id: '2', name: 'Candidate 2' },
      { id: '3', name: 'Candidate 3' },
    ],
    votes: [
      // 3 votes preferring: Candidate 1 > Candidate 2 > Candidate 3
      {
        voterName: 'Voter A',
        ranking: ['1', '2', '3'],
        approved: ['1'],
        timestamp: new Date().toISOString(),
      },
      {
        voterName: 'Voter B',
        ranking: ['1', '2', '3'],
        approved: ['1'],
        timestamp: new Date().toISOString(),
      },
      {
        voterName: 'Voter C',
        ranking: ['1', '2', '3'],
        approved: ['1'],
        timestamp: new Date().toISOString(),
      },
      // 2 votes preferring: Candidate 3 > Candidate 1 > Candidate 2
      {
        voterName: 'Voter D',
        ranking: ['3', '1', '2'],
        approved: ['3'],
        timestamp: new Date().toISOString(),
      },
      {
        voterName: 'Voter E',
        ranking: ['3', '1', '2'],
        approved: ['3'],
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  };

  test('generates correct pairwise results for three candidates', () => {
    const results = getPairwiseResults(simpleTestElection);

    // Log results for debugging
    console.log('Pairwise Results:', JSON.stringify(results, null, 2));

    expect(results).toEqual([
      {
        candidate1: 'Candidate 1',
        candidate2: 'Candidate 2',
        candidate1Votes: 5, // 3 direct votes + 2 from Candidate 3 voters
        candidate2Votes: 0, // No direct wins
      },
      {
        candidate1: 'Candidate 1',
        candidate2: 'Candidate 3',
        candidate1Votes: 3, // 3 direct votes
        candidate2Votes: 2, // 2 direct votes
      },
      {
        candidate1: 'Candidate 2',
        candidate2: 'Candidate 3',
        candidate1Votes: 3, // Gets votes from Candidate 1 voters
        candidate2Votes: 2, // 2 direct votes
      },
    ]);
  });

  test('calculates head-to-head victories correctly', () => {
    const pairwise = getPairwiseResults(simpleTestElection);
    const victories = getHeadToHeadVictories(pairwise);

    // Log victories for debugging
    console.log('Victories:', JSON.stringify(victories, null, 2));

    expect(victories).toEqual([
      {
        winner: 'Candidate 1',
        loser: 'Candidate 2',
        margin: 5, // Won 5-0
      },
      {
        winner: 'Candidate 1',
        loser: 'Candidate 3',
        margin: 1, // Won 3-2
      },
      {
        winner: 'Candidate 2',
        loser: 'Candidate 3',
        margin: 1, // Won 3-2
      },
    ]);
  });

  test('identifies correct Smith set with clear winner', () => {
    const pairwise = getPairwiseResults(simpleTestElection);
    const victories = getHeadToHeadVictories(pairwise);
    const smithSet = calculateSmithSet(victories, simpleTestElection);

    expect(smithSet).toEqual(['Candidate 1']); // Candidate 1 beats everyone
  });

  // Test case for cyclic preferences (Rock-Paper-Scissors scenario)
  const cyclicElection: Election = {
    title: 'Cyclic Test',
    candidates: [
      { id: '1', name: 'Rock' },
      { id: '2', name: 'Paper' },
      { id: '3', name: 'Scissors' },
    ],
    votes: [
      // Rock beats Scissors
      {
        voterName: 'Voter A',
        ranking: ['1', '3', '2'],
        approved: ['1'],
        timestamp: new Date().toISOString(),
      },
      // Paper beats Rock
      {
        voterName: 'Voter B',
        ranking: ['2', '1', '3'],
        approved: ['2'],
        timestamp: new Date().toISOString(),
      },
      // Scissors beats Paper
      {
        voterName: 'Voter C',
        ranking: ['3', '2', '1'],
        approved: ['3'],
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  };

  test('handles cyclic preferences correctly', () => {
    const pairwise = getPairwiseResults(cyclicElection);
    console.log('Cyclic Pairwise Results:', JSON.stringify(pairwise, null, 2));

    const victories = getHeadToHeadVictories(pairwise);
    console.log('Cyclic Victories:', JSON.stringify(victories, null, 2));

    const smithSet = calculateSmithSet(victories, cyclicElection);
    console.log('Cyclic Smith Set:', smithSet);

    // In a perfect cycle, all candidates should be in the Smith set
    expect(new Set(smithSet)).toEqual(new Set(['Rock', 'Paper', 'Scissors']));
  });

  // Test edge case with tied preferences
  const tiedElection: Election = {
    title: 'Tied Test',
    candidates: [
      { id: '1', name: 'Candidate 1' },
      { id: '2', name: 'Candidate 2' },
    ],
    votes: [
      {
        voterName: 'Voter A',
        ranking: ['1', '2'],
        approved: ['1'],
        timestamp: new Date().toISOString(),
      },
      {
        voterName: 'Voter B',
        ranking: ['2', '1'],
        approved: ['2'],
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  };

  test('handles tied preferences correctly', () => {
    const pairwise = getPairwiseResults(tiedElection);
    const victories = getHeadToHeadVictories(pairwise);
    const smithSet = calculateSmithSet(victories, tiedElection);

    // With perfect ties, both candidates should be in Smith set
    expect(new Set(smithSet)).toEqual(new Set(['Candidate 1', 'Candidate 2']));
  });

  test('selectWinner produces a stable total order for a Condorcet cycle', () => {
    // A cyclic Smith set is exactly where the old pairwise-matchup comparator
    // was non-transitive (A>B, B>C, C>A), violating Array.sort's contract.
    const pairwise = getPairwiseResults(cyclicElection);
    const victories = getHeadToHeadVictories(pairwise);
    const smithSet = calculateSmithSet(victories, cyclicElection);

    const scores = selectWinner(smithSet, victories, cyclicElection);

    // Every Smith-set member is ranked, and the ranking is internally
    // consistent: scores are sorted descending by (approval, netVictories,
    // margin).
    expect(scores).toHaveLength(smithSet.length);
    const cmp = (a: { approval: number; headToHead: number; margin: number }) =>
      [a.approval, a.headToHead, a.margin];
    for (let i = 1; i < scores.length; i++) {
      const prev = cmp(scores[i - 1].metrics);
      const cur = cmp(scores[i].metrics);
      // First differing component must show prev >= cur (descending order).
      const diff = prev.findIndex((v, k) => v !== cur[k]);
      if (diff !== -1) {
        expect(prev[diff]).toBeGreaterThan(cur[diff]);
      }
    }

    // Re-running on the same input yields the same winner (determinism).
    const scores2 = selectWinner(smithSet, victories, cyclicElection);
    expect(scores2[0].name).toBe(scores[0].name);
  });
});
