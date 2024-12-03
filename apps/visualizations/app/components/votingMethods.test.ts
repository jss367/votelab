import { describe, expect, test } from 'vitest';
import type { Candidate } from './types';
import { distance, getVoterPreference, votingMethods } from './votingMethods';

describe('Voting utility functions', () => {
  test('distance calculation', () => {
    expect(distance(0, 0, 3, 4)).toBe(5); // Basic 3-4-5 triangle
    expect(distance(1, 1, 1, 1)).toBe(0); // Same point
    expect(distance(0, 0, 1, 0)).toBe(1); // Horizontal
    expect(distance(0, 0, 0, 1)).toBe(1); // Vertical
  });

  test('voter preference ordering', () => {
    const candidates: Candidate[] = [
      { id: 'A', x: 0, y: 0, color: 'red', name: 'A' },
      { id: 'B', x: 1, y: 1, color: 'blue', name: 'B' },
      { id: 'C', x: 0.5, y: 0.5, color: 'green', name: 'C' }
    ];

    const prefs = getVoterPreference(0, 0, candidates);
    expect(prefs[0].id).toBe('A'); // Closest
    expect(prefs[1].id).toBe('C'); // Middle
    expect(prefs[2].id).toBe('B'); // Furthest
  });
});

describe('Plurality voting', () => {
  const candidates: Candidate[] = [
    { id: 'A', x: 0, y: 0, color: 'red', name: 'A' },
    { id: 'B', x: 1, y: 1, color: 'blue', name: 'B' }
  ];

  test('votes for closest candidate', () => {
    expect(votingMethods.plurality(0.1, 0.1, candidates)[0]).toBe('A');
    expect(votingMethods.plurality(0.9, 0.9, candidates)[0]).toBe('B');
  });

  test('handles equidistant case', () => {
    // At (0.5, 0.5), both candidates are equidistant
    // Should pick the first one in the list due to stable sort
    const result = votingMethods.plurality(0.5, 0.5, candidates);
    expect(result).toHaveLength(1);
    expect(['A', 'B']).toContain(result[0]);
  });
});

describe('Approval voting', () => {
  const candidates: Candidate[] = [
    { id: 'A', x: 0, y: 0, color: 'red', name: 'A' },
    { id: 'B', x: 1, y: 0, color: 'blue', name: 'B' },
    { id: 'C', x: 0.5, y: 0, color: 'green', name: 'C' }
  ];

  test('approves candidates within threshold', () => {
    // Test with threshold 0.3
    const threshold = 0.3;

    // At (0, 0), should approve only A
    expect(votingMethods.approval(0, 0, candidates, threshold))
      .toEqual(['A']);

    // At (0.5, 0), should approve C and possibly others
    const middleVote = votingMethods.approval(0.5, 0, candidates, threshold);
    expect(middleVote).toContain('C');
  });

  test('approves multiple candidates when appropriate', () => {
    // Large threshold should approve multiple nearby candidates
    const largeThreshold = 0.6;
    const vote = votingMethods.approval(0.5, 0, candidates, largeThreshold);
    expect(vote.length).toBeGreaterThan(1);
  });
});

describe('Borda Count', () => {
  const candidates: Candidate[] = [
    { id: 'A', x: 0, y: 0, color: 'red', name: 'A' },
    { id: 'B', x: 1, y: 0, color: 'blue', name: 'B' },
    { id: 'C', x: 0.5, y: 0, color: 'green', name: 'C' }
  ];

  test('ranks candidates by distance', () => {
    const vote = votingMethods.borda(0, 0, candidates);
    expect(vote[0]).toBe('A'); // Closest gets highest points
    expect(vote[2]).toBe('B'); // Furthest gets lowest points
  });

  test('preserves all candidates in ranking', () => {
    const vote = votingMethods.borda(0.5, 0, candidates);
    expect(vote).toHaveLength(candidates.length);
    expect(new Set(vote)).toEqual(new Set(candidates.map(c => c.id)));
  });
});

describe('Instant Runoff Voting', () => {
  const candidates: Candidate[] = [
    { id: 'A', x: 0, y: 0, color: 'red', name: 'A' },
    { id: 'B', x: 1, y: 0, color: 'blue', name: 'B' },
    { id: 'C', x: 0.5, y: 0, color: 'green', name: 'C' }
  ];

  test('returns full ranking of candidates', () => {
    const vote = votingMethods.irv(0, 0, candidates);
    expect(vote).toHaveLength(candidates.length);
    expect(vote[0]).toBe('A'); // Closest should be first choice
    expect(vote[2]).toBe('B'); // Furthest should be last choice
  });

  test('handles middle voter correctly', () => {
    const vote = votingMethods.irv(0.5, 0, candidates);
    expect(vote[0]).toBe('C'); // Middle candidate should be first choice
    expect(vote).toHaveLength(candidates.length);
  });
});

describe('Edge cases for all methods', () => {
  const candidates: Candidate[] = [
    { id: 'A', x: 0.5, y: 0.5, color: 'red', name: 'A' }
  ];

  test('handles single candidate', () => {
    const pos = { x: 0, y: 0 };
    expect(votingMethods.plurality(pos.x, pos.y, candidates)[0]).toBe('A');
    expect(votingMethods.approval(pos.x, pos.y, candidates, 0.3)[0]).toBe('A');
    expect(votingMethods.borda(pos.x, pos.y, candidates)[0]).toBe('A');
    expect(votingMethods.irv(pos.x, pos.y, candidates)[0]).toBe('A');
  });

  test('handles extreme voter positions', () => {
    const extremePositions = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 0 }
    ];

    extremePositions.forEach(pos => {
      expect(() => votingMethods.plurality(pos.x, pos.y, candidates)).not.toThrow();
      expect(() => votingMethods.approval(pos.x, pos.y, candidates, 0.3)).not.toThrow();
      expect(() => votingMethods.borda(pos.x, pos.y, candidates)).not.toThrow();
      expect(() => votingMethods.irv(pos.x, pos.y, candidates)).not.toThrow();
    });
  });
});


describe('Smith Set + Approval voting', () => {
  const candidates: Candidate[] = [
    { id: 'A', x: 0, y: 0, color: 'red', name: 'A' },
    { id: 'B', x: 1, y: 0, color: 'blue', name: 'B' },
    { id: 'C', x: 0.5, y: 0, color: 'green', name: 'C' }
  ];

  test('selects from Smith set', () => {
    // At (0.5, 0), candidate C should be in Smith set and win
    const vote = votingMethods.smithApproval(0.5, 0, candidates, 0.3);
    expect(vote).toContain('C');
  });

  test('handles approval threshold correctly', () => {
    // Test with different thresholds
    const smallThreshold = 0.2;
    const largeThreshold = 0.6;

    const voteSmall = votingMethods.smithApproval(0.5, 0, candidates, smallThreshold);
    const voteLarge = votingMethods.smithApproval(0.5, 0, candidates, largeThreshold);

    expect(voteSmall.length).toBeLessThanOrEqual(voteLarge.length);
  });

  test('handles single candidate in Smith set', () => {
    // At (0, 0), only A should be in Smith set
    const vote = votingMethods.smithApproval(0, 0, candidates, 0.3);
    expect(vote).toEqual(['A']);
  });
});
