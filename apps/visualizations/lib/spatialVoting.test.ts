import { describe, expect, test } from 'vitest';
import {
  DEFAULT_APPROVAL_THRESHOLD,
  distance,
  generateVoteFromPosition,
  generateVotesFromSpatialData,
  getWeight,
  spatialVoteCalculators,
  type SpatialCandidate,
} from './spatialVoting';

describe('Spatial Voting Utilities', () => {
  describe('Basic Math Functions', () => {
    test('distance calculation', () => {
      expect(distance(0, 0, 3, 4)).toBe(5); // 3-4-5 triangle
      expect(distance(1, 1, 1, 1)).toBe(0); // Same point
      expect(distance(0, 0, 1, 0)).toBe(1); // Horizontal
      expect(distance(0, 0, 0, 1)).toBe(1); // Vertical
    });

    test('weight calculation', () => {
      const radius = 0.3;
      // At center, weight should be 1
      expect(getWeight(0, radius)).toBe(1);
      // At boundary, weight should be 0
      expect(getWeight(radius, radius)).toBe(0);
      // Beyond boundary, weight should be 0
      expect(getWeight(radius * 2, radius)).toBe(0);
      // At half radius, weight should be 0.75 (quadratic falloff)
      expect(getWeight(radius / 2, radius)).toBeCloseTo(0.75, 2);
    });
  });

  describe('Vote Generation', () => {
    const candidates: SpatialCandidate[] = [
      { id: '1', x: 0.2, y: 0.2, color: '#ff0000', name: 'A' },
      { id: '2', x: 0.8, y: 0.8, color: '#00ff00', name: 'B' },
      { id: '3', x: 0.5, y: 0.5, color: '#0000ff', name: 'C' },
    ];

    test('generates vote from position', () => {
      const vote = generateVoteFromPosition(
        { x: 0.2, y: 0.2 },
        candidates,
        DEFAULT_APPROVAL_THRESHOLD
      );

      expect(vote.ranking[0]).toBe('1'); // Closest should be first
      expect(vote.approved).toContain('1'); // Should approve closest candidate
      expect(vote.timestamp).toBeDefined();
      expect(typeof vote.voterName).toBe('string');
    });

    test('generates multiple votes from positions', () => {
      const voters = [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.8 },
      ];

      const votes = generateVotesFromSpatialData(voters, candidates);
      expect(votes).toHaveLength(2);
      expect(votes[0].ranking[0]).toBe('1'); // First voter closest to A
      expect(votes[1].ranking[0]).toBe('2'); // Second voter closest to B
    });

    test('handles approval threshold', () => {
      const vote = generateVoteFromPosition(
        { x: 0.5, y: 0.5 }, // Position at candidate C
        candidates,
        0.1 // Small threshold
      );

      expect(vote.approved).toHaveLength(1); // Should only approve closest
      expect(vote.approved).toContain('3'); // Should approve C
    });
  });

  describe('Voting Methods', () => {
    const candidates: SpatialCandidate[] = [
      { id: '1', x: 0.3, y: 0.3, color: '#ff0000', name: 'A' },
      { id: '2', x: 0.7, y: 0.7, color: '#00ff00', name: 'B' },
      { id: '3', x: 0.5, y: 0.5, color: '#0000ff', name: 'C' },
    ];

    describe('Plurality', () => {
      test('selects closest candidate', () => {
        const result = spatialVoteCalculators.plurality(0.3, 0.3, candidates);
        expect(result[0]).toBe('1');
      });

      test('handles equidistant case', () => {
        // Point equidistant from A and B
        const result = spatialVoteCalculators.plurality(0.5, 0.5, candidates);
        expect(result).toHaveLength(1);
      });
    });

    describe('Approval', () => {
      test('approves candidates within threshold', () => {
        const result = spatialVoteCalculators.approval(
          0.3,
          0.3,
          candidates,
          0.2
        );
        expect(result).toContain('1');
        expect(result).not.toContain('2'); // Too far
      });

      test('approves multiple candidates when appropriate', () => {
        const result = spatialVoteCalculators.approval(
          0.5,
          0.5,
          candidates,
          0.3
        );
        expect(result.length).toBeGreaterThan(1);
      });
    });

    describe('IRV', () => {
      test('returns full ranking', () => {
        const result = spatialVoteCalculators.irv(0.3, 0.3, candidates);
        expect(result).toHaveLength(candidates.length);
        expect(result[0]).toBe('1'); // Closest should be first
      });
    
      test('maintains distance-based preference ordering', () => {
        const voterX = 0.3;
        const voterY = 0.3;
        const result = spatialVoteCalculators.irv(voterX, voterY, candidates);
        
        // Get actual distances for each candidate
        const distances = candidates.map(c => ({
          id: c.id,
          dist: distance(voterX, voterY, c.x, c.y)
        }));
        
        // Sort by distance
        const sortedByDistance = [...distances].sort((a, b) => a.dist - b.dist);
        
        // The order in result should match order by distance
        expect(result).toEqual(sortedByDistance.map(d => d.id));
      });
    });

    describe('Borda Count', () => {
      test('returns full ranking', () => {
        const result = spatialVoteCalculators.borda(0.3, 0.3, candidates);
        expect(result).toHaveLength(candidates.length);
      });

      test('ranks by distance', () => {
        const result = spatialVoteCalculators.borda(0.3, 0.3, candidates);
        expect(result[0]).toBe('1'); // Closest should get most points
      });
    });

    describe('Smith + Approval', () => {
      test('selects from Smith set', () => {
        const result = spatialVoteCalculators.smithApproval(
          0.5,
          0.5,
          candidates,
          0.3
        );
        expect(result.length).toBeGreaterThan(0);
      });

      test('handles single-candidate Smith set', () => {
        // Point very close to one candidate
        const result = spatialVoteCalculators.smithApproval(
          0.3,
          0.3,
          candidates,
          0.1
        );
        expect(result).toEqual(['1']);
      });
    });
  });
});
