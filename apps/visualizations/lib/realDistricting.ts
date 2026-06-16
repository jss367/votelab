export interface GeoPoint {
  x: number;
  y: number;
}

export type GeoUnitType = 'tract' | 'blockGroup' | 'block';

export type PolygonCoordinates = number[][][];
export type MultiPolygonCoordinates = number[][][][];

export interface DistrictingFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: PolygonCoordinates | MultiPolygonCoordinates;
  };
  properties: {
    geoid: string;
  };
}

export interface DistrictingFeatureCollection {
  type: 'FeatureCollection';
  features: DistrictingFeature[];
}

export interface DistrictGeoUnit {
  geoid: string;
  name: string;
  type: GeoUnitType;
  countyGeoid: string;
  countyName: string;
  population: number;
  votingAgePopulation?: number;
  demographics?: {
    hispanicOrLatino?: number;
    nonHispanicWhite?: number;
    blackAlone?: number;
    asianAlone?: number;
  };
  areaLand: number;
  centroid: GeoPoint;
  neighbors: string[];
}

export interface RealStateDistrictingDataset {
  stateFips: string;
  stateName: string;
  unitType: GeoUnitType;
  defaultDistricts: number;
  bbox: [number, number, number, number];
  units: DistrictGeoUnit[];
  geometries: DistrictingFeatureCollection;
}

export interface CountyElectionResult {
  countyName: string;
  votesDem: number;
  votesGop: number;
  totalVotes: number;
}

export interface CountyElectionDataset {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  note: string;
  counties: Record<string, CountyElectionResult>;
}

export interface PartisanDistrictScore {
  votesDem: number;
  votesGop: number;
  totalVotes: number;
  demShare: number;
  gopShare: number;
  margin: number;
}

export interface RealDistrictingMetrics {
  totalPopulation: number;
  votingAgePopulations?: number[];
  idealPopulation: number;
  populations: number[];
  minPopulation: number;
  maxPopulation: number;
  maxDeviationFraction: number;
  avgWeightedDistance: number;
  splitCounties: number;
  countySplitFraction: number;
  contiguousDistricts: number;
  partisanScores?: PartisanDistrictScore[];
  medianPartisanMargin?: number;
  seatsDem?: number;
  seatsGop?: number;
}

export interface RealDistrictingResult {
  algorithm: string;
  assignment: Record<string, number>;
  centroids: GeoPoint[];
  numDistricts: number;
  metrics: RealDistrictingMetrics;
}

export interface RealDistrictingOptions {
  numDistricts?: number;
  seed?: number;
  maxIterations?: number;
  tolerance?: number;
  election?: CountyElectionDataset;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist(a: GeoPoint, b: GeoPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function weightedMean(points: GeoPoint[], weights: number[]): GeoPoint {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let i = 0; i < points.length; i++) {
    const w = Math.max(0, weights[i]);
    sx += points[i].x * w;
    sy += points[i].y * w;
    sw += w;
  }
  if (sw <= 0) return { x: 0, y: 0 };
  return { x: sx / sw, y: sy / sw };
}

function kmeansPlusPlusInit(
  points: GeoPoint[],
  weights: number[],
  k: number,
  rand: () => number
): GeoPoint[] {
  const centroids: GeoPoint[] = [];
  const totalWeight = weights.reduce((s, w) => s + Math.max(0, w), 0);
  let pick = rand() * totalWeight;
  let firstIdx = 0;
  for (let i = 0; i < points.length; i++) {
    pick -= Math.max(0, weights[i]);
    if (pick <= 0) {
      firstIdx = i;
      break;
    }
  }
  centroids.push({ ...points[firstIdx] });

  while (centroids.length < k) {
    const weightedDistances = points.map((p, i) => {
      let best = Infinity;
      for (const c of centroids) {
        const d = dist(p, c);
        best = Math.min(best, d * d);
      }
      return best * Math.max(0, weights[i]);
    });
    const sum = weightedDistances.reduce((s, d) => s + d, 0);
    if (sum <= 0) {
      centroids.push({ ...points[Math.floor(rand() * points.length)] });
      continue;
    }
    let r = rand() * sum;
    let chosen = 0;
    for (let i = 0; i < weightedDistances.length; i++) {
      r -= weightedDistances[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push({ ...points[chosen] });
  }

  return centroids;
}

function nearestOrder(point: GeoPoint, centroids: GeoPoint[]): number[] {
  return centroids
    .map((c, idx) => ({ idx, d: dist(point, c) }))
    .sort((a, b) => a.d - b.d)
    .map((entry) => entry.idx);
}

function weightedAssign(
  points: GeoPoint[],
  populations: number[],
  centroids: GeoPoint[],
  tolerance: number
): number[] {
  const k = centroids.length;
  const totalPopulation = populations.reduce((s, p) => s + p, 0);
  const ideal = totalPopulation / k;
  const lowerBound = ideal * (1 - tolerance);
  const capacity = ideal * (1 + tolerance);

  const ranked = points
    .map((point, i) => {
      const distances = centroids
        .map((c, idx) => ({ idx, d: dist(point, c) }))
        .sort((a, b) => a.d - b.d);
      return {
        i,
        order: distances.map((entry) => entry.idx),
        distances,
        regret: (distances[1]?.d ?? distances[0].d) - distances[0].d,
        population: populations[i],
      };
    })
    .sort((a, b) => b.regret - a.regret || b.population - a.population);

  const assignment = new Array(points.length).fill(-1);
  const counts = new Array(k).fill(0);

  for (const entry of ranked) {
    const district = entry.distances.reduce((best, candidate, rank) => {
      const projected = counts[candidate.idx] + entry.population;
      const overCapacity = Math.max(0, projected - capacity) / Math.max(1, ideal);
      const deficitBefore =
        Math.max(0, lowerBound - counts[candidate.idx]) / Math.max(1, ideal);
      const deficitAfter =
        Math.max(0, lowerBound - projected) / Math.max(1, ideal);
      const rankPenalty = rank / Math.max(1, k - 1);
      const score =
        overCapacity * 10000 +
        deficitAfter * 6 -
        deficitBefore * 8 +
        rankPenalty;
      return score < best.score ? { idx: candidate.idx, score } : best;
    }, { idx: entry.distances[0].idx, score: Infinity }).idx;
    assignment[entry.i] = district;
    counts[district] += entry.population;
  }

  rebalanceUnderfilledDistricts(
    points,
    populations,
    centroids,
    assignment,
    counts,
    tolerance
  );

  return assignment;
}

function rebalanceUnderfilledDistricts(
  points: GeoPoint[],
  populations: number[],
  centroids: GeoPoint[],
  assignment: number[],
  counts: number[],
  tolerance: number
) {
  const k = centroids.length;
  const totalPopulation = populations.reduce((s, p) => s + p, 0);
  const ideal = totalPopulation / k;
  const lowerBound = ideal * (1 - tolerance);
  const capacity = ideal * (1 + tolerance);
  const maxMoves = Math.max(points.length * k, points.length);

  for (let move = 0; move < maxMoves; move++) {
    const underDistrict = counts.reduce((best, population, district) => {
      if (population >= lowerBound) return best;
      if (best < 0) return district;
      return population < counts[best] ? district : best;
    }, -1);
    if (underDistrict < 0) break;

    let bestUnit = -1;
    let bestScore = Infinity;
    for (let i = 0; i < points.length; i++) {
      const fromDistrict = assignment[i];
      if (fromDistrict === underDistrict) continue;

      const population = populations[i];
      const underAfter = counts[underDistrict] + population;
      const fromAfter = counts[fromDistrict] - population;
      if (underAfter > capacity) continue;
      if (fromAfter < lowerBound && counts[fromDistrict] <= ideal) continue;

      const donorPenalty =
        Math.max(0, lowerBound - fromAfter) / Math.max(1, ideal);
      const fillProgress =
        Math.min(population, lowerBound - counts[underDistrict]) /
        Math.max(1, ideal);
      const distancePenalty =
        dist(points[i], centroids[underDistrict]) -
        dist(points[i], centroids[fromDistrict]);
      const score = distancePenalty + donorPenalty * 100 - fillProgress * 10;

      if (score < bestScore) {
        bestScore = score;
        bestUnit = i;
      }
    }

    if (bestUnit < 0) break;

    const fromDistrict = assignment[bestUnit];
    const population = populations[bestUnit];
    assignment[bestUnit] = underDistrict;
    counts[fromDistrict] -= population;
    counts[underDistrict] += population;
  }
}

function assignmentToRecord(
  units: DistrictGeoUnit[],
  assignment: number[]
): Record<string, number> {
  const record: Record<string, number> = {};
  for (let i = 0; i < units.length; i++) {
    record[units[i].geoid] = assignment[i];
  }
  return record;
}

function recomputeCentroids(
  units: DistrictGeoUnit[],
  assignment: number[],
  previous: GeoPoint[],
  k: number
): GeoPoint[] {
  return Array.from({ length: k }, (_, d) => {
    const points: GeoPoint[] = [];
    const weights: number[] = [];
    for (let i = 0; i < units.length; i++) {
      if (assignment[i] !== d) continue;
      points.push(units[i].centroid);
      weights.push(units[i].population);
    }
    return points.length ? weightedMean(points, weights) : previous[d];
  });
}

function computeMetrics(
  dataset: RealStateDistrictingDataset,
  assignment: number[],
  centroids: GeoPoint[],
  k: number,
  election?: CountyElectionDataset
): RealDistrictingMetrics {
  const populations = new Array(k).fill(0);
  const votingAgePopulations = new Array(k).fill(0);
  let hasVotingAgePopulation = false;
  let weightedDistance = 0;
  let totalPopulation = 0;

  for (let i = 0; i < dataset.units.length; i++) {
    const unit = dataset.units[i];
    const district = assignment[i];
    populations[district] += unit.population;
    if (typeof unit.votingAgePopulation === 'number') {
      votingAgePopulations[district] += unit.votingAgePopulation;
      hasVotingAgePopulation = true;
    }
    weightedDistance += unit.population * dist(unit.centroid, centroids[district]);
    totalPopulation += unit.population;
  }

  const countyDistricts = new Map<string, Set<number>>();
  for (let i = 0; i < dataset.units.length; i++) {
    const county = dataset.units[i].countyGeoid;
    if (!countyDistricts.has(county)) countyDistricts.set(county, new Set());
    countyDistricts.get(county)!.add(assignment[i]);
  }
  let splitCounties = 0;
  countyDistricts.forEach((districts) => {
    if (districts.size > 1) splitCounties++;
  });

  const unitIndex = new Map(dataset.units.map((unit, i) => [unit.geoid, i]));
  let contiguousDistricts = 0;
  for (let d = 0; d < k; d++) {
    const districtUnits = dataset.units
      .map((unit, i) => ({ unit, i }))
      .filter(({ i }) => assignment[i] === d);
    if (districtUnits.length === 0) continue;
    const districtGeoids = new Set(districtUnits.map(({ unit }) => unit.geoid));
    const seen = new Set<string>();
    const queue = [districtUnits[0].unit.geoid];
    seen.add(queue[0]);
    while (queue.length) {
      const geoid = queue.shift()!;
      const idx = unitIndex.get(geoid);
      if (idx === undefined) continue;
      for (const neighbor of dataset.units[idx].neighbors) {
        if (!districtGeoids.has(neighbor) || seen.has(neighbor)) continue;
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
    if (seen.size === districtUnits.length) contiguousDistricts++;
  }

  const idealPopulation = totalPopulation / k;
  const minPopulation = Math.min(...populations);
  const maxPopulation = Math.max(...populations);
  const maxDeviation = Math.max(
    ...populations.map((population) =>
      Math.abs(population - idealPopulation)
    )
  );

  const partisanScores = election
    ? computePartisanScores(dataset, assignment, k, election)
    : undefined;
  const margins = partisanScores
    ?.map((score) => score.margin)
    .sort((a, b) => a - b);
  const medianPartisanMargin =
    margins && margins.length
      ? margins[Math.floor(margins.length / 2)]
      : undefined;

  return {
    totalPopulation,
    votingAgePopulations: hasVotingAgePopulation
      ? votingAgePopulations
      : undefined,
    idealPopulation,
    populations,
    minPopulation,
    maxPopulation,
    maxDeviationFraction: maxDeviation / Math.max(1, idealPopulation),
    avgWeightedDistance: weightedDistance / Math.max(1, totalPopulation),
    splitCounties,
    countySplitFraction: splitCounties / Math.max(1, countyDistricts.size),
    contiguousDistricts,
    partisanScores,
    medianPartisanMargin,
    seatsDem: partisanScores?.filter((score) => score.margin > 0).length,
    seatsGop: partisanScores?.filter((score) => score.margin < 0).length,
  };
}

function computePartisanScores(
  dataset: RealStateDistrictingDataset,
  assignment: number[],
  k: number,
  election: CountyElectionDataset
): PartisanDistrictScore[] {
  const countyPopulation = new Map<string, number>();
  for (const unit of dataset.units) {
    countyPopulation.set(
      unit.countyGeoid,
      (countyPopulation.get(unit.countyGeoid) ?? 0) + unit.population
    );
  }

  const scores = Array.from({ length: k }, () => ({
    votesDem: 0,
    votesGop: 0,
    totalVotes: 0,
    demShare: 0,
    gopShare: 0,
    margin: 0,
  }));

  for (let i = 0; i < dataset.units.length; i++) {
    const unit = dataset.units[i];
    const countyResult = election.counties[unit.countyGeoid];
    const population = countyPopulation.get(unit.countyGeoid) ?? 0;
    if (!countyResult || population <= 0) continue;
    const weight = unit.population / population;
    const district = assignment[i];
    scores[district].votesDem += countyResult.votesDem * weight;
    scores[district].votesGop += countyResult.votesGop * weight;
    scores[district].totalVotes += countyResult.totalVotes * weight;
  }

  for (const score of scores) {
    const twoParty = score.votesDem + score.votesGop;
    score.demShare = twoParty > 0 ? score.votesDem / twoParty : 0;
    score.gopShare = twoParty > 0 ? score.votesGop / twoParty : 0;
    score.margin = score.demShare - score.gopShare;
  }

  return scores;
}

export function districtRealByWeightedCentroid(
  dataset: RealStateDistrictingDataset,
  options: RealDistrictingOptions = {}
): RealDistrictingResult {
  const {
    numDistricts: k = dataset.defaultDistricts,
    seed = 1,
    maxIterations = 30,
    tolerance = 0.08,
  } = options;

  const rand = mulberry32(seed * 2654435761);
  const points = dataset.units.map((unit) => unit.centroid);
  const populations = dataset.units.map((unit) => unit.population);
  let centroids = kmeansPlusPlusInit(points, populations, k, rand);
  let assignment = new Array(dataset.units.length).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    const next = weightedAssign(points, populations, centroids, tolerance);
    const changed = next.some((district, i) => district !== assignment[i]);
    assignment = next;
    centroids = recomputeCentroids(dataset.units, assignment, centroids, k);
    if (!changed) break;
  }

  return {
    algorithm: 'Weighted centroid',
    assignment: assignmentToRecord(dataset.units, assignment),
    centroids,
    numDistricts: k,
    metrics: computeMetrics(dataset, assignment, centroids, k, options.election),
  };
}

export function districtRealByCountyIntegrity(
  dataset: RealStateDistrictingDataset,
  options: RealDistrictingOptions = {}
): RealDistrictingResult {
  const {
    numDistricts: k = dataset.defaultDistricts,
    seed = 1,
    maxIterations = 24,
    tolerance = 0.12,
  } = options;

  const rand = mulberry32(seed * 40503 + 7);
  const totalPopulation = dataset.units.reduce((s, unit) => s + unit.population, 0);
  const ideal = totalPopulation / k;
  const capacity = ideal * (1 + tolerance);
  const countyUnits = new Map<string, number[]>();
  for (let i = 0; i < dataset.units.length; i++) {
    const county = dataset.units[i].countyGeoid;
    if (!countyUnits.has(county)) countyUnits.set(county, []);
    countyUnits.get(county)!.push(i);
  }

  const countyPoints = Array.from(countyUnits.values()).map((idxs) =>
    weightedMean(
      idxs.map((i) => dataset.units[i].centroid),
      idxs.map((i) => dataset.units[i].population)
    )
  );
  const countyWeights = Array.from(countyUnits.values()).map((idxs) =>
    idxs.reduce((s, i) => s + dataset.units[i].population, 0)
  );

  let centroids = kmeansPlusPlusInit(countyPoints, countyWeights, k, rand);
  let assignment = new Array(dataset.units.length).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    const next = new Array(dataset.units.length).fill(-1);
    const counts = new Array(k).fill(0);
    const counties = Array.from(countyUnits.entries())
      .map(([county, idxs]) => {
        const centroid = weightedMean(
          idxs.map((i) => dataset.units[i].centroid),
          idxs.map((i) => dataset.units[i].population)
        );
        return {
          county,
          idxs,
          centroid,
          population: idxs.reduce((s, i) => s + dataset.units[i].population, 0),
        };
      })
      .sort((a, b) => b.population - a.population);
    const countyAssignment = weightedAssign(
      counties.map((county) => county.centroid),
      counties.map((county) => county.population),
      centroids,
      tolerance
    );

    for (let countyIndex = 0; countyIndex < counties.length; countyIndex++) {
      const county = counties[countyIndex];
      const wholeDistrict = countyAssignment[countyIndex];
      if (
        county.population <= capacity &&
        counts[wholeDistrict] + county.population <= capacity
      ) {
        for (const i of county.idxs) next[i] = wholeDistrict;
        counts[wholeDistrict] += county.population;
        continue;
      }

      for (const i of county.idxs) {
        const unit = dataset.units[i];
        const order = nearestOrder(unit.centroid, centroids);
        const district = order.reduce((best, d, rank) => {
          const projected = counts[d] + unit.population;
          const overCapacity =
            Math.max(0, projected - capacity) / Math.max(1, ideal);
          const deficitBefore =
            Math.max(0, ideal * (1 - tolerance) - counts[d]) /
            Math.max(1, ideal);
          const deficitAfter =
            Math.max(0, ideal * (1 - tolerance) - projected) /
            Math.max(1, ideal);
          const rankPenalty = rank / Math.max(1, k - 1);
          const score =
            overCapacity * 10000 +
            deficitAfter * 6 -
            deficitBefore * 8 +
            rankPenalty;
          return score < best.score ? { idx: d, score } : best;
        }, { idx: order[0], score: Infinity }).idx;
        next[i] = district;
        counts[district] += unit.population;
      }
    }

    rebalanceUnderfilledDistricts(
      dataset.units.map((unit) => unit.centroid),
      dataset.units.map((unit) => unit.population),
      centroids,
      next,
      counts,
      tolerance
    );

    const changed = next.some((district, i) => district !== assignment[i]);
    assignment = next;
    centroids = recomputeCentroids(dataset.units, assignment, centroids, k);
    if (!changed) break;
  }

  return {
    algorithm: 'County integrity',
    assignment: assignmentToRecord(dataset.units, assignment),
    centroids,
    numDistricts: k,
    metrics: computeMetrics(dataset, assignment, centroids, k, options.election),
  };
}

export function districtRealByRegionGrow(
  dataset: RealStateDistrictingDataset,
  options: RealDistrictingOptions = {}
): RealDistrictingResult {
  const {
    numDistricts: k = dataset.defaultDistricts,
    seed = 1,
    tolerance = 0.1,
  } = options;

  const rand = mulberry32(seed * 97531 + 11);
  const points = dataset.units.map((unit) => unit.centroid);
  const populations = dataset.units.map((unit) => unit.population);
  const seeds = kmeansPlusPlusInit(points, populations, k, rand);
  const seedIndexes = seeds.map((seedPoint) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = dist(seedPoint, points[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  });

  const totalPopulation = populations.reduce((s, p) => s + p, 0);
  const ideal = totalPopulation / k;
  const capacity = ideal * (1 + tolerance);
  const assignment = new Array(dataset.units.length).fill(-1);
  const counts = new Array(k).fill(0);
  const unitIndex = new Map(dataset.units.map((unit, i) => [unit.geoid, i]));
  const frontiers: number[][] = Array.from({ length: k }, () => []);

  for (let d = 0; d < k; d++) {
    const seedIdx = seedIndexes[d];
    if (assignment[seedIdx] >= 0) continue;
    assignment[seedIdx] = d;
    counts[d] += dataset.units[seedIdx].population;
    frontiers[d].push(seedIdx);
  }

  let remaining = assignment.filter((district) => district < 0).length;
  while (remaining > 0) {
    let madeProgress = false;
    for (let d = 0; d < k; d++) {
      if (counts[d] >= capacity) continue;
      const candidates = new Set<number>();
      for (const idx of frontiers[d]) {
        for (const neighbor of dataset.units[idx].neighbors) {
          const neighborIdx = unitIndex.get(neighbor);
          if (neighborIdx === undefined || assignment[neighborIdx] >= 0) continue;
          candidates.add(neighborIdx);
        }
      }
      if (candidates.size === 0) continue;
      let best = -1;
      let bestD = Infinity;
      for (const idx of candidates) {
        const dToCentroid = dist(dataset.units[idx].centroid, seeds[d]);
        if (dToCentroid < bestD) {
          bestD = dToCentroid;
          best = idx;
        }
      }
      if (best < 0) continue;
      assignment[best] = d;
      counts[d] += dataset.units[best].population;
      frontiers[d].push(best);
      remaining--;
      madeProgress = true;
    }
    if (!madeProgress) break;
  }

  if (remaining > 0) {
    for (let i = 0; i < dataset.units.length; i++) {
      if (assignment[i] >= 0) continue;
      const order = nearestOrder(dataset.units[i].centroid, seeds);
      const district = order.reduce(
        (best, d) => (counts[d] < counts[best] ? d : best),
        order[0]
      );
      assignment[i] = district;
      counts[district] += dataset.units[i].population;
    }
  }

  const centroids = recomputeCentroids(dataset.units, assignment, seeds, k);
  return {
    algorithm: 'Region growing',
    assignment: assignmentToRecord(dataset.units, assignment),
    centroids,
    numDistricts: k,
    metrics: computeMetrics(dataset, assignment, centroids, k, options.election),
  };
}
