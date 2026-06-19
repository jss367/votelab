/**
 * Offline best-map generator.
 *
 * Districting is deterministic given a seed, and the input tract data is
 * static, so we compute the best plan for each state once, here, and commit the
 * results. The website then only loads and renders them — no in-browser
 * districting, no UI freeze. See
 * docs/plans/2026-06-19-precomputed-district-maps-design.md.
 *
 * For each state we search region-grow seeds (the only algorithm that repairs
 * contiguity) for a genuinely valid plan — fully contiguous and within
 * VALIDITY_TOLERANCE — keeping the best candidate seen and stopping early once
 * one is valid. Weighted-centroid and county-integrity runs are included as
 * fallback candidates. Ranking is shared with the app via
 * selectBestDistricting / compareDistrictingMetrics.
 *
 * Run: npm --workspace apps/visualizations run build:maps
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CountyElectionDataset,
  RealDistrictingResult,
  RealStateDistrictingDataset,
  selectBestDistricting,
} from '../lib/realDistricting';
import { districtByRecom } from '../lib/recom';
import { DISTRICTING_STATES } from '../lib/realDistrictingStates';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', 'public', 'data', 'districting');
const RESULTS_DIR = join(DATA_DIR, 'results');
const ELECTION_PATH = join(
  HERE,
  '..',
  'public',
  'data',
  'elections',
  'county-president-2020.json'
);

// ReCom is fast (sub-second per run), so we try several seeds per state and
// keep the best plan. SEEDS is comfortably more than needed for a valid map.
const SEEDS = 12;
const STEPS = 3000;

interface PrecomputedMap {
  stateId: string;
  stateName: string;
  algorithm: string;
  seed: number;
  numDistricts: number;
  valid: boolean;
  bridges: number;
  metrics: RealDistrictingResult['metrics'];
  centroids: RealDistrictingResult['centroids'];
  assignment: Record<string, number>;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function best(state: (typeof DISTRICTING_STATES)[number]): PrecomputedMap {
  const datasetPath = join(DATA_DIR, `${state.id}-tracts.json`);
  const dataset = loadJson<RealStateDistrictingDataset>(datasetPath);
  const election = existsSync(ELECTION_PATH)
    ? loadJson<CountyElectionDataset>(ELECTION_PATH)
    : undefined;

  const candidates: RealDistrictingResult[] = [];
  const seedOf = new Map<RealDistrictingResult, number>();
  let bridges = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const run = districtByRecom(dataset, {
      seed,
      numDistricts: state.defaultDistricts,
      steps: STEPS,
      election,
    });
    bridges = run.bridges || bridges;
    candidates.push(run.result);
    seedOf.set(run.result, seed);
  }

  const chosen = selectBestDistricting(candidates);
  const seed = seedOf.get(chosen) ?? 1;
  const m = chosen.metrics;
  console.log(
    `${state.id.padEnd(15)} k=${String(state.defaultDistricts).padStart(2)} ` +
      `${chosen.algorithm.padEnd(6)} seed=${String(seed).padStart(2)} ` +
      `contig=${m.contiguousDistricts}/${state.defaultDistricts} ` +
      `dev=${m.maxDeviationFraction.toFixed(3)} valid=${m.valid}` +
      (bridges ? ` (${bridges} bridges)` : '') +
      (m.valid ? '' : '  (NO VALID PLAN)')
  );

  return {
    stateId: state.id,
    stateName: state.name,
    algorithm: chosen.algorithm,
    seed,
    numDistricts: state.defaultDistricts,
    valid: chosen.metrics.valid,
    bridges,
    metrics: chosen.metrics,
    centroids: chosen.centroids,
    assignment: chosen.assignment,
  };
}

function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const only = process.argv.slice(2);
  const states = only.length
    ? DISTRICTING_STATES.filter((s) => only.includes(s.id))
    : DISTRICTING_STATES;

  let valid = 0;
  for (const state of states) {
    const result = best(state);
    if (result.valid) valid++;
    writeFileSync(
      join(RESULTS_DIR, `${state.id}.json`),
      `${JSON.stringify(result)}\n`
    );
  }
  console.log(`\n${valid}/${states.length} states produced a valid plan.`);
}

main();
