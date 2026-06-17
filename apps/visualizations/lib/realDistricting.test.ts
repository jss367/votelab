import { describe, expect, test } from 'vitest';
import {
  RealStateDistrictingDataset,
  districtRealByCountyIntegrity,
  districtRealByRegionGrow,
  districtRealByWeightedCentroid,
} from './realDistricting';
import arizonaTracts from '../public/data/districting/arizona-tracts.json';
import californiaTracts from '../public/data/districting/california-tracts.json';
import marylandTracts from '../public/data/districting/maryland-tracts.json';

const testDataset: RealStateDistrictingDataset = {
  stateFips: '00',
  stateName: 'Test',
  unitType: 'tract',
  defaultDistricts: 2,
  bbox: [0, 0, 1, 1],
  units: [
    {
      geoid: 'a',
      name: 'A',
      type: 'tract',
      countyGeoid: 'c1',
      countyName: 'County 1',
      population: 100,
      areaLand: 1,
      centroid: { x: 0, y: 1 },
      neighbors: ['b', 'c'],
    },
    {
      geoid: 'b',
      name: 'B',
      type: 'tract',
      countyGeoid: 'c1',
      countyName: 'County 1',
      population: 100,
      areaLand: 1,
      centroid: { x: 0, y: 0 },
      neighbors: ['a', 'd'],
    },
    {
      geoid: 'c',
      name: 'C',
      type: 'tract',
      countyGeoid: 'c2',
      countyName: 'County 2',
      population: 100,
      areaLand: 1,
      centroid: { x: 1, y: 1 },
      neighbors: ['a', 'd'],
    },
    {
      geoid: 'd',
      name: 'D',
      type: 'tract',
      countyGeoid: 'c2',
      countyName: 'County 2',
      population: 100,
      areaLand: 1,
      centroid: { x: 1, y: 0 },
      neighbors: ['b', 'c'],
    },
  ],
  geometries: {
    type: 'FeatureCollection',
    features: [],
  },
};

function assignedGeoids(result: { assignment: Record<string, number> }) {
  return Object.keys(result.assignment).sort();
}

describe('real districting', () => {
  test('weighted centroid assigns every unit and preserves population totals', () => {
    const result = districtRealByWeightedCentroid(testDataset, {
      numDistricts: 2,
      seed: 2,
    });

    expect(assignedGeoids(result)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.metrics.totalPopulation).toBe(400);
    expect(result.metrics.populations.reduce((s, p) => s + p, 0)).toBe(400);
    expect(result.metrics.maxDeviationFraction).toBeLessThanOrEqual(0.5);
  });

  test('estimates district partisan scores from county results by population share', () => {
    const result = districtRealByCountyIntegrity(testDataset, {
      numDistricts: 2,
      seed: 1,
      election: {
        id: 'test-election',
        title: 'Test election',
        source: 'test',
        sourceUrl: 'https://example.com',
        note: 'test',
        counties: {
          c1: {
            countyName: 'County 1',
            votesDem: 80,
            votesGop: 20,
            totalVotes: 100,
          },
          c2: {
            countyName: 'County 2',
            votesDem: 30,
            votesGop: 70,
            totalVotes: 100,
          },
        },
      },
    });

    expect(result.metrics.partisanScores).toHaveLength(2);
    expect(result.metrics.seatsDem).toBe(1);
    expect(result.metrics.seatsGop).toBe(1);
    expect(
      result.metrics.partisanScores
        ?.map((score) => Number(Math.abs(score.margin).toFixed(1)))
        .sort()
    ).toEqual([0.4, 0.6]);
  });

  test('suppresses partisan scores when election coverage is incomplete', () => {
    const result = districtRealByCountyIntegrity(testDataset, {
      numDistricts: 2,
      seed: 1,
      election: {
        id: 'partial-election',
        title: 'Partial election',
        source: 'test',
        sourceUrl: 'https://example.com',
        note: 'test',
        counties: {
          c1: {
            countyName: 'County 1',
            votesDem: 80,
            votesGop: 20,
            totalVotes: 100,
          },
        },
      },
    });

    expect(result.metrics.partisanScores).toBeUndefined();
    expect(result.metrics.seatsDem).toBeUndefined();
    expect(result.metrics.seatsGop).toBeUndefined();
  });

  test('county integrity can keep balanced counties whole', () => {
    const result = districtRealByCountyIntegrity(testDataset, {
      numDistricts: 2,
      seed: 1,
    });

    expect(result.metrics.totalPopulation).toBe(400);
    expect(result.metrics.splitCounties).toBe(0);
    expect(result.metrics.populations).toEqual([200, 200]);
  });

  test('region growing reports contiguous districts on a connected grid', () => {
    const result = districtRealByRegionGrow(testDataset, {
      numDistricts: 2,
      seed: 1,
    });

    expect(assignedGeoids(result)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.metrics.contiguousDistricts).toBe(2);
    expect(result.metrics.populations.reduce((s, p) => s + p, 0)).toBe(400);
  });

  test('balances the default California tract fixture', () => {
    const californiaDataset = californiaTracts as RealStateDistrictingDataset;
    const weighted = districtRealByWeightedCentroid(californiaDataset, {
      seed: 1,
    });
    const county = districtRealByCountyIntegrity(californiaDataset, {
      seed: 1,
    });

    expect(weighted.metrics.maxDeviationFraction).toBeLessThanOrEqual(0.085);
    expect(county.metrics.maxDeviationFraction).toBeLessThanOrEqual(0.125);
  });

  test('region growing balances and keeps Arizona districts contiguous', () => {
    const arizonaDataset = arizonaTracts as RealStateDistrictingDataset;
    const result = districtRealByRegionGrow(arizonaDataset, { seed: 1 });

    expect(result.metrics.contiguousDistricts).toBe(result.numDistricts);
    expect(result.metrics.maxDeviationFraction).toBeLessThanOrEqual(0.101);
  });

  test('region growing balances and keeps Maryland districts contiguous', () => {
    const marylandDataset = marylandTracts as RealStateDistrictingDataset;
    const result = districtRealByRegionGrow(marylandDataset, { seed: 1 });

    expect(result.metrics.contiguousDistricts).toBe(result.numDistricts);
    expect(result.metrics.maxDeviationFraction).toBeLessThanOrEqual(0.101);
  });

  test('region growing repairs bottlenecked Maryland districts via bridge moves', () => {
    // Seeds 3 and 6 previously left a district starved (~0.86 and ~0.70
    // deviation): the only tract bordering the underfilled district was a
    // bridge whose single-unit move would disconnect its donor, so the
    // lower-bound repair stalled. The bridge-plus-leaf group move clears it.
    const marylandDataset = marylandTracts as RealStateDistrictingDataset;
    for (const seed of [3, 6]) {
      const result = districtRealByRegionGrow(marylandDataset, { seed });
      expect(result.metrics.contiguousDistricts).toBe(result.numDistricts);
      expect(result.metrics.maxDeviationFraction).toBeLessThanOrEqual(0.11);
    }
  });
});
