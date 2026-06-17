# Real U.S. District Maps Scope

Date: 2026-06-16

## Context

The current districting visualization is synthetic. `apps/visualizations/lib/districting.ts`
generates voters inside a unit square, models counties as a rectangular grid, and
assigns individual voters to districts. `apps/visualizations/app/components/DistrictingViz.tsx`
renders those assignments directly to a canvas.

That is useful pedagogically, but it is the wrong model for real U.S. districting.
For real maps, the atomic unit should be a Census geography with a population
weight, geometry, parent county, and graph adjacency. Districting algorithms
should assign those units to districts, not individual synthetic voters.

## Product Target

Build an interactive real-state districting view that lets a user:

1. Select a U.S. state.
2. Choose the geographic resolution, starting with tracts or block groups.
3. Choose the number of districts, with a default based on the state's current
   congressional apportionment.
4. Compare several districting algorithms on the same real population map.
5. Inspect metrics: population deviation, compactness, county splits, contiguity,
   partisan/election score when election data is available, and minority/VAP
   summary when demographic fields are loaded.

This should be framed as exploratory visualization, not legal redistricting
software. Real redistricting needs state-specific rules, legal review, Voting
Rights Act analysis, and better precinct/election data than the first slice will
include.

## Data Sources

Use official Census sources for geometry and population:

- Census TIGER/Line shapefiles for detailed legal boundaries:
  https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html
- Census cartographic boundary files for simplified thematic map display:
  https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html
- Census TIGERweb REST services when a direct GeoJSON fetch is useful:
  https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_restmapservice.html
- Census 2020 P.L. 94-171 redistricting data for block-level population,
  voting-age population, race, Hispanic origin, and group quarters:
  https://www.census.gov/programs-surveys/decennial-census/about/rdo/summary-files.html
- Census API endpoint and variables for 2020 P.L. 94-171:
  https://api.census.gov/data/2020/dec/pl.html
  https://api.census.gov/data/2020/dec/pl/variables.html

Use non-Census election data later, behind a separate import layer:

- MIT Election Data and Science Lab has county, district, state, and precinct
  election datasets:
  https://electionlab.mit.edu/data
- Redistricting Data Hub hosts precinct boundary/election-result products and
  documents the collection/joining complexity:
  https://redistrictingdatahub.org/data/about-our-data/precinct-boundaries-and-election-results/

## Data Model

Introduce a real-map data model alongside the synthetic one:

```ts
export type GeoUnitType = 'tract' | 'blockGroup' | 'block';

export interface DistrictGeoUnit {
  geoid: string;
  name: string;
  type: GeoUnitType;
  countyGeoid: string;
  population: number;
  votingAgePopulation?: number;
  centroid: [number, number];
  neighbors: string[];
  geometryRef: string;
  election?: Record<string, number>;
}

export interface RealStateDistrictingDataset {
  stateFips: string;
  stateName: string;
  projection: 'albersUsa' | 'statePlane' | 'mercator';
  units: DistrictGeoUnit[];
  counties: Array<{ geoid: string; name: string; geometryRef: string }>;
  geometries: GeoJSON.FeatureCollection;
}

export interface DistrictingPlan {
  algorithm: string;
  assignment: Record<string, number>;
  metrics: DistrictingMetrics;
}
```

For the browser, the emitted artifact can be more compact than this TypeScript
shape: TopoJSON or simplified GeoJSON plus a sidecar JSON table keyed by GEOID.

## Build-Time Pipeline

Because `apps/visualizations` uses `output: 'export'`, prefer static generated
datasets over a runtime API.

Add scripts under a new `tools/district-data/` or `scripts/district-data/`
folder:

1. Fetch Census geometry for a state and resolution.
2. Fetch P.L. 94-171 population variables and join by GEOID.
3. Compute projected centroids and area/perimeter metrics.
4. Build unit adjacency. This is required for contiguous districts.
5. Simplify/topologize geometry for browser rendering.
6. Emit `apps/visualizations/public/data/districting/{state}-{resolution}.json`
   or split into `{state}.topojson` and `{state}.metadata.json`.

Recommended starting resolution:

- MVP: Census tracts. Fast, small enough for browser algorithms, good enough to
  prove the UI and pipeline.
- Next: block groups. Better spatial fidelity, still plausible for per-state
  browser use with workers.
- Later: blocks. Correct redistricting atom but too large for a naive browser
  implementation; likely needs preprocessing, tiling, and more careful
  algorithm design.

## Algorithm Plan

Keep the existing synthetic algorithms as educational baselines, but add
graph-aware real algorithms:

1. Weighted centroid assignment
   - Similar to current `districtByCentroid`, but assigns geographic units
     weighted by population.
   - Fast baseline.
   - Does not guarantee contiguity unless followed by repair.

2. County-preserving weighted assignment
   - Similar to current `districtByCounty`, but assigns whole counties or groups
     of units.
   - Useful as a trade-off view, but large counties must be splittable.

3. Region-growing contiguous districts
   - Pick seeded centers, grow along adjacency edges while respecting population
     quotas.
   - Provides a practical first contiguous algorithm for real maps.

4. Splitline / recursive bisection
   - Recursively divide the state into population-balanced pieces.
   - Deterministic and explainable, useful for comparison even if not politically
     optimal.

5. Local improvement pass
   - Move boundary units between adjacent districts to improve compactness,
     county splits, or population balance while preserving contiguity.

Metrics should be algorithm-independent:

- Population deviation from ideal.
- Contiguity check using the adjacency graph.
- Polsby-Popper or Reock compactness where geometry supports it.
- County split count and split population.
- Optional partisan/election metrics once election data is joined.
- Optional VAP/race/Hispanic summaries from P.L. 94-171.

## UI Plan

Replace the current `/districts` experience with a real-map-first tool:

- State selector.
- Resolution selector.
- District count control.
- Algorithm segmented control or multi-select comparison.
- Map canvas/SVG with district fills, county outlines, and hover inspection.
- Side-by-side comparison for 2-4 algorithms.
- Metrics panel per plan.
- Loading/error states for missing state datasets.

Implementation notes:

- Use `d3-geo` and `topojson-client` or direct canvas rendering for map display.
- Run algorithms in a Web Worker so the UI remains responsive.
- Keep generated datasets in `public/` so static export keeps working.
- Start with one state fixture checked into the repo, then expand.

## First Implementation Slice

The smallest useful milestone is:

1. Add data-fetch/build tooling for one small state, using Census tracts.
2. Emit static state geometry plus population metadata.
3. Add a real-map renderer that displays that state and county boundaries.
4. Port weighted centroid and weighted county-preserving algorithms to operate
   on `DistrictGeoUnit[]`.
5. Add a basic comparison UI and metrics for population deviation, county splits,
   and compactness proxy.
6. Add unit tests for joins, quota math, population metrics, and contiguity.

Good first-state candidates: Delaware, Rhode Island, or Iowa. They are small
enough to keep iteration quick while still showing real geography and county
boundaries.

## Open Questions

- Should this target congressional districts only, or also state legislative
  districts?
- Should election-score comparisons use county results initially, or wait until
  precinct/VTD data is available?
- Is tract-level acceptable for the first public demo, with block groups/blocks
  clearly marked as future fidelity upgrades?
- Do we want to store generated datasets in Git, or generate them during build
  and cache artifacts outside the repo?

## Risks

- Browser performance will degrade quickly at block-level resolution.
- Precinct election data is inconsistent across states and years; this should be
  treated as a separate data-quality project.
- Current algorithms do not guarantee contiguity, so using them on real maps
  without graph constraints would produce misleading districts.
- Projection and geometry simplification can distort compactness metrics if not
  handled consistently.
