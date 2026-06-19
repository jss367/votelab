# Precomputed best-map districting — design

Date: 2026-06-19

## Background

The real-district-maps visualization (`apps/visualizations`) computed district
assignments **live in the browser** every time a user selected a state or
clicked "Reseed". The districting algorithms run graph-repair passes that are
O(units) per move and O(units) moves — effectively O(units²) — so common
default states (Georgia seed 1 ≈ 18s, New Jersey seed 1 ≈ 12s, Illinois
seed 1 ≈ 24s) froze the browser tab for tens of seconds.

PR #39 tried to bound this synchronously through a ladder of per-fixture move
caps (`120/240/3250`) and a stack of selector thresholds
(`overflowFallbackThreshold`, `severeAdjacentOverflow`,
`catastrophicAdjacentOverflow`, a fixed `0.05` contiguity penalty). Each fix
spawned the next P1 review thread because a move-count cap is a broken proxy
for wall-clock time, and because the population-vs-contiguity tradeoff is a
genuine policy question that no threshold can resolve. The PR merged with two
P1 threads still open:

1. Small-fixture runtime still freezes the UI.
2. The selector can publish a 30%+ malapportioned map (Georgia s2, NJ s2)
   because it weights contiguity against balance with an ad-hoc penalty.

## Decision

Flip the architecture: **compute the best map for each state offline, commit
the results to the repo, and ship a render-only site.** The input data
(census tracts) is static and the algorithms are deterministic (seeded), so
there is no reason to recompute in the browser. Offline we have unlimited time
and can keep searching for a genuinely valid map instead of picking the
least-bad of two flawed completions.

Scope: **one best map per state** at its real congressional district count
(option A). No reseed, no district-count slider.

## Revision (during implementation): use ReCom, not region growing

Empirically the existing region-grow algorithm could not produce maps that are
simultaneously contiguous and population-balanced for medium/large states —
across 20 seeds it found **zero** valid plans for Illinois, Texas, New York,
Florida, Pennsylvania, or California (e.g. fully contiguous Texas at 35%
deviation, fully balanced California at 51/52 contiguous). The bottleneck was
the algorithm, not the architecture.

We therefore generate maps with **ReCom (recombination)** — the standard modern
redistricting method (MGGG / GerryChain) — which keeps districts contiguous by
construction and splits district pairs along balanced spanning-tree edges. ReCom
produces a fully contiguous, sub-6%-deviation plan for **all 50 states** in well
under a second per run. Region growing is removed from the codebase; the offline
generator uses ReCom exclusively. See `lib/recom.ts`.

## Definition of "best"

Generate many candidates per state (all three algorithms × many seeds) and
rank lexicographically:

1. **Valid** — fully contiguous (`contiguousDistricts === k`) **and** within
   population tolerance (`maxDeviationFraction ≤ 0.10`). Valid candidates beat
   any invalid candidate.
2. Among valid candidates, **lowest `maxDeviationFraction`**.
3. Tie-break on compactness / county integrity
   (`avgWeightedDistance`, then `countySplitFraction`).

If no candidate clears the validity bar for a state, emit the best-ranked
invalid candidate with `valid: false` so the site labels it honestly rather
than presenting a bad map as a real plan.

## Components

### 1. ReCom algorithm — `apps/visualizations/lib/recom.ts`

- `districtByRecom(dataset, options)`:
  1. Build the dual graph from each unit's neighbors; bridge disconnected
     components (islands/offshore tracts) with nearest-unit edges so a spanning
     tree can span the whole state.
  2. Seed with recursive spanning-tree bisection → `k` contiguous districts.
  3. Run ReCom steps: pick an adjacent district pair, draw a spanning tree of
     their union, cut it at a balanced edge so both halves land within
     tolerance. Track the best (lowest max-deviation) plan seen.
- Returns a `RealDistrictingResult` (via `buildRealDistrictingResult`) plus the
  bridge count.

### 2. Offline generator — `apps/visualizations/scripts/build-district-maps.ts`

- For each state in `DISTRICTING_STATES`, at the authoritative
  `state.defaultDistricts` (not the dataset's viz floor), run ReCom across
  several seeds and pick the best by `selectBestDistricting`.
- Run via `npm --workspace apps/visualizations run build:maps` (tsx). Sub-second
  per run; prints per-state progress (seed, contiguity, deviation, valid?).
- Output: one file per state under
  `apps/visualizations/public/data/districting/results/<state-id>.json`:
  `{ stateId, stateName, algorithm, seed, numDistricts, valid, bridges,
  metrics, centroids, assignment }`.
- Results are **committed to the repo** so deploy stays pure-static.

### 3. Shared library — `apps/visualizations/lib/realDistricting.ts`

- Add `valid: boolean` to `RealDistrictingMetrics`
  (`contiguousDistricts === k && maxDeviationFraction <= VALIDITY_TOLERANCE`,
  a fixed 10% bar).
- Add `compareDistrictingMetrics` (contiguity-first lexicographic ordering) and
  `selectBestDistricting`, shared by the generator and tests.
- Add `buildRealDistrictingResult` so ReCom and the in-repo algorithms produce
  identical metrics.
- **Remove region growing entirely** (`districtRealByRegionGrow` and its
  repair/connectivity helpers, and the selector ladder + per-fixture move-cap
  tangle that caused the original review churn). It was reachable only from
  tests and is fully superseded by ReCom. The lightweight weighted-centroid and
  county-integrity algorithms remain (used by the partisan/metrics tests).

### 4. Website — `apps/visualizations/app/components/DistrictingViz.tsx`

- Render-only: on state select, fetch
  `data/districting/results/<state>.json` and draw it. No `districtRealBy*`
  calls, no `setTimeout`, no main-thread compute.
- **Remove** the Reseed button and the Districts slider.
- Add a **validity badge** ("Valid plan" / "Invalid — exceeds tolerance" /
  "Invalid — non-contiguous"). Freeze is gone by construction.

## Testing

- Keep the existing fixture regressions in `realDistricting.test.ts` — they
  still validate the algorithm the generator depends on. Update the few tests
  that asserted the deleted synchronous selector/cap behavior to assert the new
  `selectBest` ranking and the `valid` flag instead.
- Add a unit test for `selectBest`/`rankCandidates`.
- Add a smoke test that the generator produces a result for a small fixture and
  the validity flag is computed correctly.
- Run `npm --workspace apps/visualizations test` and
  `npm --workspace apps/visualizations run build`.

## Out of scope (deliberately)

- Web Worker / synchronous time budget — unnecessary once compute is offline.
- Reseed / district-count interactivity — dropped with option A; could return
  later as a precomputed gallery (option B/C) if desired.
- Tightening the validity bar below 10% — current tests use 10%; can revisit.
