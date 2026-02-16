import { describe, it, expect } from 'vitest';
import { generatePerturbationMap, PerturbationMapConfig } from './PerturbationMap';
import { SpatialCandidate, Voter } from './types';

describe('generatePerturbationMap', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.25, y: 0.5, color: '#ef4444' },
    { id: 'b', name: 'B', x: 0.75, y: 0.5, color: '#3b82f6' },
  ];

  // Create deterministic voters: 10 near A, 10 near B
  const voters: Voter[] = [
    ...Array.from({ length: 10 }, (_, i) => ({
      position: { x: 0.2 + i * 0.01, y: 0.5 },
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      position: { x: 0.7 + i * 0.01, y: 0.5 },
    })),
  ];

  it('generates a grid of correct dimensions', () => {
    const config: PerturbationMapConfig = {
      candidates,
      voters,
      targetCandidate: candidates[1], // B
      method: 'plurality',
      resolution: 10,
      maxVoterPercent: 0.5,
    };

    const result = generatePerturbationMap(config);

    expect(result.grid).toHaveLength(10);
    expect(result.grid[0]).toHaveLength(10);
    expect(result.targetCandidateId).toBe('b');
  });

  it('bottom-left cell (0% perturbation) shows baseline winner', () => {
    const config: PerturbationMapConfig = {
      candidates,
      voters,
      targetCandidate: candidates[1],
      method: 'plurality',
      resolution: 10,
      maxVoterPercent: 0.5,
    };

    const result = generatePerturbationMap(config);
    // With equal voters, either could win - just check it's a valid candidate
    expect(['a', 'b']).toContain(result.grid[0][0]);
  });

  it('high perturbation toward B shifts winner to B', () => {
    const config: PerturbationMapConfig = {
      candidates,
      voters,
      targetCandidate: candidates[1], // B
      method: 'plurality',
      resolution: 10,
      maxVoterPercent: 0.5,
    };

    const result = generatePerturbationMap(config);
    // Top-right: 50% voters shifted 100% toward B
    // B should win with overwhelming support
    expect(result.grid[9][9]).toBe('b');
  });
});
