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
    const district = entry.distances.reduce(
      (best, candidate, rank) => {
        const projected = counts[candidate.idx] + entry.population;
        const overCapacity =
          Math.max(0, projected - capacity) / Math.max(1, ideal);
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
      },
      { idx: entry.distances[0].idx, score: Infinity }
    ).idx;
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

function districtPopulations(
  units: DistrictGeoUnit[],
  assignment: number[],
  k: number
): number[] {
  const populations = new Array(k).fill(0);
  for (let i = 0; i < units.length; i++) {
    populations[assignment[i]] += units[i].population;
  }
  return populations;
}

function districtComponents(
  units: DistrictGeoUnit[],
  assignment: number[],
  district: number,
  unitIndex: Map<string, number>,
  excludedIndex?: number
): number[][] {
  const districtIndexes = units
    .map((unit, i) => ({ unit, i }))
    .filter(({ i }) => assignment[i] === district && i !== excludedIndex);
  if (districtIndexes.length === 0) return [];

  const districtSet = new Set(districtIndexes.map(({ i }) => i));
  const seen = new Set<number>();
  const components: number[][] = [];

  for (const { i } of districtIndexes) {
    if (seen.has(i)) continue;
    const component: number[] = [];
    const queue = [i];
    seen.add(i);
    while (queue.length) {
      const idx = queue.shift()!;
      component.push(idx);
      for (const neighbor of units[idx].neighbors) {
        const neighborIdx = unitIndex.get(neighbor);
        if (
          neighborIdx === undefined ||
          !districtSet.has(neighborIdx) ||
          seen.has(neighborIdx)
        ) {
          continue;
        }
        seen.add(neighborIdx);
        queue.push(neighborIdx);
      }
    }
    components.push(component);
  }

  return components;
}

function isDistrictConnectedAfterRemoving(
  units: DistrictGeoUnit[],
  assignment: number[],
  district: number,
  removedIndex: number,
  unitIndex: Map<string, number>
): boolean {
  return (
    districtComponents(units, assignment, district, unitIndex, removedIndex)
      .length <= 1
  );
}

// When removing a single "bridge" unit from its donor district would split the
// donor into multiple components, the bridge plus every component except the
// largest can be relocated as one group: the donor keeps its largest remaining
// component (so it stays contiguous) and the cut-off leaves/components travel
// with the bridge they hang off of. Returns null when removing the bridge does
// not actually disconnect the donor (the single-unit move already suffices).
function bridgeMoveGroup(
  units: DistrictGeoUnit[],
  assignment: number[],
  bridgeIndex: number,
  unitIndex: Map<string, number>
): number[] | null {
  const donor = assignment[bridgeIndex];
  const components = districtComponents(
    units,
    assignment,
    donor,
    unitIndex,
    bridgeIndex
  );
  if (components.length <= 1) return null;
  components.sort(
    (a, b) =>
      b.reduce((s, i) => s + units[i].population, 0) -
      a.reduce((s, i) => s + units[i].population, 0)
  );
  // Keep the largest component with the donor; move the bridge plus the rest.
  const group = [bridgeIndex];
  for (const component of components.slice(1)) group.push(...component);
  return group;
}

function repairDisconnectedRegionComponents(
  units: DistrictGeoUnit[],
  assignment: number[],
  k: number,
  tolerance: number
) {
  const totalPopulation = units.reduce((s, unit) => s + unit.population, 0);
  const ideal = totalPopulation / k;
  const lowerBound = ideal * (1 - tolerance);
  const capacity = ideal * (1 + tolerance);
  const unitIndex = new Map(units.map((unit, i) => [unit.geoid, i]));
  const counts = districtPopulations(units, assignment, k);

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let district = 0; district < k; district++) {
      const components = districtComponents(
        units,
        assignment,
        district,
        unitIndex
      );
      if (components.length <= 1) continue;

      components.sort(
        (a, b) =>
          b.reduce((s, i) => s + units[i].population, 0) -
          a.reduce((s, i) => s + units[i].population, 0)
      );

      for (const component of components.slice(1)) {
        const componentSet = new Set(component);
        const componentPopulation = component.reduce(
          (s, i) => s + units[i].population,
          0
        );
        if (counts[district] - componentPopulation < lowerBound) continue;

        const adjacentDistricts = new Set<number>();
        for (const idx of component) {
          for (const neighbor of units[idx].neighbors) {
            const neighborIdx = unitIndex.get(neighbor);
            if (neighborIdx === undefined || componentSet.has(neighborIdx)) {
              continue;
            }
            const neighborDistrict = assignment[neighborIdx];
            if (neighborDistrict !== district)
              adjacentDistricts.add(neighborDistrict);
          }
        }

        let target = -1;
        let bestPopulation = Infinity;
        for (const candidate of adjacentDistricts) {
          const projected = counts[candidate] + componentPopulation;
          if (projected > capacity) continue;
          if (counts[candidate] < bestPopulation) {
            bestPopulation = counts[candidate];
            target = candidate;
          }
        }
        if (target < 0) continue;

        for (const idx of component) assignment[idx] = target;
        counts[district] -= componentPopulation;
        counts[target] += componentPopulation;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

function rebalanceRegionGrowLowerBound(
  units: DistrictGeoUnit[],
  assignment: number[],
  centroids: GeoPoint[],
  k: number,
  tolerance: number
) {
  const totalPopulation = units.reduce((s, unit) => s + unit.population, 0);
  const ideal = totalPopulation / k;
  const lowerBound = ideal * (1 - tolerance);
  const capacity = ideal * (1 + tolerance);
  const counts = districtPopulations(units, assignment, k);
  const unitIndex = new Map(units.map((unit, i) => [unit.geoid, i]));
  const largeFixture = units.length > 5000;
  const mediumFixture = units.length >= 3000;
  // The loop already terminates on lack of progress (it `break`s as soon as an
  // iteration finds no qualifying single-unit or bridge move). `maxMoves` is a
  // backstop against a pathological non-converging case hanging the browser, so
  // it must scale with the problem size rather than sit at an arbitrary flat
  // cap: a starved district can legitimately need O(units) boundary moves to
  // refill (the Arizona seed-2 case converged in ~1820 moves but a flat 1400
  // cap cut it off at deviation ≈ 0.345 with valid moves still pending). Keep
  // the non-large caps finite because each move runs an O(units) connectivity
  // check synchronously from the visualization. Medium fixtures are large enough
  // for thousands of moves to freeze the UI, while smaller fixtures get only the
  // extra budget needed by the Georgia seed-1 regression.
  const maxMoves = largeFixture
    ? Math.min(units.length * k, 120)
    : Math.min(units.length * k, mediumFixture ? 240 : 3250);
  const shortlistSize = largeFixture ? 12 : 48;

  for (let move = 0; move < maxMoves; move++) {
    const candidates: Array<{
      unitIndex: number;
      fromDistrict: number;
      toDistrict: number;
      score: number;
    }> = [];

    for (let targetDistrict = 0; targetDistrict < k; targetDistrict++) {
      if (counts[targetDistrict] >= lowerBound) continue;

      for (let i = 0; i < units.length; i++) {
        const fromDistrict = assignment[i];
        if (fromDistrict === targetDistrict) continue;

        const population = units[i].population;
        if (counts[targetDistrict] + population > capacity) continue;
        if (counts[fromDistrict] - population <= counts[targetDistrict])
          continue;

        const touchesTarget = units[i].neighbors.some((neighbor) => {
          const neighborIdx = unitIndex.get(neighbor);
          return (
            neighborIdx !== undefined &&
            assignment[neighborIdx] === targetDistrict
          );
        });
        if (!touchesTarget) continue;

        const targetAfter = counts[targetDistrict] + population;
        const donorAfter = counts[fromDistrict] - population;
        const beforeBalance =
          Math.pow((counts[targetDistrict] - ideal) / Math.max(1, ideal), 2) +
          Math.pow((counts[fromDistrict] - ideal) / Math.max(1, ideal), 2);
        const afterBalance =
          Math.pow((targetAfter - ideal) / Math.max(1, ideal), 2) +
          Math.pow((donorAfter - ideal) / Math.max(1, ideal), 2);
        if (afterBalance >= beforeBalance) continue;

        const targetDeficit =
          Math.max(0, lowerBound - targetAfter) / Math.max(1, ideal);
        const distancePenalty = dist(
          units[i].centroid,
          centroids[targetDistrict]
        );
        const score =
          targetDeficit * 1000 + afterBalance * 100 + distancePenalty;

        candidates.push({
          unitIndex: i,
          fromDistrict,
          toDistrict: targetDistrict,
          score,
        });
      }
    }

    const shortlist = candidates
      .sort((a, b) => a.score - b.score)
      .slice(0, shortlistSize);

    const bestMove = shortlist.find((candidate) =>
      isDistrictConnectedAfterRemoving(
        units,
        assignment,
        candidate.fromDistrict,
        candidate.unitIndex,
        unitIndex
      )
    );

    if (bestMove) {
      const population = units[bestMove.unitIndex].population;
      assignment[bestMove.unitIndex] = bestMove.toDistrict;
      counts[bestMove.fromDistrict] -= population;
      counts[bestMove.toDistrict] += population;
      continue;
    }

    // No single-unit move keeps the donor connected. The candidates that fail
    // are bridge tracts: moving one alone would orphan a leaf/component. Move
    // the bridge together with the cut-off component(s) so the donor keeps its
    // largest remaining piece and the underfilled target still grows.
    let bridgeMove: { group: number[]; toDistrict: number } | null = null;
    for (const candidate of shortlist) {
      const group = bridgeMoveGroup(
        units,
        assignment,
        candidate.unitIndex,
        unitIndex
      );
      if (!group) continue;
      const groupPopulation = group.reduce(
        (s, idx) => s + units[idx].population,
        0
      );
      if (counts[candidate.toDistrict] + groupPopulation > capacity) continue;
      // Mirror the single-unit donor rule: the donor may dip below its floor
      // as long as it stays above the target it is feeding (later passes can
      // refill the donor from overfilled neighbors). This lets a starved
      // district pull a bridge + leaf through an at-floor conduit district.
      if (
        counts[candidate.fromDistrict] - groupPopulation <=
        counts[candidate.toDistrict] + groupPopulation
      )
        continue;
      bridgeMove = { group, toDistrict: candidate.toDistrict };
      break;
    }

    if (!bridgeMove) break;

    const fromDistrict = assignment[bridgeMove.group[0]];
    const groupPopulation = bridgeMove.group.reduce(
      (s, idx) => s + units[idx].population,
      0
    );
    for (const idx of bridgeMove.group) assignment[idx] = bridgeMove.toDistrict;
    counts[fromDistrict] -= groupPopulation;
    counts[bridgeMove.toDistrict] += groupPopulation;
  }

  for (let move = 0; move < maxMoves; move++) {
    const candidates: Array<{
      unitIndex: number;
      fromDistrict: number;
      toDistrict: number;
      score: number;
    }> = [];

    for (let fromDistrict = 0; fromDistrict < k; fromDistrict++) {
      if (counts[fromDistrict] <= capacity) continue;

      for (let i = 0; i < units.length; i++) {
        if (assignment[i] !== fromDistrict) continue;
        const population = units[i].population;
        if (counts[fromDistrict] - population < lowerBound) continue;

        const adjacentDistricts = new Set<number>();
        for (const neighbor of units[i].neighbors) {
          const neighborIdx = unitIndex.get(neighbor);
          if (neighborIdx === undefined) continue;
          const neighborDistrict = assignment[neighborIdx];
          if (neighborDistrict !== fromDistrict) {
            adjacentDistricts.add(neighborDistrict);
          }
        }

        for (const toDistrict of adjacentDistricts) {
          if (counts[toDistrict] + population > capacity) continue;

          const fromAfter = counts[fromDistrict] - population;
          const toAfter = counts[toDistrict] + population;
          const beforeBalance =
            Math.pow((counts[fromDistrict] - ideal) / Math.max(1, ideal), 2) +
            Math.pow((counts[toDistrict] - ideal) / Math.max(1, ideal), 2);
          const afterBalance =
            Math.pow((fromAfter - ideal) / Math.max(1, ideal), 2) +
            Math.pow((toAfter - ideal) / Math.max(1, ideal), 2);
          if (afterBalance >= beforeBalance) continue;

          const score =
            (Math.max(0, fromAfter - capacity) / Math.max(1, ideal)) * 1000 +
            afterBalance * 100 +
            dist(units[i].centroid, centroids[toDistrict]);
          candidates.push({ unitIndex: i, fromDistrict, toDistrict, score });
        }
      }
    }

    const bestMove = candidates
      .sort((a, b) => a.score - b.score)
      .slice(0, shortlistSize)
      .find((candidate) =>
        isDistrictConnectedAfterRemoving(
          units,
          assignment,
          candidate.fromDistrict,
          candidate.unitIndex,
          unitIndex
        )
      );

    if (!bestMove) break;

    const population = units[bestMove.unitIndex].population;
    assignment[bestMove.unitIndex] = bestMove.toDistrict;
    counts[bestMove.fromDistrict] -= population;
    counts[bestMove.toDistrict] += population;
  }
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
    weightedDistance +=
      unit.population * dist(unit.centroid, centroids[district]);
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
    ...populations.map((population) => Math.abs(population - idealPopulation))
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
): PartisanDistrictScore[] | undefined {
  const countyPopulation = new Map<string, number>();
  let totalPopulation = 0;
  for (const unit of dataset.units) {
    countyPopulation.set(
      unit.countyGeoid,
      (countyPopulation.get(unit.countyGeoid) ?? 0) + unit.population
    );
    totalPopulation += unit.population;
  }

  const scores = Array.from({ length: k }, () => ({
    votesDem: 0,
    votesGop: 0,
    totalVotes: 0,
    demShare: 0,
    gopShare: 0,
    margin: 0,
  }));

  let matchedPopulation = 0;
  for (let i = 0; i < dataset.units.length; i++) {
    const unit = dataset.units[i];
    const countyResult = election.counties[unit.countyGeoid];
    const population = countyPopulation.get(unit.countyGeoid) ?? 0;
    if (!countyResult || population <= 0) continue;
    matchedPopulation += unit.population;
    const weight = unit.population / population;
    const district = assignment[i];
    scores[district].votesDem += countyResult.votesDem * weight;
    scores[district].votesGop += countyResult.votesGop * weight;
    scores[district].totalVotes += countyResult.totalVotes * weight;
  }

  if (matchedPopulation / Math.max(1, totalPopulation) < 0.8) return undefined;
  if (scores.some((score) => score.totalVotes <= 0)) return undefined;

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
    metrics: computeMetrics(
      dataset,
      assignment,
      centroids,
      k,
      options.election
    ),
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
  const totalPopulation = dataset.units.reduce(
    (s, unit) => s + unit.population,
    0
  );
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
        const district = order.reduce(
          (best, d, rank) => {
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
          },
          { idx: order[0], score: Infinity }
        ).idx;
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
    metrics: computeMetrics(
      dataset,
      assignment,
      centroids,
      k,
      options.election
    ),
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
          if (neighborIdx === undefined || assignment[neighborIdx] >= 0)
            continue;
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

  const grownAssignment = assignment.slice();
  const grownCounts = counts.slice();
  const grownRemaining = remaining;

  function finishWithFallback(allowOverflowAdjacentFallback: boolean) {
    const nextAssignment = grownAssignment.slice();
    const nextCounts = grownCounts.slice();
    let nextRemaining = grownRemaining;

    if (nextRemaining > 0) {
      while (nextRemaining > 0) {
        let madeFallbackProgress = false;
        for (let i = 0; i < dataset.units.length; i++) {
          if (nextAssignment[i] >= 0) continue;
          const adjacentDistricts = new Set<number>();
          for (const neighbor of dataset.units[i].neighbors) {
            const neighborIdx = unitIndex.get(neighbor);
            if (neighborIdx === undefined || nextAssignment[neighborIdx] < 0)
              continue;
            adjacentDistricts.add(nextAssignment[neighborIdx]);
          }
          if (!adjacentDistricts.size) continue;

          const population = dataset.units[i].population;
          const choices = allowOverflowAdjacentFallback
            ? Array.from(adjacentDistricts)
            : Array.from(adjacentDistricts).filter(
                (d) => nextCounts[d] + population <= capacity
              );
          if (!choices.length) continue;

          const district = choices.reduce((best, d) => {
            const bestOver = Math.max(
              0,
              nextCounts[best] + population - capacity
            );
            const nextOver = Math.max(0, nextCounts[d] + population - capacity);
            if (nextOver !== bestOver) return nextOver < bestOver ? d : best;
            return nextCounts[d] < nextCounts[best] ? d : best;
          }, choices[0]);
          nextAssignment[i] = district;
          nextCounts[district] += population;
          nextRemaining--;
          madeFallbackProgress = true;
        }
        if (!madeFallbackProgress) break;
      }
    }

    if (nextRemaining > 0) {
      for (let i = 0; i < dataset.units.length; i++) {
        if (nextAssignment[i] >= 0) continue;
        const order = nearestOrder(dataset.units[i].centroid, seeds);
        const district = order.reduce(
          (best, d) => (nextCounts[d] < nextCounts[best] ? d : best),
          order[0]
        );
        nextAssignment[i] = district;
        nextCounts[district] += dataset.units[i].population;
      }
    }

    let nextCentroids = recomputeCentroids(
      dataset.units,
      nextAssignment,
      seeds,
      k
    );
    repairDisconnectedRegionComponents(
      dataset.units,
      nextAssignment,
      k,
      tolerance
    );
    nextCentroids = recomputeCentroids(
      dataset.units,
      nextAssignment,
      nextCentroids,
      k
    );
    rebalanceRegionGrowLowerBound(
      dataset.units,
      nextAssignment,
      nextCentroids,
      k,
      tolerance
    );
    repairDisconnectedRegionComponents(
      dataset.units,
      nextAssignment,
      k,
      tolerance
    );
    nextCentroids = recomputeCentroids(
      dataset.units,
      nextAssignment,
      nextCentroids,
      k
    );
    const metrics = computeMetrics(
      dataset,
      nextAssignment,
      nextCentroids,
      k,
      options.election
    );

    return { assignment: nextAssignment, centroids: nextCentroids, metrics };
  }

  const adjacencyResult = finishWithFallback(true);
  let selected = adjacencyResult;
  const overflowFallbackThreshold = tolerance * 2;
  if (
    adjacencyResult.metrics.maxDeviationFraction > overflowFallbackThreshold
  ) {
    const capacityAwareResult = finishWithFallback(false);
    const contiguityPenalty = 0.05;
    const score = (result: typeof adjacencyResult) =>
      result.metrics.maxDeviationFraction +
      (k - result.metrics.contiguousDistricts) * contiguityPenalty;
    const severeAdjacentOverflow =
      adjacencyResult.metrics.maxDeviationFraction >
        overflowFallbackThreshold &&
      capacityAwareResult.metrics.contiguousDistricts >=
        adjacencyResult.metrics.contiguousDistricts &&
      capacityAwareResult.metrics.maxDeviationFraction <
        adjacencyResult.metrics.maxDeviationFraction * 0.5;
    const catastrophicAdjacentOverflow =
      adjacencyResult.metrics.maxDeviationFraction > 0.5 &&
      capacityAwareResult.metrics.maxDeviationFraction < 0.2;
    if (
      score(capacityAwareResult) < score(adjacencyResult) ||
      severeAdjacentOverflow ||
      catastrophicAdjacentOverflow
    ) {
      selected = capacityAwareResult;
    }
  }

  return {
    algorithm: 'Region growing',
    assignment: assignmentToRecord(dataset.units, selected.assignment),
    centroids: selected.centroids,
    numDistricts: k,
    metrics: selected.metrics,
  };
}
