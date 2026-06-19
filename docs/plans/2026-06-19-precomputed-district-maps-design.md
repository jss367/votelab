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

### 1. Offline generator — `apps/visualizations/scripts/build-district-maps.ts`

- For each state in `DISTRICTING_STATES`, at `defaultDistricts`:
  - Run `districtRealByWeightedCentroid`, `districtRealByCountyIntegrity`,
    `districtRealByRegionGrow` over a seed range.
  - The fast algorithms (centroid, county) sweep the full seed range cheaply.
    Region grow is the slow one; cap its seeds lower and **early-stop** as soon
    as it yields a valid candidate.
  - Pick the overall best by the ranking above.
- Run via `tsx`. No time pressure — it can take minutes. Prints per-state
  progress (chosen algorithm, seed, deviation, contiguity, valid?).
- Output: one file per state under
  `apps/visualizations/public/data/districting/results/<state-id>.json`:
  `{ stateId, algorithm, seed, numDistricts, assignment, metrics, valid }`.
- Results are **committed to the repo** so deploy stays pure-static.

### 2. Algorithm library — `apps/visualizations/lib/realDistricting.ts`

- Add `valid: boolean` to `RealDistrictingMetrics`, computed as
  `contiguousDistricts === k && maxDeviationFraction <= tolerance`. Thread the
  tolerance into `computeMetrics`.
- **Delete** the region-grow selector ladder (`overflowFallbackThreshold`,
  `severeAdjacentOverflow`, `catastrophicAdjacentOverflow`, fixed `0.05`
  penalty) and the per-fixture move-cap tangle (`largeFixture`/`mediumFixture`
  → `120/240/3250`). Offline generation doesn't need a synchronous cap; the
  generator simply ranks candidates. Keep a single generous O(units·k) cap as a
  pure non-hang backstop.
- Extract a small pure `rankCandidates` / `selectBest` helper so the generator
  and tests share one ranking definition.

### 3. Website — `apps/visualizations/app/components/DistrictingViz.tsx`

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
