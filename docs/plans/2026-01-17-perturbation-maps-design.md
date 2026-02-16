# Perturbation Maps Design

## Overview

A new visualization at `/perturbation` that shows election stability by answering "what if some voters were persuaded toward candidate X?"

Unlike Yee diagrams (which move the electorate center), Perturbation Maps start with a specific election and show what happens as voters change their minds.

## Core Model

- **Starting point**: Uses existing Yee configuration (candidates + voter blocs, shared via URL)
- **Per candidate**: Generate a 40×40 perturbation map
- **X-axis**: 0-50% of voters shifting (selecting nearest non-supporters - the persuadable voters)
- **Y-axis**: 0-100% magnitude (how far those voters move toward the candidate in 2D space)
- **Cell color**: Winner of that perturbed election

## What It Reveals

- **Stable methods** (e.g., Condorcet): smooth color gradients, predictable transitions
- **Chaotic methods** (e.g., IRV): fractured, noisy patterns where small perturbations flip winners
- **Spoiler candidates**: candidates whose perturbation map shows lots of third-party winners

## Architecture

### New Files

```
packages/shared-utils/src/
  PerturbationMap.ts          # Core algorithm
  PerturbationMap.test.ts     # Unit tests

apps/visualizations/
  app/perturbation/page.tsx   # New page
  app/components/
    PerturbationMapViz.tsx    # Main component
    SinglePerturbationMap.tsx # Individual map renderer
  lib/
    usePerturbationMap.ts     # React hook for generation
    urlState.ts               # Shared URL serialization
```

### Data Flow

1. URL params → parse into candidates + voter blocs + voting method
2. `usePerturbationMap` hook calls `generatePerturbationMap()` from shared-utils
3. For each candidate: generate 40×40 grid of perturbed election results
4. Render grid of `SinglePerturbationMap` components
5. Hover → tooltip with details; Click → `BallotInspector` modal

### Shared with Yee

- Types: `SpatialCandidate`, `VoterBloc`, `VoterPopulation`
- Components: `BallotInspector`, `VoterConfigPanel`
- URL state logic extracted to `urlState.ts` for both pages

## Core Algorithm

### Interface

```typescript
interface PerturbationMapConfig {
  candidates: SpatialCandidate[]
  voters: Voter[]  // Pre-generated from blocs with fixed seed
  targetCandidate: SpatialCandidate
  method: VotingMethod
  resolution: number  // 40
  maxVoterPercent: number  // 0.5 (50%)
}

interface PerturbationResult {
  grid: string[][]  // winner IDs, [row][col]
  targetCandidateId: string
}
```

### Algorithm (per cell)

1. Calculate perturbation: `voterPercent = col / resolution * maxVoterPercent`, `shiftMagnitude = row / resolution`
2. Find non-supporters: voters who don't rank `targetCandidate` first
3. Sort by distance to `targetCandidate`, take top `voterPercent * totalVoters`
4. Clone selected voters, move each toward `targetCandidate` by `shiftMagnitude * currentDistance`
5. Regenerate ballots for moved voters (rankings based on new distances)
6. Run election with `method`, record winner

### Performance

40×40 = 1,600 elections per candidate. With 4 candidates = 6,400 elections. Should compute in <1 second for typical setups (1000 voters, 4 candidates).

## UI/UX

### Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  [← Back to Yee]    Perturbation Maps    [Method ▼]     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Candidate A │  │  Candidate B │  │  Candidate C │   │
│  │   (color)    │  │   (color)    │  │   (color)    │   │
│  │  ┌───────┐   │  │  ┌───────┐   │  │  ┌───────┐   │   │
│  │  │       │   │  │  │       │   │  │  │       │   │   │
│  │  │ 40×40 │   │  │  │ 40×40 │   │  │  │ 40×40 │   │   │
│  │  │ grid  │   │  │  │ grid  │   │  │  │ grid  │   │   │
│  │  │       │   │  │  │       │   │  │  │       │   │   │
│  │  └───────┘   │  │  └───────┘   │  │  └───────┘   │   │
│  │  ↑ shift %   │  │              │  │              │   │
│  │  → voters %  │  │              │  │              │   │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
├─────────────────────────────────────────────────────────┤
│  Voter Config: [Preset ▼] [Edit Blocs]  Candidates: +−  │
└─────────────────────────────────────────────────────────┘
```

### Interactions

- **Hover cell**: Tooltip shows "15% voters shifted 40% → Winner: B (margin: 12%)"
- **Click cell**: Opens BallotInspector modal with full election breakdown
- **Method dropdown**: Switches voting method, regenerates all maps
- **Edit controls**: Same VoterConfigPanel as Yee, URL updates on change

### Colors

Each cell uses the winner's candidate color (matching Yee diagrams)

## Edge Cases

- **No non-supporters**: Show uniform color with note "All voters already support this candidate"
- **Tied elections**: Use existing tiebreaker logic from voting methods
- **0% perturbation (bottom-left cell)**: Shows current election winner (baseline)

## URL State Format

```
/perturbation?candidates=A,0.3,0.5,red;B,0.7,0.5,blue&blocs=0.5,0.5,0.1,500&method=irv
```

Same format shared with `/yee`.

## Testing

- Unit tests for `PerturbationMap.ts`: voter selection, position shifting, determinism
- Snapshot tests: known configuration → expected grid output
- Integration test: URL parsing → render → click cell → BallotInspector opens

## Future Enhancements (Not in v1)

- Multi-method comparison view
- Export as image
- Animated transitions between methods
- Web worker for background computation
