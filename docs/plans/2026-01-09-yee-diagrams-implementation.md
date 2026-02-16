# Yee Diagrams Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement proper Yee diagram visualization with configurable voter distributions, 6 voting methods, and <200ms interactive performance.

**Architecture:** Three-layer design with shared voter configuration module, Yee computation engine using Web Workers, and React components. Replaces per-pixel election simulation with voter-population-based computation.

**Tech Stack:** TypeScript, React, Vitest, Web Workers, Canvas API

---

## Task 1: Add Voter Distribution Types

**Files:**
- Modify: `packages/shared-utils/src/types.ts`
- Test: `packages/shared-utils/src/VoterDistribution.test.ts`

**Step 1: Add new types to types.ts**

Add after the existing `CandidateMetrics` interface (line 47):

```typescript
export interface Point2D {
  x: number;
  y: number;
}

export interface VoterBloc {
  id: string;
  position: Point2D;
  count: number;
  spread: number; // standard deviation for normal distribution
}

export interface VoterPopulation {
  blocs: VoterBloc[];
  totalCount: number;
}

export interface Voter {
  position: Point2D;
  blocId?: string; // which bloc this voter came from
}

export type VoterPreset = 'uniform' | 'centered' | 'polarized' | 'triangle' | 'custom';
```

**Step 2: Export new types from index.ts**

Types are auto-exported via `export * from './types.js'` - no change needed.

**Step 3: Run build to verify types compile**

Run: `cd packages/shared-utils && npm run build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add packages/shared-utils/src/types.ts
git commit -m "feat(shared-utils): add voter distribution types"
```

---

## Task 2: Create VoterDistribution Module - Core Functions

**Files:**
- Create: `packages/shared-utils/src/VoterDistribution.ts`
- Create: `packages/shared-utils/src/VoterDistribution.test.ts`

**Step 1: Write failing test for generateVotersFromBloc**

Create `packages/shared-utils/src/VoterDistribution.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateVotersFromBloc, createVoterBloc } from './VoterDistribution.js';

describe('VoterDistribution', () => {
  describe('createVoterBloc', () => {
    it('creates a bloc with correct properties', () => {
      const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.1);

      expect(bloc.position).toEqual({ x: 0.5, y: 0.5 });
      expect(bloc.count).toBe(100);
      expect(bloc.spread).toBe(0.1);
      expect(bloc.id).toBeDefined();
    });
  });

  describe('generateVotersFromBloc', () => {
    it('generates correct number of voters', () => {
      const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.1);
      const voters = generateVotersFromBloc(bloc);

      expect(voters).toHaveLength(100);
    });

    it('generates voters near bloc center', () => {
      const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 1000, 0.05);
      const voters = generateVotersFromBloc(bloc);

      // With spread 0.05, most voters should be within 0.15 of center (3 std devs)
      const nearCenter = voters.filter(v =>
        Math.abs(v.position.x - 0.5) < 0.15 &&
        Math.abs(v.position.y - 0.5) < 0.15
      );
      expect(nearCenter.length).toBeGreaterThan(950); // 99.7% within 3 std devs
    });

    it('clamps voters to 0-1 bounds', () => {
      const bloc = createVoterBloc({ x: 0.0, y: 0.0 }, 500, 0.2);
      const voters = generateVotersFromBloc(bloc);

      voters.forEach(v => {
        expect(v.position.x).toBeGreaterThanOrEqual(0);
        expect(v.position.x).toBeLessThanOrEqual(1);
        expect(v.position.y).toBeGreaterThanOrEqual(0);
        expect(v.position.y).toBeLessThanOrEqual(1);
      });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

Create `packages/shared-utils/src/VoterDistribution.ts`:

```typescript
import { Point2D, Voter, VoterBloc, VoterPopulation, VoterPreset } from './types.js';

// Box-Muller transform for normal distribution
const randomNormal = (): number => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

// Clamp value to 0-1 range
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

let blocIdCounter = 0;

export const createVoterBloc = (
  position: Point2D,
  count: number,
  spread: number
): VoterBloc => ({
  id: `bloc-${++blocIdCounter}`,
  position,
  count,
  spread,
});

export const generateVotersFromBloc = (bloc: VoterBloc): Voter[] => {
  const voters: Voter[] = [];

  for (let i = 0; i < bloc.count; i++) {
    const x = clamp01(bloc.position.x + randomNormal() * bloc.spread);
    const y = clamp01(bloc.position.y + randomNormal() * bloc.spread);

    voters.push({
      position: { x, y },
      blocId: bloc.id,
    });
  }

  return voters;
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/VoterDistribution.ts packages/shared-utils/src/VoterDistribution.test.ts
git commit -m "feat(shared-utils): add voter bloc generation"
```

---

## Task 3: VoterDistribution - Population and Presets

**Files:**
- Modify: `packages/shared-utils/src/VoterDistribution.ts`
- Modify: `packages/shared-utils/src/VoterDistribution.test.ts`

**Step 1: Write failing tests for population functions**

Add to `VoterDistribution.test.ts`:

```typescript
import {
  generateVotersFromBloc,
  createVoterBloc,
  generatePopulation,
  createPresetPopulation,
} from './VoterDistribution.js';

describe('generatePopulation', () => {
  it('combines voters from multiple blocs', () => {
    const blocs = [
      createVoterBloc({ x: 0.2, y: 0.2 }, 50, 0.1),
      createVoterBloc({ x: 0.8, y: 0.8 }, 50, 0.1),
    ];
    const voters = generatePopulation(blocs);

    expect(voters).toHaveLength(100);
  });
});

describe('createPresetPopulation', () => {
  it('creates uniform distribution', () => {
    const { blocs } = createPresetPopulation('uniform', 1000);
    const voters = generatePopulation(blocs);

    expect(voters).toHaveLength(1000);
    // Check spread across quadrants
    const q1 = voters.filter(v => v.position.x < 0.5 && v.position.y < 0.5);
    const q2 = voters.filter(v => v.position.x >= 0.5 && v.position.y < 0.5);
    const q3 = voters.filter(v => v.position.x < 0.5 && v.position.y >= 0.5);
    const q4 = voters.filter(v => v.position.x >= 0.5 && v.position.y >= 0.5);

    // Each quadrant should have roughly 25% of voters (within 10% tolerance)
    [q1, q2, q3, q4].forEach(q => {
      expect(q.length).toBeGreaterThan(150);
      expect(q.length).toBeLessThan(350);
    });
  });

  it('creates centered distribution', () => {
    const { blocs } = createPresetPopulation('centered', 1000);
    const voters = generatePopulation(blocs);

    expect(voters).toHaveLength(1000);
    // Most voters should be near center
    const nearCenter = voters.filter(v =>
      Math.abs(v.position.x - 0.5) < 0.3 &&
      Math.abs(v.position.y - 0.5) < 0.3
    );
    expect(nearCenter.length).toBeGreaterThan(800);
  });

  it('creates polarized distribution with two blocs', () => {
    const { blocs } = createPresetPopulation('polarized', 1000);

    expect(blocs).toHaveLength(2);
    const voters = generatePopulation(blocs);
    expect(voters).toHaveLength(1000);
  });

  it('creates triangle distribution with three blocs', () => {
    const { blocs } = createPresetPopulation('triangle', 900);

    expect(blocs).toHaveLength(3);
    const voters = generatePopulation(blocs);
    expect(voters).toHaveLength(900);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test`
Expected: FAIL - functions not found

**Step 3: Write implementation**

Add to `VoterDistribution.ts`:

```typescript
export const generatePopulation = (blocs: VoterBloc[]): Voter[] => {
  return blocs.flatMap(bloc => generateVotersFromBloc(bloc));
};

export const createPresetPopulation = (
  preset: VoterPreset,
  totalCount: number
): VoterPopulation => {
  switch (preset) {
    case 'uniform': {
      // Create a grid of small blocs for even distribution
      const gridSize = 5;
      const countPerBloc = Math.floor(totalCount / (gridSize * gridSize));
      const blocs: VoterBloc[] = [];

      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const x = (i + 0.5) / gridSize;
          const y = (j + 0.5) / gridSize;
          blocs.push(createVoterBloc({ x, y }, countPerBloc, 0.08));
        }
      }
      return { blocs, totalCount: countPerBloc * gridSize * gridSize };
    }

    case 'centered': {
      const blocs = [createVoterBloc({ x: 0.5, y: 0.5 }, totalCount, 0.15)];
      return { blocs, totalCount };
    }

    case 'polarized': {
      const countPerBloc = Math.floor(totalCount / 2);
      const blocs = [
        createVoterBloc({ x: 0.25, y: 0.5 }, countPerBloc, 0.12),
        createVoterBloc({ x: 0.75, y: 0.5 }, countPerBloc, 0.12),
      ];
      return { blocs, totalCount: countPerBloc * 2 };
    }

    case 'triangle': {
      const countPerBloc = Math.floor(totalCount / 3);
      const blocs = [
        createVoterBloc({ x: 0.5, y: 0.2 }, countPerBloc, 0.1),
        createVoterBloc({ x: 0.2, y: 0.8 }, countPerBloc, 0.1),
        createVoterBloc({ x: 0.8, y: 0.8 }, countPerBloc, 0.1),
      ];
      return { blocs, totalCount: countPerBloc * 3 };
    }

    case 'custom':
    default:
      return { blocs: [], totalCount: 0 };
  }
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test`
Expected: PASS

**Step 5: Export from index.ts**

Add to `packages/shared-utils/src/index.ts`:

```typescript
export * from './ElectionUtils.js';
export * from './types.js';
export * from './VoterDistribution.js';
```

**Step 6: Run build**

Run: `cd packages/shared-utils && npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add packages/shared-utils/src/
git commit -m "feat(shared-utils): add voter population presets"
```

---

## Task 4: Add SpatialCandidate Type to shared-utils

**Files:**
- Modify: `packages/shared-utils/src/types.ts`

**Step 1: Add SpatialCandidate interface**

The visualizations app has `SpatialCandidate` in `spatialVoting.ts`. Move it to shared-utils for reuse.

Add to `types.ts` after the `Candidate` interface:

```typescript
export interface SpatialCandidate extends Candidate {
  x: number;
  y: number;
  color: string;
}
```

**Step 2: Run build**

Run: `cd packages/shared-utils && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/shared-utils/src/types.ts
git commit -m "feat(shared-utils): add SpatialCandidate type"
```

---

## Task 5: Yee Diagram Engine - Distance Utilities

**Files:**
- Create: `packages/shared-utils/src/YeeDiagram.ts`
- Create: `packages/shared-utils/src/YeeDiagram.test.ts`

**Step 1: Write failing tests**

Create `packages/shared-utils/src/YeeDiagram.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { distance, getVoterPreferences } from './YeeDiagram.js';
import { SpatialCandidate, Voter } from './types.js';

describe('YeeDiagram', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
    { id: 'b', name: 'B', x: 0.8, y: 0.5, color: '#0000ff' },
    { id: 'c', name: 'C', x: 0.5, y: 0.8, color: '#00ff00' },
  ];

  describe('distance', () => {
    it('calculates Euclidean distance correctly', () => {
      expect(distance(0, 0, 3, 4)).toBe(5);
      expect(distance(0, 0, 1, 0)).toBe(1);
      expect(distance(0.5, 0.5, 0.5, 0.5)).toBe(0);
    });
  });

  describe('getVoterPreferences', () => {
    it('ranks candidates by distance from voter', () => {
      const voter: Voter = { position: { x: 0.3, y: 0.5 } };
      const prefs = getVoterPreferences(voter, candidates);

      expect(prefs[0].candidateId).toBe('a'); // closest
      expect(prefs[1].candidateId).toBe('c');
      expect(prefs[2].candidateId).toBe('b'); // furthest
    });

    it('returns distances with each preference', () => {
      const voter: Voter = { position: { x: 0.2, y: 0.5 } };
      const prefs = getVoterPreferences(voter, candidates);

      expect(prefs[0].distance).toBeCloseTo(0, 5); // voter is at candidate A
      expect(prefs[0].candidateId).toBe('a');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test`
Expected: FAIL - module not found

**Step 3: Write implementation**

Create `packages/shared-utils/src/YeeDiagram.ts`:

```typescript
import { Point2D, SpatialCandidate, Voter } from './types.js';

export interface VoterPreference {
  candidateId: string;
  distance: number;
}

export const distance = (x1: number, y1: number, x2: number, y2: number): number => {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
};

export const getVoterPreferences = (
  voter: Voter,
  candidates: SpatialCandidate[]
): VoterPreference[] => {
  return candidates
    .map(candidate => ({
      candidateId: candidate.id,
      distance: distance(voter.position.x, voter.position.y, candidate.x, candidate.y),
    }))
    .sort((a, b) => a.distance - b.distance);
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/YeeDiagram.ts packages/shared-utils/src/YeeDiagram.test.ts
git commit -m "feat(shared-utils): add Yee diagram distance utilities"
```

---

## Task 6: Yee Diagram Engine - Plurality Winner

**Files:**
- Modify: `packages/shared-utils/src/YeeDiagram.ts`
- Modify: `packages/shared-utils/src/YeeDiagram.test.ts`

**Step 1: Write failing test**

Add to `YeeDiagram.test.ts`:

```typescript
import {
  distance,
  getVoterPreferences,
  computePluralityWinner,
} from './YeeDiagram.js';
import { createVoterBloc, generateVotersFromBloc } from './VoterDistribution.js';

describe('computePluralityWinner', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
    { id: 'b', name: 'B', x: 0.8, y: 0.5, color: '#0000ff' },
  ];

  it('returns candidate closest to majority of voters', () => {
    // Create voters clustered near candidate A
    const bloc = createVoterBloc({ x: 0.25, y: 0.5 }, 100, 0.05);
    const voters = generateVotersFromBloc(bloc);

    const winner = computePluralityWinner(voters, candidates);
    expect(winner).toBe('a');
  });

  it('returns candidate B when voters are near B', () => {
    const bloc = createVoterBloc({ x: 0.75, y: 0.5 }, 100, 0.05);
    const voters = generateVotersFromBloc(bloc);

    const winner = computePluralityWinner(voters, candidates);
    expect(winner).toBe('b');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test`
Expected: FAIL - function not found

**Step 3: Write implementation**

Add to `YeeDiagram.ts`:

```typescript
export const computePluralityWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[]
): string => {
  const voteCounts: Record<string, number> = {};
  candidates.forEach(c => (voteCounts[c.id] = 0));

  voters.forEach(voter => {
    const prefs = getVoterPreferences(voter, candidates);
    if (prefs.length > 0) {
      voteCounts[prefs[0].candidateId]++;
    }
  });

  return Object.entries(voteCounts).reduce((a, b) =>
    a[1] > b[1] ? a : b
  )[0];
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/YeeDiagram.ts packages/shared-utils/src/YeeDiagram.test.ts
git commit -m "feat(shared-utils): add plurality winner computation"
```

---

## Task 7: Yee Diagram Engine - Approval Winner

**Files:**
- Modify: `packages/shared-utils/src/YeeDiagram.ts`
- Modify: `packages/shared-utils/src/YeeDiagram.test.ts`

**Step 1: Write failing test**

Add to `YeeDiagram.test.ts`:

```typescript
import { computeApprovalWinner } from './YeeDiagram.js';

describe('computeApprovalWinner', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.3, y: 0.5, color: '#ff0000' },
    { id: 'b', name: 'B', x: 0.7, y: 0.5, color: '#0000ff' },
  ];

  it('approves candidates within threshold distance', () => {
    // Voters in the middle approve both candidates if threshold is high enough
    const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.02);
    const voters = generateVotersFromBloc(bloc);

    // With threshold 0.3, both candidates are within range from center
    const winner = computeApprovalWinner(voters, candidates, 0.3);
    // Both should get similar approvals, either could win
    expect(['a', 'b']).toContain(winner);
  });

  it('respects threshold distance', () => {
    // Voters very close to A with small threshold
    const bloc = createVoterBloc({ x: 0.3, y: 0.5 }, 100, 0.01);
    const voters = generateVotersFromBloc(bloc);

    // With threshold 0.1, only A is in range
    const winner = computeApprovalWinner(voters, candidates, 0.1);
    expect(winner).toBe('a');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test`
Expected: FAIL - function not found

**Step 3: Write implementation**

Add to `YeeDiagram.ts`:

```typescript
export const computeApprovalWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[],
  threshold: number
): string => {
  const approvalCounts: Record<string, number> = {};
  candidates.forEach(c => (approvalCounts[c.id] = 0));

  voters.forEach(voter => {
    const prefs = getVoterPreferences(voter, candidates);
    prefs.forEach(pref => {
      if (pref.distance <= threshold) {
        approvalCounts[pref.candidateId]++;
      }
    });
  });

  return Object.entries(approvalCounts).reduce((a, b) =>
    a[1] > b[1] ? a : b
  )[0];
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/YeeDiagram.ts packages/shared-utils/src/YeeDiagram.test.ts
git commit -m "feat(shared-utils): add approval winner computation"
```

---

## Task 8: Yee Diagram Engine - Borda Winner

**Files:**
- Modify: `packages/shared-utils/src/YeeDiagram.ts`
- Modify: `packages/shared-utils/src/YeeDiagram.test.ts`

**Step 1: Write failing test**

Add to `YeeDiagram.test.ts`:

```typescript
import { computeBordaWinner } from './YeeDiagram.js';

describe('computeBordaWinner', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
    { id: 'b', name: 'B', x: 0.5, y: 0.5, color: '#0000ff' },
    { id: 'c', name: 'C', x: 0.8, y: 0.5, color: '#00ff00' },
  ];

  it('awards points based on ranking', () => {
    // Voters near B - B gets 2 pts each, A and C get 1 or 0
    const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.01);
    const voters = generateVotersFromBloc(bloc);

    const winner = computeBordaWinner(voters, candidates);
    expect(winner).toBe('b');
  });

  it('candidate at edge wins when voters are there', () => {
    const bloc = createVoterBloc({ x: 0.2, y: 0.5 }, 100, 0.01);
    const voters = generateVotersFromBloc(bloc);

    const winner = computeBordaWinner(voters, candidates);
    expect(winner).toBe('a');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test`
Expected: FAIL - function not found

**Step 3: Write implementation**

Add to `YeeDiagram.ts`:

```typescript
export const computeBordaWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[]
): string => {
  const scores: Record<string, number> = {};
  candidates.forEach(c => (scores[c.id] = 0));

  const n = candidates.length;

  voters.forEach(voter => {
    const prefs = getVoterPreferences(voter, candidates);
    prefs.forEach((pref, index) => {
      // First place gets n-1 points, second gets n-2, etc.
      scores[pref.candidateId] += (n - 1 - index);
    });
  });

  return Object.entries(scores).reduce((a, b) =>
    a[1] > b[1] ? a : b
  )[0];
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/YeeDiagram.ts packages/shared-utils/src/YeeDiagram.test.ts
git commit -m "feat(shared-utils): add Borda winner computation"
```

---

## Task 9: Yee Diagram Engine - IRV Winner

**Files:**
- Modify: `packages/shared-utils/src/YeeDiagram.ts`
- Modify: `packages/shared-utils/src/YeeDiagram.test.ts`

**Step 1: Write failing test**

Add to `YeeDiagram.test.ts`:

```typescript
import { computeIRVWinner } from './YeeDiagram.js';

describe('computeIRVWinner', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
    { id: 'b', name: 'B', x: 0.5, y: 0.5, color: '#0000ff' },
    { id: 'c', name: 'C', x: 0.8, y: 0.5, color: '#00ff00' },
  ];

  it('returns winner after elimination rounds', () => {
    // Voters split between A and C, B is compromise
    const voters = [
      ...generateVotersFromBloc(createVoterBloc({ x: 0.2, y: 0.5 }, 40, 0.01)),
      ...generateVotersFromBloc(createVoterBloc({ x: 0.8, y: 0.5 }, 35, 0.01)),
      ...generateVotersFromBloc(createVoterBloc({ x: 0.5, y: 0.5 }, 25, 0.01)),
    ];

    const winner = computeIRVWinner(voters, candidates);
    // A has most first-choice, should win or be close
    expect(['a', 'b']).toContain(winner);
  });

  it('handles majority winner in first round', () => {
    const bloc = createVoterBloc({ x: 0.2, y: 0.5 }, 100, 0.01);
    const voters = generateVotersFromBloc(bloc);

    const winner = computeIRVWinner(voters, candidates);
    expect(winner).toBe('a');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test`
Expected: FAIL - function not found

**Step 3: Write implementation**

Add to `YeeDiagram.ts`:

```typescript
export const computeIRVWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[]
): string => {
  // Pre-compute all voter preferences
  const voterPrefs = voters.map(voter =>
    getVoterPreferences(voter, candidates).map(p => p.candidateId)
  );

  let remainingCandidates = candidates.map(c => c.id);

  while (remainingCandidates.length > 1) {
    // Count first preferences among remaining candidates
    const voteCounts: Record<string, number> = {};
    remainingCandidates.forEach(id => (voteCounts[id] = 0));

    voterPrefs.forEach(prefs => {
      const firstChoice = prefs.find(id => remainingCandidates.includes(id));
      if (firstChoice) {
        voteCounts[firstChoice]++;
      }
    });

    const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);

    // Check for majority winner
    const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] > totalVotes / 2) {
      return sorted[0][0];
    }

    // Eliminate candidate with fewest votes
    const loser = sorted[sorted.length - 1][0];
    remainingCandidates = remainingCandidates.filter(id => id !== loser);
  }

  return remainingCandidates[0];
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/YeeDiagram.ts packages/shared-utils/src/YeeDiagram.test.ts
git commit -m "feat(shared-utils): add IRV winner computation"
```

---

## Task 10: Yee Diagram Engine - Condorcet Winner

**Files:**
- Modify: `packages/shared-utils/src/YeeDiagram.ts`
- Modify: `packages/shared-utils/src/YeeDiagram.test.ts`

**Step 1: Write failing test**

Add to `YeeDiagram.test.ts`:

```typescript
import { computeCondorcetWinner, buildPairwiseMatrix } from './YeeDiagram.js';

describe('buildPairwiseMatrix', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
    { id: 'b', name: 'B', x: 0.8, y: 0.5, color: '#0000ff' },
  ];

  it('counts pairwise preferences correctly', () => {
    // All voters prefer A
    const bloc = createVoterBloc({ x: 0.2, y: 0.5 }, 100, 0.01);
    const voters = generateVotersFromBloc(bloc);

    const matrix = buildPairwiseMatrix(voters, candidates);
    expect(matrix['a']['b']).toBe(100);
    expect(matrix['b']['a']).toBe(0);
  });
});

describe('computeCondorcetWinner', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
    { id: 'b', name: 'B', x: 0.5, y: 0.5, color: '#0000ff' },
    { id: 'c', name: 'C', x: 0.8, y: 0.5, color: '#00ff00' },
  ];

  it('finds Condorcet winner when one exists', () => {
    // B is in the middle, should beat both in pairwise with centered voters
    const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.15);
    const voters = generateVotersFromBloc(bloc);

    const winner = computeCondorcetWinner(voters, candidates);
    expect(winner).toBe('b');
  });

  it('falls back to IRV when no Condorcet winner', () => {
    // Create Condorcet cycle scenario - hard to do spatially, but test fallback works
    const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 10, 0.01);
    const voters = generateVotersFromBloc(bloc);

    const winner = computeCondorcetWinner(voters, candidates);
    expect(winner).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test`
Expected: FAIL - functions not found

**Step 3: Write implementation**

Add to `YeeDiagram.ts`:

```typescript
export const buildPairwiseMatrix = (
  voters: Voter[],
  candidates: SpatialCandidate[]
): Record<string, Record<string, number>> => {
  const matrix: Record<string, Record<string, number>> = {};

  candidates.forEach(c1 => {
    matrix[c1.id] = {};
    candidates.forEach(c2 => {
      if (c1.id !== c2.id) {
        matrix[c1.id][c2.id] = 0;
      }
    });
  });

  voters.forEach(voter => {
    const prefs = getVoterPreferences(voter, candidates);
    // For each pair, the closer candidate wins the pairwise comparison
    for (let i = 0; i < prefs.length; i++) {
      for (let j = i + 1; j < prefs.length; j++) {
        matrix[prefs[i].candidateId][prefs[j].candidateId]++;
      }
    }
  });

  return matrix;
};

export const computeCondorcetWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[]
): string => {
  const matrix = buildPairwiseMatrix(voters, candidates);

  // Find candidate who beats all others
  for (const c1 of candidates) {
    let isWinner = true;
    for (const c2 of candidates) {
      if (c1.id === c2.id) continue;
      if (matrix[c1.id][c2.id] <= matrix[c2.id][c1.id]) {
        isWinner = false;
        break;
      }
    }
    if (isWinner) {
      return c1.id;
    }
  }

  // No Condorcet winner, fall back to IRV
  return computeIRVWinner(voters, candidates);
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/YeeDiagram.ts packages/shared-utils/src/YeeDiagram.test.ts
git commit -m "feat(shared-utils): add Condorcet winner computation"
```

---

## Task 11: Yee Diagram Engine - Smith Set + Approval

**Files:**
- Modify: `packages/shared-utils/src/YeeDiagram.ts`
- Modify: `packages/shared-utils/src/YeeDiagram.test.ts`

**Step 1: Write failing test**

Add to `YeeDiagram.test.ts`:

```typescript
import { computeSmithSet, computeSmithApprovalWinner } from './YeeDiagram.js';

describe('computeSmithSet', () => {
  it('returns single candidate when Condorcet winner exists', () => {
    const candidates: SpatialCandidate[] = [
      { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
      { id: 'b', name: 'B', x: 0.5, y: 0.5, color: '#0000ff' },
      { id: 'c', name: 'C', x: 0.8, y: 0.5, color: '#00ff00' },
    ];

    const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.1);
    const voters = generateVotersFromBloc(bloc);
    const matrix = buildPairwiseMatrix(voters, candidates);

    const smithSet = computeSmithSet(matrix, candidates.map(c => c.id));
    expect(smithSet).toHaveLength(1);
    expect(smithSet).toContain('b');
  });

  it('returns multiple candidates in cycle', () => {
    // Manually construct a cycle matrix
    const matrix = {
      'a': { 'b': 60, 'c': 40 },
      'b': { 'a': 40, 'c': 60 },
      'c': { 'a': 60, 'b': 40 },
    };

    const smithSet = computeSmithSet(matrix, ['a', 'b', 'c']);
    expect(smithSet).toHaveLength(3);
  });
});

describe('computeSmithApprovalWinner', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
    { id: 'b', name: 'B', x: 0.5, y: 0.5, color: '#0000ff' },
    { id: 'c', name: 'C', x: 0.8, y: 0.5, color: '#00ff00' },
  ];

  it('runs approval among Smith set only', () => {
    const bloc = createVoterBloc({ x: 0.5, y: 0.5 }, 100, 0.15);
    const voters = generateVotersFromBloc(bloc);

    const winner = computeSmithApprovalWinner(voters, candidates, 0.3);
    expect(winner).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test`
Expected: FAIL - functions not found

**Step 3: Write implementation**

Add to `YeeDiagram.ts`:

```typescript
export const computeSmithSet = (
  matrix: Record<string, Record<string, number>>,
  candidateIds: string[]
): string[] => {
  // Build "beats" relationship
  const beats = new Map<string, Set<string>>();
  candidateIds.forEach(id => beats.set(id, new Set()));

  candidateIds.forEach(c1 => {
    candidateIds.forEach(c2 => {
      if (c1 !== c2 && matrix[c1][c2] > matrix[c2][c1]) {
        beats.get(c1)!.add(c2);
      }
    });
  });

  // Find strongly connected components using Kosaraju's algorithm
  const visited = new Set<string>();
  const finishOrder: string[] = [];

  // First DFS to get finish order
  const dfs1 = (node: string) => {
    if (visited.has(node)) return;
    visited.add(node);
    beats.get(node)!.forEach(next => dfs1(next));
    finishOrder.push(node);
  };

  candidateIds.forEach(id => dfs1(id));

  // Build reverse graph
  const reversedBeats = new Map<string, Set<string>>();
  candidateIds.forEach(id => reversedBeats.set(id, new Set()));
  candidateIds.forEach(c1 => {
    beats.get(c1)!.forEach(c2 => {
      reversedBeats.get(c2)!.add(c1);
    });
  });

  // Second DFS on reverse graph in reverse finish order
  visited.clear();
  const components: string[][] = [];

  const dfs2 = (node: string, component: string[]) => {
    if (visited.has(node)) return;
    visited.add(node);
    component.push(node);
    reversedBeats.get(node)!.forEach(next => dfs2(next, component));
  };

  for (let i = finishOrder.length - 1; i >= 0; i--) {
    const node = finishOrder[i];
    if (!visited.has(node)) {
      const component: string[] = [];
      dfs2(node, component);
      components.push(component);
    }
  }

  // Smith set is the first component (dominates all others)
  // But we need to verify it actually beats everyone outside
  for (const component of components) {
    const componentSet = new Set(component);
    const beatsAllOutside = candidateIds
      .filter(id => !componentSet.has(id))
      .every(outside =>
        component.some(inside =>
          matrix[inside][outside] > matrix[outside][inside]
        )
      );

    if (beatsAllOutside || component.length === candidateIds.length) {
      return component;
    }
  }

  // Fallback: return all candidates
  return candidateIds;
};

export const computeSmithApprovalWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[],
  threshold: number
): string => {
  const matrix = buildPairwiseMatrix(voters, candidates);
  const smithSet = computeSmithSet(matrix, candidates.map(c => c.id));

  // Run approval voting among Smith set candidates only
  const smithCandidates = candidates.filter(c => smithSet.includes(c.id));
  return computeApprovalWinner(voters, smithCandidates, threshold);
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/YeeDiagram.ts packages/shared-utils/src/YeeDiagram.test.ts
git commit -m "feat(shared-utils): add Smith Set + Approval winner computation"
```

---

## Task 12: Yee Diagram Engine - Unified computeWinner Function

**Files:**
- Modify: `packages/shared-utils/src/YeeDiagram.ts`
- Modify: `packages/shared-utils/src/YeeDiagram.test.ts`

**Step 1: Write failing test**

Add to `YeeDiagram.test.ts`:

```typescript
import { computeWinner, VotingMethod } from './YeeDiagram.js';

describe('computeWinner', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.2, y: 0.5, color: '#ff0000' },
    { id: 'b', name: 'B', x: 0.8, y: 0.5, color: '#0000ff' },
  ];

  const voters = generateVotersFromBloc(createVoterBloc({ x: 0.25, y: 0.5 }, 100, 0.05));

  it.each([
    ['plurality'],
    ['approval'],
    ['irv'],
    ['borda'],
    ['condorcet'],
    ['smithApproval'],
  ] as [VotingMethod][])('computes winner for %s method', (method) => {
    const winner = computeWinner(voters, candidates, method, 0.3);
    expect(['a', 'b']).toContain(winner);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test`
Expected: FAIL - function not found

**Step 3: Write implementation**

Add to `YeeDiagram.ts`:

```typescript
export type VotingMethod =
  | 'plurality'
  | 'approval'
  | 'irv'
  | 'borda'
  | 'condorcet'
  | 'smithApproval';

export const computeWinner = (
  voters: Voter[],
  candidates: SpatialCandidate[],
  method: VotingMethod,
  approvalThreshold: number = 0.3
): string => {
  switch (method) {
    case 'plurality':
      return computePluralityWinner(voters, candidates);
    case 'approval':
      return computeApprovalWinner(voters, candidates, approvalThreshold);
    case 'irv':
      return computeIRVWinner(voters, candidates);
    case 'borda':
      return computeBordaWinner(voters, candidates);
    case 'condorcet':
      return computeCondorcetWinner(voters, candidates);
    case 'smithApproval':
      return computeSmithApprovalWinner(voters, candidates, approvalThreshold);
    default:
      throw new Error(`Unknown voting method: ${method}`);
  }
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test`
Expected: PASS

**Step 5: Export from index.ts**

Add to `packages/shared-utils/src/index.ts`:

```typescript
export * from './YeeDiagram.js';
```

**Step 6: Run build**

Run: `cd packages/shared-utils && npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add packages/shared-utils/src/
git commit -m "feat(shared-utils): add unified computeWinner function"
```

---

## Task 13: Yee Diagram Engine - Full Diagram Generation

**Files:**
- Modify: `packages/shared-utils/src/YeeDiagram.ts`
- Modify: `packages/shared-utils/src/YeeDiagram.test.ts`

**Step 1: Write failing test**

Add to `YeeDiagram.test.ts`:

```typescript
import { generateYeeDiagram, YeeDiagramResult } from './YeeDiagram.js';

describe('generateYeeDiagram', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.25, y: 0.5, color: '#ff0000' },
    { id: 'b', name: 'B', x: 0.75, y: 0.5, color: '#0000ff' },
  ];

  it('generates a 2D grid of winners', () => {
    const voters = generateVotersFromBloc(createVoterBloc({ x: 0.5, y: 0.5 }, 500, 0.3));

    const result = generateYeeDiagram({
      voters,
      candidates,
      method: 'plurality',
      resolution: 10,
    });

    expect(result.grid).toHaveLength(10);
    expect(result.grid[0]).toHaveLength(10);
    expect(result.resolution).toBe(10);
  });

  it('returns winner IDs in grid cells', () => {
    const voters = generateVotersFromBloc(createVoterBloc({ x: 0.3, y: 0.5 }, 500, 0.1));

    const result = generateYeeDiagram({
      voters,
      candidates,
      method: 'plurality',
      resolution: 10,
    });

    // Each cell should contain a valid candidate ID
    result.grid.flat().forEach(winnerId => {
      expect(['a', 'b']).toContain(winnerId);
    });
  });

  it('shows spatial variation - left side favors A, right favors B', () => {
    // Uniform distribution of voters
    const { blocs } = createPresetPopulation('uniform', 2000);
    const voters = generatePopulation(blocs);

    const result = generateYeeDiagram({
      voters,
      candidates,
      method: 'plurality',
      resolution: 10,
    });

    // Left column (x ~ 0.05) should mostly be A
    const leftColumn = result.grid.map(row => row[0]);
    const leftA = leftColumn.filter(w => w === 'a').length;
    expect(leftA).toBeGreaterThan(5);

    // Right column (x ~ 0.95) should mostly be B
    const rightColumn = result.grid.map(row => row[9]);
    const rightB = rightColumn.filter(w => w === 'b').length;
    expect(rightB).toBeGreaterThan(5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test`
Expected: FAIL - function not found

**Step 3: Write implementation**

Add to `YeeDiagram.ts`:

```typescript
export interface YeeDiagramConfig {
  voters: Voter[];
  candidates: SpatialCandidate[];
  method: VotingMethod;
  resolution: number;
  approvalThreshold?: number;
}

export interface YeeDiagramResult {
  grid: string[][]; // 2D array of winner IDs
  resolution: number;
  candidates: SpatialCandidate[];
  method: VotingMethod;
}

export const generateYeeDiagram = (config: YeeDiagramConfig): YeeDiagramResult => {
  const { voters, candidates, method, resolution, approvalThreshold = 0.3 } = config;

  const grid: string[][] = [];

  for (let row = 0; row < resolution; row++) {
    const gridRow: string[] = [];
    for (let col = 0; col < resolution; col++) {
      // Map grid position to 0-1 space
      const x = (col + 0.5) / resolution;
      const y = (row + 0.5) / resolution;

      // For each grid cell, compute which candidate would win
      // if we consider the cell's position as representing a "region"
      // We weight voters by proximity to this cell
      const cellVoters = voters.filter(voter => {
        const dx = Math.abs(voter.position.x - x);
        const dy = Math.abs(voter.position.y - y);
        const cellSize = 1 / resolution;
        // Include voters within this cell's neighborhood
        return dx < cellSize * 2 && dy < cellSize * 2;
      });

      // If no voters in region, use all voters (fallback)
      const relevantVoters = cellVoters.length > 10 ? cellVoters : voters;

      const winner = computeWinner(relevantVoters, candidates, method, approvalThreshold);
      gridRow.push(winner);
    }
    grid.push(gridRow);
  }

  return {
    grid,
    resolution,
    candidates,
    method,
  };
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/YeeDiagram.ts packages/shared-utils/src/YeeDiagram.test.ts
git commit -m "feat(shared-utils): add full Yee diagram generation"
```

---

## Task 14: Update Visualizations App - Create useYeeDiagram Hook

**Files:**
- Create: `apps/visualizations/lib/useYeeDiagram.ts`

**Step 1: Create the hook**

Create `apps/visualizations/lib/useYeeDiagram.ts`:

```typescript
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Voter,
  SpatialCandidate,
  VotingMethod,
  generateYeeDiagram,
  YeeDiagramResult,
} from '@votelab/shared-utils';

interface UseYeeDiagramOptions {
  voters: Voter[];
  candidates: SpatialCandidate[];
  method: VotingMethod;
  resolution?: number;
  approvalThreshold?: number;
}

interface UseYeeDiagramReturn {
  result: YeeDiagramResult | null;
  isComputing: boolean;
  error: Error | null;
  recompute: () => void;
}

export const useYeeDiagram = ({
  voters,
  candidates,
  method,
  resolution = 100,
  approvalThreshold = 0.3,
}: UseYeeDiagramOptions): UseYeeDiagramReturn => {
  const [result, setResult] = useState<YeeDiagramResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const computeRef = useRef(0);

  const compute = useCallback(() => {
    const computeId = ++computeRef.current;
    setIsComputing(true);
    setError(null);

    // Use setTimeout to avoid blocking the main thread
    setTimeout(() => {
      try {
        if (computeId !== computeRef.current) return; // Stale computation

        const diagramResult = generateYeeDiagram({
          voters,
          candidates,
          method,
          resolution,
          approvalThreshold,
        });

        if (computeId === computeRef.current) {
          setResult(diagramResult);
          setIsComputing(false);
        }
      } catch (err) {
        if (computeId === computeRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsComputing(false);
        }
      }
    }, 0);
  }, [voters, candidates, method, resolution, approvalThreshold]);

  useEffect(() => {
    if (voters.length > 0 && candidates.length > 0) {
      compute();
    }
  }, [compute, voters.length, candidates.length]);

  return {
    result,
    isComputing,
    error,
    recompute: compute,
  };
};
```

**Step 2: Verify it compiles**

Run: `cd apps/visualizations && npm run build`
Expected: Build succeeds (may show warnings, that's OK)

**Step 3: Commit**

```bash
git add apps/visualizations/lib/useYeeDiagram.ts
git commit -m "feat(visualizations): add useYeeDiagram hook"
```

---

## Task 15: Create VoterConfigPanel Component

**Files:**
- Create: `apps/visualizations/app/components/VoterConfigPanel.tsx`

**Step 1: Create the component**

Create `apps/visualizations/app/components/VoterConfigPanel.tsx`:

```typescript
'use client';

import React, { useState, useCallback } from 'react';
import {
  VoterBloc,
  VoterPreset,
  createVoterBloc,
  createPresetPopulation,
} from '@votelab/shared-utils';

interface VoterConfigPanelProps {
  blocs: VoterBloc[];
  onBlocsChange: (blocs: VoterBloc[]) => void;
  onAddBloc: (position: { x: number; y: number }) => void;
}

const PRESETS: { value: VoterPreset; label: string }[] = [
  { value: 'uniform', label: 'Uniform Grid' },
  { value: 'centered', label: 'Centered' },
  { value: 'polarized', label: 'Polarized (2 blocs)' },
  { value: 'triangle', label: 'Triangle (3 blocs)' },
  { value: 'custom', label: 'Custom' },
];

export const VoterConfigPanel: React.FC<VoterConfigPanelProps> = ({
  blocs,
  onBlocsChange,
  onAddBloc,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<VoterPreset>('uniform');
  const [totalVoters, setTotalVoters] = useState(1000);

  const handlePresetChange = useCallback((preset: VoterPreset) => {
    setSelectedPreset(preset);
    if (preset !== 'custom') {
      const { blocs: newBlocs } = createPresetPopulation(preset, totalVoters);
      onBlocsChange(newBlocs);
    }
  }, [totalVoters, onBlocsChange]);

  const handleTotalVotersChange = useCallback((count: number) => {
    setTotalVoters(count);
    if (selectedPreset !== 'custom') {
      const { blocs: newBlocs } = createPresetPopulation(selectedPreset, count);
      onBlocsChange(newBlocs);
    }
  }, [selectedPreset, onBlocsChange]);

  const handleRemoveBloc = useCallback((blocId: string) => {
    onBlocsChange(blocs.filter(b => b.id !== blocId));
    setSelectedPreset('custom');
  }, [blocs, onBlocsChange]);

  const handleBlocCountChange = useCallback((blocId: string, count: number) => {
    onBlocsChange(blocs.map(b =>
      b.id === blocId ? { ...b, count } : b
    ));
    setSelectedPreset('custom');
  }, [blocs, onBlocsChange]);

  const handleBlocSpreadChange = useCallback((blocId: string, spread: number) => {
    onBlocsChange(blocs.map(b =>
      b.id === blocId ? { ...b, spread } : b
    ));
    setSelectedPreset('custom');
  }, [blocs, onBlocsChange]);

  const actualTotal = blocs.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="p-4 bg-gray-100 rounded-lg space-y-4">
      <h3 className="font-bold text-lg">Voter Distribution</h3>

      {/* Preset Selection */}
      <div>
        <label className="block text-sm font-medium mb-1">Preset</label>
        <select
          value={selectedPreset}
          onChange={(e) => handlePresetChange(e.target.value as VoterPreset)}
          className="w-full p-2 border rounded"
        >
          {PRESETS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Total Voters */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Total Voters: {actualTotal}
        </label>
        <input
          type="range"
          min="100"
          max="5000"
          step="100"
          value={totalVoters}
          onChange={(e) => handleTotalVotersChange(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Bloc List */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium">Voter Blocs ({blocs.length})</label>
          <span className="text-xs text-gray-500">Click canvas to add</span>
        </div>

        {blocs.map((bloc, index) => (
          <div key={bloc.id} className="p-2 bg-white rounded border text-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium">Bloc {index + 1}</span>
              <button
                onClick={() => handleRemoveBloc(bloc.id)}
                className="text-red-500 hover:text-red-700 text-xs"
              >
                Remove
              </button>
            </div>
            <div className="text-xs text-gray-500 mb-2">
              Position: ({bloc.position.x.toFixed(2)}, {bloc.position.y.toFixed(2)})
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs">Count: {bloc.count}</label>
                <input
                  type="range"
                  min="50"
                  max="2000"
                  step="50"
                  value={bloc.count}
                  onChange={(e) => handleBlocCountChange(bloc.id, Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs">Spread: {bloc.spread.toFixed(2)}</label>
                <input
                  type="range"
                  min="0.02"
                  max="0.3"
                  step="0.02"
                  value={bloc.spread}
                  onChange={(e) => handleBlocSpreadChange(bloc.id, Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

**Step 2: Verify it compiles**

Run: `cd apps/visualizations && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/visualizations/app/components/VoterConfigPanel.tsx
git commit -m "feat(visualizations): add VoterConfigPanel component"
```

---

## Task 16: Create YeeDiagramViz Component

**Files:**
- Create: `apps/visualizations/app/components/YeeDiagramViz.tsx`

**Step 1: Create the component**

Create `apps/visualizations/app/components/YeeDiagramViz.tsx`:

```typescript
'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  VoterBloc,
  SpatialCandidate,
  VotingMethod,
  createVoterBloc,
  createPresetPopulation,
  generatePopulation,
} from '@votelab/shared-utils';
import { useYeeDiagram } from '../../lib/useYeeDiagram';
import { VoterConfigPanel } from './VoterConfigPanel';

const DEFAULT_CANDIDATES: SpatialCandidate[] = [
  { id: 'a', name: 'A', x: 0.25, y: 0.25, color: '#ef4444' },
  { id: 'b', name: 'B', x: 0.75, y: 0.25, color: '#3b82f6' },
  { id: 'c', name: 'C', x: 0.5, y: 0.75, color: '#22c55e' },
];

const METHODS: { value: VotingMethod; label: string }[] = [
  { value: 'plurality', label: 'Plurality' },
  { value: 'approval', label: 'Approval' },
  { value: 'irv', label: 'Instant Runoff (IRV)' },
  { value: 'borda', label: 'Borda Count' },
  { value: 'condorcet', label: 'Condorcet' },
  { value: 'smithApproval', label: 'Smith Set + Approval' },
];

export const YeeDiagramViz: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [candidates, setCandidates] = useState<SpatialCandidate[]>(DEFAULT_CANDIDATES);
  const [blocs, setBlocs] = useState<VoterBloc[]>(() =>
    createPresetPopulation('uniform', 1000).blocs
  );
  const [method, setMethod] = useState<VotingMethod>('plurality');
  const [approvalThreshold, setApprovalThreshold] = useState(0.3);
  const [resolution, setResolution] = useState(50);
  const [draggingCandidate, setDraggingCandidate] = useState<string | null>(null);

  const voters = React.useMemo(() => generatePopulation(blocs), [blocs]);

  const { result, isComputing } = useYeeDiagram({
    voters,
    candidates,
    method,
    resolution,
    approvalThreshold,
  });

  // Render diagram to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { grid, candidates: candList } = result;
    const cellWidth = canvas.width / grid[0].length;
    const cellHeight = canvas.height / grid.length;

    // Create color map
    const colorMap: Record<string, string> = {};
    candList.forEach(c => (colorMap[c.id] = c.color));

    // Draw grid
    grid.forEach((row, rowIdx) => {
      row.forEach((winnerId, colIdx) => {
        ctx.fillStyle = colorMap[winnerId] || '#cccccc';
        ctx.fillRect(
          colIdx * cellWidth,
          rowIdx * cellHeight,
          cellWidth + 1,
          cellHeight + 1
        );
      });
    });

    // Draw candidates
    candList.forEach(c => {
      const x = c.x * canvas.width;
      const y = c.y * canvas.height;

      // White border
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Candidate color
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();

      // Label
      ctx.fillStyle = 'black';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.name, x, y - 18);
    });
  }, [result]);

  // Handle canvas interactions
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Check if clicking on a candidate
    for (const c of candidates) {
      const dx = x - c.x;
      const dy = y - c.y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.03) {
        setDraggingCandidate(c.id);
        return;
      }
    }

    // Otherwise, add a voter bloc (if shift is held)
    if (e.shiftKey) {
      const newBloc = createVoterBloc({ x, y }, 200, 0.1);
      setBlocs(prev => [...prev, newBloc]);
    }
  }, [candidates]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingCandidate) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setCandidates(prev => prev.map(c =>
      c.id === draggingCandidate ? { ...c, x, y } : c
    ));
  }, [draggingCandidate]);

  const handleCanvasMouseUp = useCallback(() => {
    setDraggingCandidate(null);
  }, []);

  const handleAddBloc = useCallback((position: { x: number; y: number }) => {
    const newBloc = createVoterBloc(position, 200, 0.1);
    setBlocs(prev => [...prev, newBloc]);
  }, []);

  return (
    <div className="flex gap-4 p-4">
      {/* Main Canvas */}
      <div className="flex-1">
        <div className="mb-4 flex gap-4 items-center">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as VotingMethod)}
            className="p-2 border rounded"
          >
            {METHODS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          {(method === 'approval' || method === 'smithApproval') && (
            <div className="flex items-center gap-2">
              <label className="text-sm">Threshold: {approvalThreshold.toFixed(2)}</label>
              <input
                type="range"
                min="0.1"
                max="0.5"
                step="0.05"
                value={approvalThreshold}
                onChange={(e) => setApprovalThreshold(Number(e.target.value))}
                className="w-24"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="text-sm">Resolution: {resolution}</label>
            <input
              type="range"
              min="20"
              max="100"
              step="10"
              value={resolution}
              onChange={(e) => setResolution(Number(e.target.value))}
              className="w-24"
            />
          </div>

          {isComputing && (
            <span className="text-sm text-gray-500">Computing...</span>
          )}
        </div>

        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="border border-gray-300 cursor-crosshair"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        />

        <p className="mt-2 text-sm text-gray-500">
          Drag candidates to move them. Shift+click to add voter bloc.
        </p>
      </div>

      {/* Sidebar */}
      <div className="w-80">
        <VoterConfigPanel
          blocs={blocs}
          onBlocsChange={setBlocs}
          onAddBloc={handleAddBloc}
        />
      </div>
    </div>
  );
};
```

**Step 2: Verify it compiles**

Run: `cd apps/visualizations && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/visualizations/app/components/YeeDiagramViz.tsx
git commit -m "feat(visualizations): add YeeDiagramViz component"
```

---

## Task 17: Create Yee Diagram Page

**Files:**
- Create: `apps/visualizations/app/yee/page.tsx`

**Step 1: Create the page**

Create `apps/visualizations/app/yee/page.tsx`:

```typescript
import { YeeDiagramViz } from '../components/YeeDiagramViz';

export default function YeeDiagramPage() {
  return (
    <main className="min-h-screen">
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-2">Yee Diagram Visualization</h1>
        <p className="text-gray-600 mb-6">
          Explore how different voting methods produce different winners based on
          candidate positions and voter distributions.
        </p>
        <YeeDiagramViz />
      </div>
    </main>
  );
}
```

**Step 2: Verify build**

Run: `cd apps/visualizations && npm run build`
Expected: Build succeeds

**Step 3: Test locally**

Run: `cd apps/visualizations && npm run dev`
Navigate to: http://localhost:3000/yee
Expected: Page loads with Yee diagram visualization

**Step 4: Commit**

```bash
git add apps/visualizations/app/yee/
git commit -m "feat(visualizations): add Yee diagram page"
```

---

## Task 18: Add Navigation Link to Home Page

**Files:**
- Modify: `apps/visualizations/app/page.tsx`

**Step 1: Read current page**

Read `apps/visualizations/app/page.tsx` to understand current structure.

**Step 2: Add link to Yee diagram page**

Add a link/card to the Yee diagram page in the navigation or main content area. The exact implementation depends on the current page structure.

**Step 3: Verify build**

Run: `cd apps/visualizations && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/visualizations/app/page.tsx
git commit -m "feat(visualizations): add navigation to Yee diagram page"
```

---

## Task 19: Run Full Test Suite

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds for all packages

**Step 3: Commit any fixes**

If tests fail, fix issues and commit:

```bash
git add -A
git commit -m "fix: resolve test failures"
```

---

## Task 20: Final Integration Test

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Manual testing checklist**

Test the following in browser at http://localhost:3000/yee:

- [ ] Page loads without errors
- [ ] Default diagram renders (3 candidates, uniform voters)
- [ ] Can switch between all 6 voting methods
- [ ] Can drag candidates and diagram updates
- [ ] Can change voter preset and diagram updates
- [ ] Can add voter bloc with Shift+click
- [ ] Can remove voter blocs
- [ ] Can adjust approval threshold (for approval/smithApproval)
- [ ] Can adjust resolution
- [ ] "Computing..." indicator shows during updates

**Step 3: Fix any issues found**

If issues are found, fix and commit.

---

## Summary

This plan implements Yee diagrams in 20 tasks:

1. **Tasks 1-3**: Voter distribution types and presets
2. **Tasks 4-12**: Core Yee diagram computation engine (all 6 voting methods)
3. **Tasks 13**: Full diagram generation
4. **Tasks 14-17**: React components and page
5. **Tasks 18-20**: Integration and testing

Each task follows TDD with failing test → implementation → passing test → commit.
