// apps/visualizations/lib/districting.ts
//
// Algorithms for drawing voting districts from a population of voters.
//
// The goal of this module is to illustrate *neutral*, rules-based districting
// as a counterpoint to gerrymandering. Two algorithms are provided:
//
//   1. districtByCentroid  - partition voters into equal-population districts
//                            that minimize the average distance between each
//                            voter and their district's centroid (a balanced /
//                            capacitated k-means). This produces compact
//                            districts but ignores existing political
//                            boundaries.
//
//   2. districtByCounty    - the same compactness objective, but counties are
//                            kept whole wherever it is reasonable to do so.
//                            Counties are only split when population balance
//                            cannot otherwise be achieved.
//
// Everything is deterministic given a seed so the maps are stable between
// renders.

export interface Pt {
  x: number;
  y: number;
}

export interface DistrictVoter {
  x: number; // 0..1
  y: number; // 0..1
  county: number; // index into MapData.counties
}

export interface CountyRegion {
  id: number;
  col: number;
  row: number;
  // bounding box in unit-square coordinates, used for drawing boundaries
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MapData {
  voters: DistrictVoter[];
  counties: CountyRegion[];
  cols: number;
  rows: number;
}

export interface DistrictingResult {
  assignment: number[]; // district index for each voter
  centroids: Pt[];
  numDistricts: number;
  avgDistance: number; // mean distance from a voter to its district centroid
  populations: number[]; // voter count per district
  splitCounties: number; // counties whose voters span more than one district
  countySplitFraction: number; // splitCounties / number of populated counties
}

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

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

function gaussian(rand: () => number): number {
  // Box-Muller transform
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(0.999999, x));
}

function dist(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------------------
// Population / county generation
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  numVoters?: number;
  cols?: number; // number of county columns
  rows?: number; // number of county rows
  numClusters?: number; // population centers ("cities")
  seed?: number;
}

/**
 * Build a synthetic state: a grid of rectangular counties overlaid on a
 * population that is concentrated in a handful of "cities" plus a uniform
 * rural background. Uneven population is what makes districting interesting.
 */
export function generateMapData(opts: GenerateOptions = {}): MapData {
  const {
    numVoters = 2000,
    cols = 4,
    rows = 4,
    numClusters = 5,
    seed = 1,
  } = opts;

  const rand = mulberry32(seed);

  const counties: CountyRegion[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      counties.push({
        id: r * cols + c,
        col: c,
        row: r,
        x0: c / cols,
        y0: r / rows,
        x1: (c + 1) / cols,
        y1: (r + 1) / rows,
      });
    }
  }

  // City centers with varying weight, so some areas are dense and some sparse.
  const clusters: { x: number; y: number; weight: number; spread: number }[] =
    [];
  for (let i = 0; i < numClusters; i++) {
    clusters.push({
      x: 0.1 + rand() * 0.8,
      y: 0.1 + rand() * 0.8,
      weight: 0.4 + rand() * 1.6,
      spread: 0.04 + rand() * 0.08,
    });
  }
  const totalWeight = clusters.reduce((s, c) => s + c.weight, 0);

  const voters: DistrictVoter[] = [];
  const backgroundFraction = 0.25; // share of voters spread uniformly

  for (let i = 0; i < numVoters; i++) {
    let x: number;
    let y: number;
    if (rand() < backgroundFraction) {
      x = clamp01(rand());
      y = clamp01(rand());
    } else {
      // pick a city weighted by population
      let pick = rand() * totalWeight;
      let cluster = clusters[0];
      for (const c of clusters) {
        pick -= c.weight;
        if (pick <= 0) {
          cluster = c;
          break;
        }
      }
      x = clamp01(cluster.x + gaussian(rand) * cluster.spread);
      y = clamp01(cluster.y + gaussian(rand) * cluster.spread);
    }
    const col = Math.min(cols - 1, Math.floor(x * cols));
    const row = Math.min(rows - 1, Math.floor(y * rows));
    voters.push({ x, y, county: row * cols + col });
  }

  return { voters, counties, cols, rows };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function kmeansPlusPlusInit(
  points: Pt[],
  weights: number[],
  k: number,
  rand: () => number
): Pt[] {
  const centroids: Pt[] = [];
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  // first centroid: weighted random
  let pick = rand() * totalWeight;
  let firstIdx = 0;
  for (let i = 0; i < points.length; i++) {
    pick -= weights[i];
    if (pick <= 0) {
      firstIdx = i;
      break;
    }
  }
  centroids.push({ ...points[firstIdx] });

  while (centroids.length < k) {
    // distance^2 to nearest existing centroid, weighted
    const d2: number[] = points.map((p, i) => {
      let best = Infinity;
      for (const c of centroids) {
        const dd = dist(p, c);
        if (dd * dd < best) best = dd * dd;
      }
      return best * weights[i];
    });
    const sum = d2.reduce((s, v) => s + v, 0);
    if (sum <= 0) {
      // all remaining points coincide with centroids; just duplicate one
      centroids.push({ ...points[Math.floor(rand() * points.length)] });
      continue;
    }
    let r = rand() * sum;
    let chosen = 0;
    for (let i = 0; i < points.length; i++) {
      r -= d2[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push({ ...points[chosen] });
  }
  return centroids;
}

function computeStats(
  map: MapData,
  assignment: number[],
  centroids: Pt[],
  k: number
): Omit<DistrictingResult, 'assignment' | 'centroids' | 'numDistricts'> {
  const populations = new Array(k).fill(0);
  let totalDist = 0;
  for (let i = 0; i < map.voters.length; i++) {
    const d = assignment[i];
    populations[d]++;
    totalDist += dist(map.voters[i], centroids[d]);
  }
  const avgDistance = totalDist / Math.max(1, map.voters.length);

  // count counties whose voters land in more than one district
  const countyDistricts = new Map<number, Set<number>>();
  const populatedCounties = new Set<number>();
  for (let i = 0; i < map.voters.length; i++) {
    const cty = map.voters[i].county;
    populatedCounties.add(cty);
    if (!countyDistricts.has(cty)) countyDistricts.set(cty, new Set());
    countyDistricts.get(cty)!.add(assignment[i]);
  }
  let splitCounties = 0;
  countyDistricts.forEach((set) => {
    if (set.size > 1) splitCounties++;
  });

  return {
    avgDistance,
    populations,
    splitCounties,
    countySplitFraction: splitCounties / Math.max(1, populatedCounties.size),
  };
}

function meanPoint(points: Pt[]): Pt {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * Split `n` voters into `k` integer district quotas that sum to `n` and are
 * each within one voter of the ideal size `n / k`. Districts are given either
 * `floor(n / k)` or `ceil(n / k)` so the spread is at most a single voter —
 * well inside any realistic population tolerance. This is the equal-population
 * target every assignment pass is held to, replacing the previous upper-cap-
 * only constraint that let some districts fall far below the ideal.
 */
function equalPopulationQuotas(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  const remainder = n - base * k;
  const quotas = new Array(k).fill(base);
  for (let d = 0; d < remainder; d++) quotas[d] += 1;
  return quotas;
}

export interface DistrictingOptions {
  numDistricts?: number;
  seed?: number;
  maxIterations?: number;
  tolerance?: number; // allowed overshoot of ideal district size (0.05 = 5%)
}

// ---------------------------------------------------------------------------
// Algorithm 1: balanced centroid k-means
// ---------------------------------------------------------------------------

/**
 * Partition voters into `numDistricts` equal-population districts while
 * minimizing the average voter-to-centroid distance. Population balance is
 * enforced with a capacitated assignment: voters are processed in order of how
 * strongly they prefer their nearest district, and each district is held to an
 * exact equal-population quota (every district lands within one voter of the
 * ideal size, well inside `tolerance`).
 */
export function districtByCentroid(
  map: MapData,
  options: DistrictingOptions = {}
): DistrictingResult {
  const {
    numDistricts: k = 4,
    seed = 1,
    maxIterations = 40,
  } = options;

  const rand = mulberry32(seed * 2654435761);
  const n = map.voters.length;
  const points: Pt[] = map.voters;
  const quotas = equalPopulationQuotas(n, k);

  let centroids = kmeansPlusPlusInit(
    points,
    new Array(n).fill(1),
    k,
    rand
  );

  let assignment = new Array(n).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    const next = balancedAssign(points, centroids, k, quotas);

    // recompute centroids
    const buckets: Pt[][] = Array.from({ length: k }, () => []);
    for (let i = 0; i < n; i++) buckets[next[i]].push(points[i]);
    const newCentroids = buckets.map((b, idx) =>
      b.length ? meanPoint(b) : centroids[idx]
    );

    const changed = next.some((d, i) => d !== assignment[i]);
    assignment = next;
    centroids = newCentroids;
    if (!changed) break;
  }

  return {
    assignment,
    centroids,
    numDistricts: k,
    ...computeStats(map, assignment, centroids, k),
  };
}

/**
 * Capacitated nearest-centroid assignment. Voters are sorted by "regret" (the
 * gap between their nearest and second-nearest district) so that voters with a
 * strong preference are placed first; each voter then takes the closest
 * district that still has remaining quota.
 *
 * Each district is capped at its exact equal-population quota, and the quotas
 * sum to the voter count, so every district fills to exactly its quota. That
 * enforces both an upper *and* a lower bound on population: no district can
 * absorb leftover voters past its share, and none can be starved below it.
 */
function balancedAssign(
  points: Pt[],
  centroids: Pt[],
  k: number,
  quotas: number[]
): number[] {
  const n = points.length;

  const order: { i: number; regret: number; order: number[] }[] = [];
  for (let i = 0; i < n; i++) {
    const ds = centroids.map((c, idx) => ({ idx, d: dist(points[i], c) }));
    ds.sort((a, b) => a.d - b.d);
    order.push({
      i,
      regret: (ds[1]?.d ?? ds[0].d) - ds[0].d,
      order: ds.map((o) => o.idx),
    });
  }
  order.sort((a, b) => b.regret - a.regret);

  const counts = new Array(k).fill(0);
  const assignment = new Array(n).fill(-1);

  for (const entry of order) {
    let placed = false;
    for (const d of entry.order) {
      if (counts[d] < quotas[d]) {
        assignment[entry.i] = d;
        counts[d]++;
        placed = true;
        break;
      }
    }
    if (!placed) {
      // every preferred district is at quota: fall back to the district with
      // the most remaining room (only reachable through floating-point ties).
      let bestIdx = 0;
      let bestRoom = -Infinity;
      for (let d = 0; d < k; d++) {
        const room = quotas[d] - counts[d];
        if (room > bestRoom) {
          bestRoom = room;
          bestIdx = d;
        }
      }
      assignment[entry.i] = bestIdx;
      counts[bestIdx]++;
    }
  }
  return assignment;
}

/**
 * Move voters from over-target districts into any district below `floor`,
 * mutating `assignment` and `counts` in place. For each under-floor district we
 * repeatedly steal the single voter that is cheapest to move — the one closest
 * to the under-floor district's centroid among all voters currently sitting in
 * a district that is still above the ideal size — until the floor is reached.
 * This is what gives the county path a genuine lower population bound instead
 * of only an upper cap.
 */
function rebalanceToFloor(
  voters: Pt[],
  centroids: Pt[],
  assignment: number[],
  counts: number[],
  k: number,
  floor: number
): void {
  const n = voters.length;
  const ideal = n / k;

  for (let d = 0; d < k; d++) {
    while (counts[d] < floor) {
      // candidate donors: districts currently above the ideal size
      let bestVoter = -1;
      let bestCost = Infinity;
      for (let i = 0; i < n; i++) {
        const from = assignment[i];
        if (from === d) continue;
        if (counts[from] <= ideal) continue; // don't starve a donor below ideal
        const c = centroids[d];
        const dx = voters[i].x - c.x;
        const dy = voters[i].y - c.y;
        const cost = dx * dx + dy * dy;
        if (cost < bestCost) {
          bestCost = cost;
          bestVoter = i;
        }
      }
      if (bestVoter < 0) break; // no donor above ideal; nothing left to take
      counts[assignment[bestVoter]]--;
      assignment[bestVoter] = d;
      counts[d]++;
    }
  }
}

// ---------------------------------------------------------------------------
// Algorithm 2: county-preserving districting
// ---------------------------------------------------------------------------

/**
 * Same compactness objective as `districtByCentroid`, but counties are kept
 * intact wherever reasonable. Whole counties are assigned to districts first;
 * a county is only split when assigning it whole would push a district beyond
 * its population tolerance, in which case just enough of its (nearest) voters
 * are moved to balance. After the greedy pass a rebalancing step moves the
 * cheapest voters from over-quota districts into any district still below its
 * equal-population quota, so every district lands within the tolerance band
 * (not just under the upper cap).
 */
export function districtByCounty(
  map: MapData,
  options: DistrictingOptions = {}
): DistrictingResult {
  const {
    numDistricts: k = 4,
    seed = 1,
    maxIterations = 30,
    tolerance = 0.08,
  } = options;

  const rand = mulberry32(seed * 40503 + 7);
  const n = map.voters.length;
  const capacity = Math.ceil((n / k) * (1 + tolerance));
  // Lower bound a district may not fall below. Splitting counties is costly, so
  // the county path keeps a wider tolerance band than the compactness path; the
  // floor still guarantees no district is starved well below the ideal size.
  const floor = Math.floor((n / k) * (1 - tolerance));

  // group voters by county
  const countyVoters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const cty = map.voters[i].county;
    if (!countyVoters.has(cty)) countyVoters.set(cty, []);
    countyVoters.get(cty)!.push(i);
  }
  const countyIds = Array.from(countyVoters.keys());
  const countyCentroid = new Map<number, Pt>();
  const countyPop = new Map<number, number>();
  countyVoters.forEach((idxs, cty) => {
    countyCentroid.set(
      cty,
      meanPoint(idxs.map((i) => map.voters[i]))
    );
    countyPop.set(cty, idxs.length);
  });

  // seed district centroids from county centroids, weighted by population
  let centroids = kmeansPlusPlusInit(
    countyIds.map((c) => countyCentroid.get(c)!),
    countyIds.map((c) => countyPop.get(c)!),
    k,
    rand
  );

  let assignment = new Array(n).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    const next = new Array(n).fill(-1);
    const counts = new Array(k).fill(0);

    // assign whole counties first, hardest-to-place (highest regret) first
    const ranked = countyIds
      .map((cty) => {
        const cc = countyCentroid.get(cty)!;
        const ds = centroids
          .map((c, idx) => ({ idx, d: dist(cc, c) }))
          .sort((a, b) => a.d - b.d);
        return {
          cty,
          order: ds.map((o) => o.idx),
          regret: (ds[1]?.d ?? ds[0].d) - ds[0].d,
        };
      })
      .sort((a, b) => b.regret - a.regret);

    for (const { cty, order } of ranked) {
      const idxs = countyVoters.get(cty)!;
      const pop = idxs.length;

      // try to keep the county whole in its most-preferred district with room
      let wholeDistrict = -1;
      for (const d of order) {
        if (counts[d] + pop <= capacity) {
          wholeDistrict = d;
          break;
        }
      }

      if (wholeDistrict >= 0) {
        for (const i of idxs) next[i] = wholeDistrict;
        counts[wholeDistrict] += pop;
      } else {
        // must split: assign each voter to its nearest district that still has
        // room (this only happens when no single district can absorb the whole
        // county without exceeding tolerance)
        for (const i of idxs) {
          const ds = centroids
            .map((c, idx) => ({ idx, d: dist(map.voters[i], c) }))
            .sort((a, b) => a.d - b.d);
          let placed = false;
          for (const o of ds) {
            if (counts[o.idx] < capacity) {
              next[i] = o.idx;
              counts[o.idx]++;
              placed = true;
              break;
            }
          }
          if (!placed) {
            let minIdx = 0;
            for (let d = 1; d < k; d++)
              if (counts[d] < counts[minIdx]) minIdx = d;
            next[i] = minIdx;
            counts[minIdx]++;
          }
        }
      }
    }

    // Rebalance: any district left below its floor pulls in the voters that
    // are cheapest to move (closest to the under-floor centroid) out of
    // districts that are above the ideal size. This splits as few additional
    // counties as the population balance requires while guaranteeing every
    // district reaches the lower bound.
    rebalanceToFloor(map.voters, centroids, next, counts, k, floor);

    // recompute centroids
    const buckets: Pt[][] = Array.from({ length: k }, () => []);
    for (let i = 0; i < n; i++) buckets[next[i]].push(map.voters[i]);
    const newCentroids = buckets.map((b, idx) =>
      b.length ? meanPoint(b) : centroids[idx]
    );

    const changed = next.some((d, i) => d !== assignment[i]);
    assignment = next;
    centroids = newCentroids;
    if (!changed) break;
  }

  return {
    assignment,
    centroids,
    numDistricts: k,
    ...computeStats(map, assignment, centroids, k),
  };
}

// ---------------------------------------------------------------------------
// District colors
// ---------------------------------------------------------------------------

export const DISTRICT_COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#d97706', // amber
  '#7c3aed', // violet
  '#db2777', // pink
  '#0891b2', // cyan
  '#65a30d', // lime
];
