# Yee Diagrams Design

## Overview

Implement proper Yee diagram visualization for the VoteLab visualizations app. Yee diagrams show which candidate would win at each point in a 2D political space, given a voter population distribution.

## Goals

1. **Educational accuracy** — Mathematically correct diagrams with sharp geometric boundaries
2. **Performance** — <200ms interactive updates when dragging candidates
3. **Flexibility** — Configurable voter distributions (presets + custom blocs)

## Scope

- **Voting methods**: Plurality, Approval, IRV, Borda, Condorcet, Smith+Approval
- **Candidates**: Up to 6
- **Voter configuration**: Presets (uniform, centered, polarized, triangle) + click-to-place blocs

---

## Architecture

Three-layer design:

### 1. Shared Voter Configuration Module
`packages/shared-utils/src/VoterDistribution.ts`

Handles all voter population logic:
- **Presets**: Uniform grid, centered normal, polarized (2 blocs), triangle (3 blocs)
- **Custom blocs**: Add/remove/move voter clusters with position, count, and spread
- **Serialization**: Save/load voter configurations

Pure logic — no React, no rendering.

### 2. Yee Diagram Computation Engine
`packages/shared-utils/src/YeeDiagram.ts`

Takes:
- A voter population (from the configuration module)
- Candidate positions
- A voting method

Outputs a 2D array of winner IDs (one per pixel). Uses Web Workers for performance.

### 3. React Components
`apps/visualizations/`

- **Shared**: `VoterConfigPanel.tsx` — UI for presets, sliders, bloc placement
- **New**: `YeeDiagramViz.tsx` — The main Yee diagram view
- **Updated**: `DetailedVotingViz.tsx` — Refactored to use shared voter config

---

## Computation Algorithm

Key insight: **don't simulate elections per-pixel**. Pre-place voters once, then compute the winner across the entire space.

### Per-Method Approach

**Plurality:**
Pure Voronoi — each pixel colored by nearest candidate. O(pixels × candidates). Instant.

**Approval:**
For each pixel, a voter there approves all candidates within threshold distance. Aggregate across all voters. Precompute approval regions (circles) for speed.

**Borda:**
Each voter ranks candidates by distance. Sum Borda scores across all voters. Cache voter rankings.

**IRV:**
Run elimination rounds using pre-computed voter preferences. Shows winner plus margin/elimination data per region.

**Condorcet:**
Precompute pairwise matrix from voter preferences. Find candidate who beats all others (or show cycle).

**Smith Set + Approval:**
Compute Smith Set from pairwise matrix, then run approval within that set.

### Performance Strategy

- **Web Worker**: Offload computation from main thread
- **Progressive rendering**: Show low-res (every 4th pixel) immediately, refine to full resolution
- **Dirty tracking**: Only recompute affected regions when a candidate moves

---

## Smith Set Implementation

Current code falls back to Approval. Implement properly:

### Algorithm

```
1. Build pairwise matrix: for each pair (A, B), count voters who prefer A > B
2. Create "beats" graph: A → B if more voters prefer A over B
3. Find strongly connected components (Tarjan's or Kosaraju's algorithm)
4. Topologically sort the components
5. Smith Set = the top component (undefeated by any outside candidate)
```

### Smith + Approval Method

```
1. Compute Smith Set from pairwise matrix
2. Filter candidates to only Smith Set members
3. Run Approval voting among Smith Set candidates only
4. Winner = most approved within Smith Set
```

### Integration

Add `calculateSmithSet()` to `packages/shared-utils/src/ElectionUtils.ts` alongside existing `getPairwiseResults`.

---

## UI Design

### Main Canvas (400x400)
- Yee diagram fills the canvas with candidate-colored regions
- Candidates shown as draggable circles with labels
- Voter blocs shown as semi-transparent clusters (toggleable)
- Boundary highlighting (optional toggle)

### Voter Configuration Panel (sidebar)

**Presets dropdown:**
- Uniform grid
- Centered (normal distribution at center)
- Polarized (two opposing blocs)
- Triangle (three-corner blocs)
- Custom (starts empty)

**Bloc controls:**
- Click canvas to add a voter bloc at that position
- Each bloc: adjustable count (100-2000) and spread (0.05-0.3)
- List of blocs with delete buttons
- Total voter count display

### Voting Method Selector
- Dropdown or tabs for all 6 methods
- For Approval: slider for threshold distance (0.1-0.5)

### Candidate Management
- Add/remove candidates (up to 6)
- Color picker per candidate
- Reset positions button

### Inspect Mode
- Shift+click shows: ballots at that point, vote tallies, elimination order (for IRV)

---

## File Structure

### New/Updated in `packages/shared-utils/src/`

```
VoterDistribution.ts    — Voter population model, presets, blocs
YeeDiagram.ts           — Core computation engine
YeeDiagram.worker.ts    — Web Worker wrapper
types.ts                — Extended with new interfaces
ElectionUtils.ts        — Add calculateSmithSet()
```

### New/Updated in `apps/visualizations/`

```
lib/
  useYeeDiagram.ts      — React hook wrapping the computation engine

app/components/
  VoterConfigPanel.tsx  — Shared voter configuration UI
  YeeDiagramViz.tsx     — New main Yee diagram component
  CandidateOverlay.tsx  — Draggable candidates (extracted, reusable)

  DetailedVotingViz.tsx — Refactored to use VoterConfigPanel
```

### Migration Path

1. Build new modules without breaking existing components
2. New `YeeDiagramViz` uses new modules
3. Refactor `DetailedVotingViz` to use shared pieces
4. `VotingMethodViz` can stay for comparison or be deprecated later

---

## Testing Strategy

### Unit Tests (`packages/shared-utils`)

**VoterDistribution.ts:**
- Presets generate expected voter counts and positions
- Blocs respect spread/count parameters
- Serialization round-trips correctly

**YeeDiagram.ts:**
- Plurality produces exact Voronoi regions (test known boundary points)
- Approval regions are circular with correct radius
- Smith Set algorithm finds correct set for known examples (including cycles)

**ElectionUtils.ts (Smith Set):**
- Single Condorcet winner → Smith Set = {winner}
- Rock-paper-scissors cycle → Smith Set = all three
- Known academic examples from voting theory literature

### Visual Validation Tests

**Plurality sanity check:**
- 2 candidates → boundary is perpendicular bisector
- Equidistant point → tie (either color acceptable)

**Approval sanity check:**
- Candidate with most voters within threshold wins
- Overlapping approval circles produce expected blending

**IRV spoiler effect:**
- Classic scenario: adding candidate C changes winner from A to B
- Diagram shows non-convex regions

### Performance Tests
- 400x400 render with 5000 voters < 200ms
- Dragging candidate triggers re-render < 200ms
- Progressive rendering shows first frame < 50ms

---

## Summary

### Key Fixes to Current Code
- Replace per-pixel election simulation with proper voter-population-based computation
- Implement actual Smith Set algorithm (currently stubbed)
- Extract reusable pieces from existing visualization components

### Deliverables
- Proper Yee diagrams for 6 voting methods
- Configurable voter distributions with intuitive UI
- <200ms interactive performance
- Comprehensive test coverage
