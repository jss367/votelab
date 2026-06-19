/**
 * ReCom (recombination) districting.
 *
 * Region growing could not produce maps that are simultaneously contiguous and
 * population-balanced for medium/large states. ReCom — the standard modern
 * redistricting method (MGGG / GerryChain) — fixes this by construction: every
 * district it produces is a connected subtree of the dual graph, and every
 * proposal re-splits a pair of districts along a *balanced* edge of a spanning
 * tree, so both halves land within tolerance of the ideal population.
 *
 * Pipeline:
 *   1. Bridge any disconnected dual-graph components (island/offshore tracts)
 *      with nearest-unit edges, so a spanning tree can span the whole state.
 *   2. Seed with recursive spanning-tree bisection -> k contiguous districts.
 *   3. Run ReCom steps: merge an adjacent district pair, draw a spanning tree
 *      of the union, cut it at a balanced edge. Track the best map seen.
 *
 * This is an offline generator algorithm (see scripts/build-district-maps.ts);
 * it is never run in the browser.
 */
import {
  CountyElectionDataset,
  DistrictGeoUnit,
  RealDistrictingResult,
  RealStateDistrictingDataset,
  buildRealDistrictingResult,
  mulberry32,
} from './realDistricting';

export interface RecomOptions {
  numDistricts?: number;
  seed?: number;
  /** Population tolerance for balanced cuts and the validity target. */
  tolerance?: number;
  /** Number of ReCom proposals after seeding. */
  steps?: number;
  election?: CountyElectionDataset;
}

export interface RecomResult {
  result: RealDistrictingResult;
  /** Bridge edges added to connect disconnected dual-graph components. */
  bridges: number;
}

/** Build index-based adjacency from each unit's geoid neighbor list. */
function buildAdjacency(units: DistrictGeoUnit[]): number[][] {
  const index = new Map(units.map((unit, i) => [unit.geoid, i]));
  return units.map((unit) => {
    const list: number[] = [];
    for (const neighbor of unit.neighbors) {
      const j = index.get(neighbor);
      if (j !== undefined && j !== index.get(unit.geoid)) list.push(j);
    }
    return list;
  });
}

/** Connected components of the dual graph, largest first. */
function connectedComponents(adj: number[][]): number[][] {
  const seen = new Uint8Array(adj.length);
  const components: number[][] = [];
  for (let start = 0; start < adj.length; start++) {
    if (seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const component: number[] = [];
    while (stack.length) {
      const node = stack.pop()!;
      component.push(node);
      for (const next of adj[node]) {
        if (!seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length);
  return components;
}

function distance(a: DistrictGeoUnit, b: DistrictGeoUnit): number {
  const dx = a.centroid.x - b.centroid.x;
  const dy = a.centroid.y - b.centroid.y;
  return dx * dx + dy * dy;
}

/**
 * Make the dual graph connected by joining each extra component to the core via
 * the closest pair of units. Mutates `adj` and the units' `neighbors` (so the
 * repair is reflected in contiguity metrics) and returns the bridge count.
 */
function bridgeComponents(
  units: DistrictGeoUnit[],
  adj: number[][]
): number {
  const components = connectedComponents(adj);
  if (components.length <= 1) return 0;

  const core = components[0].slice();
  let bridges = 0;
  for (let c = 1; c < components.length; c++) {
    const component = components[c];
    let bestCore = -1;
    let bestUnit = -1;
    let bestDist = Infinity;
    for (const u of component) {
      for (const v of core) {
        const d = distance(units[u], units[v]);
        if (d < bestDist) {
          bestDist = d;
          bestUnit = u;
          bestCore = v;
        }
      }
    }
    adj[bestUnit].push(bestCore);
    adj[bestCore].push(bestUnit);
    units[bestUnit].neighbors.push(units[bestCore].geoid);
    units[bestCore].neighbors.push(units[bestUnit].geoid);
    bridges++;
    for (const u of component) core.push(u);
  }
  return bridges;
}

interface SpanningTree {
  parent: Int32Array;
  /** Discovery order (root first). */
  order: number[];
}

/** Random spanning tree of the connected node set via randomized DFS. */
function spanningTree(
  nodes: number[],
  inSet: Uint8Array,
  adj: number[][],
  rand: () => number
): SpanningTree {
  const parent = new Int32Array(adj.length).fill(-1);
  const visited = new Uint8Array(adj.length);
  const root = nodes[Math.floor(rand() * nodes.length)];
  const stack = [root];
  visited[root] = 1;
  parent[root] = root;
  const order: number[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    order.push(node);
    // Shuffle neighbors so the tree shape varies by seed.
    const neighbors = adj[node].filter((n) => inSet[n] && !visited[n]);
    for (let i = neighbors.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
    }
    for (const next of neighbors) {
      if (visited[next]) continue;
      visited[next] = 1;
      parent[next] = node;
      stack.push(next);
    }
  }
  return { parent, order };
}

interface Cut {
  /** Nodes on the subtree side of the cut edge. */
  side: number[];
  sidePopulation: number;
}

/**
 * Find the spanning-tree edge whose subtree population is closest to
 * `targetPopulation`, subject to both sides having enough nodes. Returns null
 * only for a degenerate (single-node) set.
 */
function bestCut(
  tree: SpanningTree,
  nodes: number[],
  population: number[],
  totalPopulation: number,
  targetPopulation: number,
  minSideNodes: number,
  minOtherNodes: number
): Cut | null {
  const { parent, order } = tree;
  const subtreePop = new Map<number, number>();
  const subtreeCount = new Map<number, number>();
  for (const node of nodes) {
    subtreePop.set(node, population[node]);
    subtreeCount.set(node, 1);
  }
  // Accumulate child totals into parents (reverse discovery order = leaves up).
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
    const up = parent[node];
    if (up === node) continue;
    subtreePop.set(up, subtreePop.get(up)! + subtreePop.get(node)!);
    subtreeCount.set(up, subtreeCount.get(up)! + subtreeCount.get(node)!);
  }

  let bestNode = -1;
  let bestError = Infinity;
  for (const node of nodes) {
    if (parent[node] === node) continue; // root has no cut edge
    const side = subtreePop.get(node)!;
    const count = subtreeCount.get(node)!;
    if (count < minSideNodes || nodes.length - count < minOtherNodes) continue;
    const error = Math.abs(side - targetPopulation);
    if (error < bestError) {
      bestError = error;
      bestNode = node;
    }
  }
  if (bestNode < 0) return null;

  // Collect the subtree of bestNode via child links.
  const children = new Map<number, number[]>();
  for (const node of nodes) {
    const up = parent[node];
    if (up === node) continue;
    if (!children.has(up)) children.set(up, []);
    children.get(up)!.push(node);
  }
  const side: number[] = [];
  const stack = [bestNode];
  while (stack.length) {
    const node = stack.pop()!;
    side.push(node);
    for (const child of children.get(node) ?? []) stack.push(child);
  }
  void totalPopulation;
  return { side, sidePopulation: subtreePop.get(bestNode)! };
}

/**
 * Recursive spanning-tree bisection into `parts` contiguous districts, writing
 * district ids into `assignment`. Returns the next free district id.
 */
function seedRecursive(
  nodes: number[],
  parts: number,
  startId: number,
  ideal: number,
  population: number[],
  adj: number[][],
  rand: () => number
): number {
  if (parts === 1) {
    for (const node of nodes) assignment[node] = startId;
    return startId + 1;
  }
  // Too few units to bisect into `parts` connected districts (degenerate /
  // pathological graphs). Give each unit its own district; any leftover ids
  // stay empty, which surfaces as an invalid result rather than a crash.
  if (nodes.length <= parts) {
    for (let i = 0; i < nodes.length; i++) assignment[nodes[i]] = startId + i;
    return startId + parts;
  }
  const left = Math.floor(parts / 2);
  const right = parts - left;
  const targetPopulation = ideal * left;
  const total = nodes.reduce((s, node) => s + population[node], 0);

  const inSet = new Uint8Array(adj.length);
  for (const node of nodes) inSet[node] = 1;

  let chosen: Cut | null = null;
  let chosenError = Infinity;
  const attempts = 12;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const tree = spanningTree(nodes, inSet, adj, rand);
    const cut = bestCut(
      tree,
      nodes,
      population,
      total,
      targetPopulation,
      left,
      right
    );
    if (!cut) continue;
    const error = Math.abs(cut.sidePopulation - targetPopulation);
    if (error < chosenError) {
      chosenError = error;
      chosen = cut;
    }
    if (error <= ideal * 0.05) break; // good enough, stop early
  }
  // No balanced cut respected the per-side district counts across all sampled
  // trees (sparse / articulation-heavy graphs). Fall back to any non-trivial
  // edge: with nodes.length > parts >= 2 a spanning tree always has one. This
  // keeps the seed contiguous and non-crashing; ReCom steps fix the balance.
  if (!chosen) {
    const tree = spanningTree(nodes, inSet, adj, rand);
    chosen = bestCut(tree, nodes, population, total, targetPopulation, 1, 1);
  }
  if (!chosen) {
    // Unreachable for nodes.length >= 2, but stay non-crashing regardless.
    for (let i = 0; i < nodes.length; i++) {
      assignment[nodes[i]] = startId + Math.min(i, parts - 1);
    }
    return startId + parts;
  }
  // `assignment` is module-global to keep recursion cheap.
  const sideSet = new Set(chosen.side);
  const leftNodes = chosen.side;
  const rightNodes = nodes.filter((node) => !sideSet.has(node));

  const afterLeft = seedRecursive(
    leftNodes,
    left,
    startId,
    ideal,
    population,
    adj,
    rand
  );
  return seedRecursive(
    rightNodes,
    right,
    afterLeft,
    ideal,
    population,
    adj,
    rand
  );
}

// Module-global assignment buffer used during a single districtByRecom call.
let assignment: Int32Array = new Int32Array(0);

export function districtByRecom(
  dataset: RealStateDistrictingDataset,
  options: RecomOptions = {}
): RecomResult {
  const k = options.numDistricts ?? dataset.defaultDistricts;
  const tolerance = options.tolerance ?? 0.1;
  const steps = options.steps ?? 2000;
  const rand = mulberry32((options.seed ?? 1) * 2246822519 + 7);

  const units = dataset.units;
  const n = units.length;
  const population = units.map((unit) => unit.population);
  const totalPopulation = population.reduce((s, p) => s + p, 0);
  const ideal = totalPopulation / k;
  const lower = ideal * (1 - tolerance);
  const upper = ideal * (1 + tolerance);

  const adj = buildAdjacency(units);
  const bridges = bridgeComponents(units, adj);

  // Seed with recursive bisection.
  assignment = new Int32Array(n).fill(-1);
  const allNodes = Array.from({ length: n }, (_, i) => i);
  seedRecursive(allNodes, k, 0, ideal, population, adj, rand);
  const current = Array.from(assignment);

  const counts = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) counts[current[i]] += population[i];

  const maxDeviation = () => {
    let worst = 0;
    for (let d = 0; d < k; d++) {
      worst = Math.max(worst, Math.abs(counts[d] - ideal));
    }
    return worst / ideal;
  };

  let best = current.slice();
  let bestDeviation = maxDeviation();

  const inUnion = new Uint8Array(n);
  for (let step = 0; step < steps && bestDeviation > tolerance; step++) {
    // Pick a random boundary edge -> an adjacent district pair (a, b).
    const u = Math.floor(rand() * n);
    const a = current[u];
    let b = -1;
    const neighbors = adj[u];
    for (let i = 0; i < neighbors.length; i++) {
      const v = neighbors[(i + Math.floor(rand() * neighbors.length)) % neighbors.length];
      if (current[v] !== a) {
        b = current[v];
        break;
      }
    }
    if (b < 0) continue;

    const union: number[] = [];
    for (let i = 0; i < n; i++) {
      if (current[i] === a || current[i] === b) {
        union.push(i);
        inUnion[i] = 1;
      }
    }
    const unionPopulation = counts[a] + counts[b];
    const tree = spanningTree(union, inUnion, adj, rand);
    // Aim for one district at the ideal; the remainder is the other district.
    const cut = bestCut(tree, union, population, unionPopulation, ideal, 1, 1);

    if (cut) {
      const sidePopulation = cut.sidePopulation;
      const otherPopulation = unionPopulation - sidePopulation;
      // Only accept when both halves land within tolerance.
      if (
        sidePopulation >= lower &&
        sidePopulation <= upper &&
        otherPopulation >= lower &&
        otherPopulation <= upper
      ) {
        const sideSet = new Set(cut.side);
        for (const node of union) current[node] = sideSet.has(node) ? a : b;
        counts[a] = sidePopulation;
        counts[b] = otherPopulation;
        const deviation = maxDeviation();
        if (deviation < bestDeviation) {
          bestDeviation = deviation;
          best = current.slice();
        }
      }
    }

    for (const node of union) inUnion[node] = 0;
  }

  const result = buildRealDistrictingResult(
    dataset,
    best,
    k,
    'ReCom',
    options.election
  );
  return { result, bridges };
}
