import { describe, expect, test } from 'vitest';
import { districtByRecom } from './recom';
import {
  RealDistrictingMetrics,
  RealDistrictingResult,
  RealStateDistrictingDataset,
  VALIDITY_TOLERANCE,
  compareDistrictingMetrics,
  selectBestDistricting,
} from './realDistricting';
import californiaTracts from '../public/data/districting/california-tracts.json';
import georgiaTracts from '../public/data/districting/georgia-tracts.json';
import hawaiiTracts from '../public/data/districting/hawaii-tracts.json';
import illinoisTracts from '../public/data/districting/illinois-tracts.json';

function metrics(
  partial: Partial<RealDistrictingMetrics>
): RealDistrictingMetrics {
  return {
    totalPopulation: 0,
    idealPopulation: 0,
    populations: [],
    minPopulation: 0,
    maxPopulation: 0,
    maxDeviationFraction: 0,
    avgWeightedDistance: 0,
    splitCounties: 0,
    countySplitFraction: 0,
    contiguousDistricts: 0,
    valid: false,
    ...partial,
  };
}

function bestPlan(
  dataset: RealStateDistrictingDataset,
  seeds: number
): RealDistrictingResult {
  const candidates: RealDistrictingResult[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    // Clone because ReCom bridges disconnected components by mutating neighbors.
    const clone = structuredClone(dataset);
    const { result } = districtByRecom(clone, { seed });
    candidates.push(result);
  }
  return selectBestDistricting(candidates);
}

describe('compareDistrictingMetrics', () => {
  test('ranks more contiguous districts ahead of lower deviation', () => {
    const moreContiguous = metrics({
      contiguousDistricts: 14,
      maxDeviationFraction: 0.33,
    });
    const balancedButSplit = metrics({
      contiguousDistricts: 9,
      maxDeviationFraction: 0.1,
    });
    // Policy A: contiguity is mandatory, so the fully contiguous plan wins even
    // though it is worse on population balance.
    expect(
      compareDistrictingMetrics(moreContiguous, balancedButSplit)
    ).toBeLessThan(0);
  });

  test('breaks contiguity ties by population deviation', () => {
    const tight = metrics({ contiguousDistricts: 12, maxDeviationFraction: 0.02 });
    const loose = metrics({ contiguousDistricts: 12, maxDeviationFraction: 0.2 });
    expect(compareDistrictingMetrics(tight, loose)).toBeLessThan(0);
  });
});

describe('selectBestDistricting', () => {
  test('returns the highest-ranked candidate', () => {
    const make = (m: Partial<RealDistrictingMetrics>): RealDistrictingResult => ({
      algorithm: 'x',
      assignment: {},
      centroids: [],
      numDistricts: 3,
      metrics: metrics(m),
    });
    const best = make({ contiguousDistricts: 3, maxDeviationFraction: 0.05 });
    const chosen = selectBestDistricting([
      make({ contiguousDistricts: 2, maxDeviationFraction: 0.01 }),
      best,
      make({ contiguousDistricts: 3, maxDeviationFraction: 0.4 }),
    ]);
    expect(chosen).toBe(best);
  });

  test('throws on an empty candidate list', () => {
    expect(() => selectBestDistricting([])).toThrow();
  });
});

describe('ReCom districting', () => {
  test('builds a valid plan for a high-district-count state (Illinois)', () => {
    const result = bestPlan(illinoisTracts as RealStateDistrictingDataset, 6);
    expect(result.metrics.contiguousDistricts).toBe(
      (illinoisTracts as RealStateDistrictingDataset).defaultDistricts
    );
    expect(result.metrics.maxDeviationFraction).toBeLessThanOrEqual(
      VALIDITY_TOLERANCE
    );
    expect(result.metrics.valid).toBe(true);
  });

  test('builds a valid plan for Georgia', () => {
    const result = bestPlan(georgiaTracts as RealStateDistrictingDataset, 6);
    expect(result.metrics.valid).toBe(true);
  });

  test('keeps every unit assigned and population conserved (California)', () => {
    const dataset = californiaTracts as RealStateDistrictingDataset;
    const { result } = districtByRecom(structuredClone(dataset), { seed: 1 });
    expect(Object.keys(result.assignment).length).toBe(dataset.units.length);
    const assigned = dataset.units.reduce(
      (sum, unit) => sum + unit.population,
      0
    );
    expect(result.metrics.totalPopulation).toBe(assigned);
  });

  test('does not crash when no balanced cut exists (star graph)', () => {
    // A star (center + 4 leaves) split into 4 districts: no spanning-tree edge
    // can put >=2 nodes on each side, so recursive seeding finds no balanced
    // cut. It must fall back gracefully and emit a result, not throw.
    const center = {
      geoid: 'c',
      name: 'C',
      type: 'tract' as const,
      countyGeoid: 'k',
      countyName: 'K',
      population: 100,
      areaLand: 1,
      centroid: { x: 0, y: 0 },
      neighbors: ['l0', 'l1', 'l2', 'l3'],
    };
    const leaves = [0, 1, 2, 3].map((i) => ({
      geoid: `l${i}`,
      name: `L${i}`,
      type: 'tract' as const,
      countyGeoid: 'k',
      countyName: 'K',
      population: 100,
      areaLand: 1,
      centroid: { x: Math.cos(i), y: Math.sin(i) },
      neighbors: ['c'],
    }));
    const star: RealStateDistrictingDataset = {
      stateFips: '00',
      stateName: 'Star',
      unitType: 'tract',
      defaultDistricts: 4,
      bbox: [-1, -1, 1, 1],
      units: [center, ...leaves],
      geometries: { type: 'FeatureCollection', features: [] },
    };
    expect(() =>
      districtByRecom(structuredClone(star), { seed: 1 })
    ).not.toThrow();
    const { result } = districtByRecom(structuredClone(star), { seed: 1 });
    expect(result.numDistricts).toBe(4);
    expect(Object.keys(result.assignment)).toHaveLength(5);
  });

  test('bridges disconnected island components (Hawaii)', () => {
    const { result, bridges } = districtByRecom(
      structuredClone(hawaiiTracts as RealStateDistrictingDataset),
      { seed: 3 }
    );
    // Hawaii's tracts form 8 separate island components; bridging connects them
    // so a balanced two-district plan is possible.
    expect(bridges).toBeGreaterThan(0);
    expect(result.metrics.maxDeviationFraction).toBeLessThanOrEqual(
      VALIDITY_TOLERANCE
    );
  });
});
