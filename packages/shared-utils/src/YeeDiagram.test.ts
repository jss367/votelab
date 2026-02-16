import { describe, it, expect } from 'vitest';
import {
  distance,
  getVoterPreferences,
  computePluralityWinner,
  computeApprovalWinner,
  computeBordaWinner,
  computeIRVWinner,
  computeCondorcetWinner,
  buildPairwiseMatrix,
  computeSmithSet,
  computeSmithApprovalWinner,
  computeWinner,
  generateYeeDiagram,
  VotingMethod,
} from './YeeDiagram.js';
import { createVoterBloc, generateVotersFromBloc, generatePopulation, createPresetPopulation } from './VoterDistribution.js';
import { SpatialCandidate, Voter } from './types.js';

describe('YeeDiagram', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
    { id: 'b', name: 'B', x: 0.8, y: 0.5, color: '#0000ff' },
    { id: 'c', name: 'C', x: 0.5, y: 0.8, color: '#00ff00' },
  ];

  describe('distance', () => {
    it('calculates Euclidean distance correctly', () => {
      expect(distance(0, 0, 3, 4)).toBe(5);
      expect(distance(0, 0, 1, 0)).toBe(1);
      expect(distance(0.5, 0.5, 0.5, 0.5)).toBe(0);
    });
  });

  describe('getVoterPreferences', () => {
    it('ranks candidates by distance from voter', () => {
      const voter: Voter = { position: { x: 0.3, y: 0.5 } };
      const prefs = getVoterPreferences(voter, candidates);

      expect(prefs[0].candidateId).toBe('a');
      expect(prefs[2].candidateId).toBe('b');
    });

    it('returns distances with each preference', () => {
      const voter: Voter = { position: { x: 0.2, y: 0.5 } };
      const prefs = getVoterPreferences(voter, candidates);

      expect(prefs[0].distance).toBeCloseTo(0, 5);
      expect(prefs[0].candidateId).toBe('a');
    });
  });

  describe('computePluralityWinner', () => {
    const twoCanidates: SpatialCandidate[] = [
      { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
      { id: 'b', name: 'B', x: 0.8, y: 0.5, color: '#0000ff' },
    ];

    it('returns candidate closest to majority of voters', () => {
      const bloc = createVoterBloc({ x: 0.25, y: 0.5 }, 100, 0.05);
      const voters = generateVotersFromBloc(bloc);

      const winner = computePluralityWinner(voters, twoCanidates);
      expect(winner).toBe('a');
    });

    it('returns candidate B when voters are near B', () => {
      const bloc = createVoterBloc({ x: 0.75, y: 0.5 }, 100, 0.05);
      const voters = generateVotersFromBloc(bloc);

      const winner = computePluralityWinner(voters, twoCanidates);
      expect(winner).toBe('b');
    });
  });

  describe('computeApprovalWinner', () => {
    const twoCandidates: SpatialCandidate[] = [
      { id: 'a', name: 'A', x: 0.3, y: 0.5, color: '#ff0000' },
      { id: 'b', name: 'B', x: 0.7, y: 0.5, color: '#0000ff' },
    ];

    it('respects threshold distance', () => {
      const bloc = createVoterBloc({ x: 0.3, y: 0.5 }, 100, 0.01);
      const voters = generateVotersFromBloc(bloc);

      const winner = computeApprovalWinner(voters, twoCandidates, 0.1);
      expect(winner).toBe('a');
    });
  });

  describe('computeBordaWinner', () => {
    it('awards points based on ranking', () => {
      const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.01);
      const voters = generateVotersFromBloc(bloc);

      const threeInLine: SpatialCandidate[] = [
        { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
        { id: 'b', name: 'B', x: 0.5, y: 0.5, color: '#0000ff' },
        { id: 'c', name: 'C', x: 0.8, y: 0.5, color: '#00ff00' },
      ];

      const winner = computeBordaWinner(voters, threeInLine);
      expect(winner).toBe('b');
    });
  });

  describe('computeIRVWinner', () => {
    it('handles majority winner in first round', () => {
      const bloc = createVoterBloc({ x: 0.2, y: 0.5 }, 100, 0.01);
      const voters = generateVotersFromBloc(bloc);

      const winner = computeIRVWinner(voters, candidates);
      expect(winner).toBe('a');
    });
  });

  describe('buildPairwiseMatrix', () => {
    const twoCandidates: SpatialCandidate[] = [
      { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
      { id: 'b', name: 'B', x: 0.8, y: 0.5, color: '#0000ff' },
    ];

    it('counts pairwise preferences correctly', () => {
      const bloc = createVoterBloc({ x: 0.2, y: 0.5 }, 100, 0.01);
      const voters = generateVotersFromBloc(bloc);

      const matrix = buildPairwiseMatrix(voters, twoCandidates);
      expect(matrix['a']['b']).toBe(100);
      expect(matrix['b']['a']).toBe(0);
    });
  });

  describe('computeCondorcetWinner', () => {
    it('finds Condorcet winner when one exists', () => {
      const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.15);
      const voters = generateVotersFromBloc(bloc);

      const threeInLine: SpatialCandidate[] = [
        { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
        { id: 'b', name: 'B', x: 0.5, y: 0.5, color: '#0000ff' },
        { id: 'c', name: 'C', x: 0.8, y: 0.5, color: '#00ff00' },
      ];

      const winner = computeCondorcetWinner(voters, threeInLine);
      expect(winner).toBe('b');
    });
  });

  describe('computeSmithSet', () => {
    it('returns single candidate when Condorcet winner exists', () => {
      const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.1);
      const voters = generateVotersFromBloc(bloc);

      const threeInLine: SpatialCandidate[] = [
        { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
        { id: 'b', name: 'B', x: 0.5, y: 0.5, color: '#0000ff' },
        { id: 'c', name: 'C', x: 0.8, y: 0.5, color: '#00ff00' },
      ];

      const matrix = buildPairwiseMatrix(voters, threeInLine);
      const smithSet = computeSmithSet(matrix, threeInLine.map(c => c.id));
      expect(smithSet).toHaveLength(1);
      expect(smithSet).toContain('b');
    });

    it('returns multiple candidates in cycle', () => {
      const matrix = {
        'a': { 'b': 60, 'c': 40 },
        'b': { 'a': 40, 'c': 60 },
        'c': { 'a': 60, 'b': 40 },
      };

      const smithSet = computeSmithSet(matrix, ['a', 'b', 'c']);
      expect(smithSet).toHaveLength(3);
    });
  });

  describe('computeSmithApprovalWinner', () => {
    it('runs approval among Smith set only', () => {
      const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.15);
      const voters = generateVotersFromBloc(bloc);

      const winner = computeSmithApprovalWinner(voters, candidates, 0.3);
      expect(winner).toBeDefined();
    });
  });

  describe('computeWinner', () => {
    const twoCandidates: SpatialCandidate[] = [
      { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
      { id: 'b', name: 'B', x: 0.8, y: 0.5, color: '#0000ff' },
    ];

    const voters = generateVotersFromBloc(createVoterBloc({ x: 0.25, y: 0.5 }, 100, 0.05));

    it.each([
      ['plurality'],
      ['approval'],
      ['irv'],
      ['borda'],
      ['condorcet'],
      ['smithApproval'],
    ] as [VotingMethod][])('computes winner for %s method', (method) => {
      const winner = computeWinner(voters, twoCandidates, method, 0.3);
      expect(['a', 'b']).toContain(winner);
    });
  });

  describe('generateYeeDiagram', () => {
    const twoCandidates: SpatialCandidate[] = [
      { id: 'a', name: 'A', x: 0.25, y: 0.5, color: '#ff0000' },
      { id: 'b', name: 'B', x: 0.75, y: 0.5, color: '#0000ff' },
    ];

    it('generates a 2D grid of winners', () => {
      const voters = generateVotersFromBloc(createVoterBloc({ x: 0.5, y: 0.5 }, 500, 0.3));

      const result = generateYeeDiagram({
        voters,
        candidates: twoCandidates,
        method: 'plurality',
        resolution: 10,
      });

      expect(result.grid).toHaveLength(10);
      expect(result.grid[0]).toHaveLength(10);
      expect(result.resolution).toBe(10);
    });

    it('returns winner IDs in grid cells', () => {
      const voters = generateVotersFromBloc(createVoterBloc({ x: 0.3, y: 0.5 }, 500, 0.1));

      const result = generateYeeDiagram({
        voters,
        candidates: twoCandidates,
        method: 'plurality',
        resolution: 10,
      });

      result.grid.flat().forEach(winnerId => {
        expect(['a', 'b']).toContain(winnerId);
      });
    });
  });
});
