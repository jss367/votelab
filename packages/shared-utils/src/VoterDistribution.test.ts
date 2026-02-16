import { describe, it, expect } from 'vitest';
import {
  generateVotersFromBloc,
  createVoterBloc,
  generatePopulation,
  createPresetPopulation,
} from './VoterDistribution.js';

describe('VoterDistribution', () => {
  describe('createVoterBloc', () => {
    it('creates a bloc with correct properties', () => {
      const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.1);

      expect(bloc.position).toEqual({ x: 0.5, y: 0.5 });
      expect(bloc.count).toBe(100);
      expect(bloc.spread).toBe(0.1);
      expect(bloc.id).toBeDefined();
    });
  });

  describe('generateVotersFromBloc', () => {
    it('generates correct number of voters', () => {
      const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.1);
      const voters = generateVotersFromBloc(bloc);

      expect(voters).toHaveLength(100);
    });

    it('generates voters near bloc center', () => {
      const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 1000, 0.05);
      const voters = generateVotersFromBloc(bloc);

      // With spread 0.05, most voters should be within 0.15 of center (3 std devs)
      const nearCenter = voters.filter(v =>
        Math.abs(v.position.x - 0.5) < 0.15 &&
        Math.abs(v.position.y - 0.5) < 0.15
      );
      expect(nearCenter.length).toBeGreaterThan(950); // 99.7% within 3 std devs
    });

    it('clamps voters to 0-1 bounds', () => {
      const bloc = createVoterBloc({ x: 0.0, y: 0.0 }, 500, 0.2);
      const voters = generateVotersFromBloc(bloc);

      voters.forEach(v => {
        expect(v.position.x).toBeGreaterThanOrEqual(0);
        expect(v.position.x).toBeLessThanOrEqual(1);
        expect(v.position.y).toBeGreaterThanOrEqual(0);
        expect(v.position.y).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('generatePopulation', () => {
    it('combines voters from multiple blocs', () => {
      const blocs = [
        createVoterBloc({ x: 0.2, y: 0.2 }, 50, 0.1),
        createVoterBloc({ x: 0.8, y: 0.8 }, 50, 0.1),
      ];
      const voters = generatePopulation(blocs);

      expect(voters).toHaveLength(100);
    });
  });

  describe('createPresetPopulation', () => {
    it('creates uniform distribution', () => {
      const { blocs } = createPresetPopulation('uniform', 1000);
      const voters = generatePopulation(blocs);

      expect(voters).toHaveLength(1000);
      // Check spread across quadrants
      const q1 = voters.filter(v => v.position.x < 0.5 && v.position.y < 0.5);
      const q2 = voters.filter(v => v.position.x >= 0.5 && v.position.y < 0.5);
      const q3 = voters.filter(v => v.position.x < 0.5 && v.position.y >= 0.5);
      const q4 = voters.filter(v => v.position.x >= 0.5 && v.position.y >= 0.5);

      // Each quadrant should have roughly 25% of voters (within 10% tolerance)
      [q1, q2, q3, q4].forEach(q => {
        expect(q.length).toBeGreaterThan(150);
        expect(q.length).toBeLessThan(350);
      });
    });

    it('creates centered distribution', () => {
      const { blocs } = createPresetPopulation('centered', 1000);
      const voters = generatePopulation(blocs);

      expect(voters).toHaveLength(1000);
      // Most voters should be near center
      const nearCenter = voters.filter(v =>
        Math.abs(v.position.x - 0.5) < 0.3 &&
        Math.abs(v.position.y - 0.5) < 0.3
      );
      expect(nearCenter.length).toBeGreaterThan(800);
    });

    it('creates polarized distribution with two blocs', () => {
      const { blocs } = createPresetPopulation('polarized', 1000);

      expect(blocs).toHaveLength(2);
      const voters = generatePopulation(blocs);
      expect(voters).toHaveLength(1000);
    });

    it('creates triangle distribution with three blocs', () => {
      const { blocs } = createPresetPopulation('triangle', 900);

      expect(blocs).toHaveLength(3);
      const voters = generatePopulation(blocs);
      expect(voters).toHaveLength(900);
    });
  });
});
