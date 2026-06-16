import { describe, expect, test } from 'vitest';
import {
  RealStateDistrictingDataset,
  districtRealByCountyIntegrity,
  districtRealByRegionGrow,
  districtRealByWeightedCentroid,
} from './realDistricting';

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
});
