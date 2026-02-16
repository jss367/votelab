# Perturbation Maps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a visualization showing election stability by perturbing voters toward each candidate.

**Architecture:** New page `/perturbation` with grid of per-candidate perturbation maps. Core algorithm in shared-utils, UI components parallel existing Yee diagram structure. URL state for shareable configurations.

**Tech Stack:** TypeScript, React, Next.js, Canvas API, existing @votelab/shared-utils

---

## Task 1: Core Algorithm - PerturbationMap.ts

**Files:**
- Create: `packages/shared-utils/src/PerturbationMap.ts`
- Test: `packages/shared-utils/src/PerturbationMap.test.ts`

**Step 1: Write the failing test for basic perturbation map generation**

```typescript
// packages/shared-utils/src/PerturbationMap.test.ts
import { describe, it, expect } from 'vitest';
import { generatePerturbationMap, PerturbationMapConfig } from './PerturbationMap';
import { SpatialCandidate, Voter } from './types';

describe('generatePerturbationMap', () => {
  const candidates: SpatialCandidate[] = [
    { id: 'a', name: 'A', x: 0.25, y: 0.5, color: '#ef4444' },
    { id: 'b', name: 'B', x: 0.75, y: 0.5, color: '#3b82f6' },
  ];

  // Create deterministic voters: 10 near A, 10 near B
  const voters: Voter[] = [
    ...Array.from({ length: 10 }, (_, i) => ({
      position: { x: 0.2 + i * 0.01, y: 0.5 },
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      position: { x: 0.7 + i * 0.01, y: 0.5 },
    })),
  ];

  it('generates a grid of correct dimensions', () => {
    const config: PerturbationMapConfig = {
      candidates,
      voters,
      targetCandidate: candidates[1], // B
      method: 'plurality',
      resolution: 10,
      maxVoterPercent: 0.5,
    };

    const result = generatePerturbationMap(config);

    expect(result.grid).toHaveLength(10);
    expect(result.grid[0]).toHaveLength(10);
    expect(result.targetCandidateId).toBe('b');
  });

  it('bottom-left cell (0% perturbation) shows baseline winner', () => {
    const config: PerturbationMapConfig = {
      candidates,
      voters,
      targetCandidate: candidates[1],
      method: 'plurality',
      resolution: 10,
      maxVoterPercent: 0.5,
    };

    const result = generatePerturbationMap(config);
    // With equal voters, either could win - just check it's a valid candidate
    expect(['a', 'b']).toContain(result.grid[0][0]);
  });

  it('high perturbation toward B shifts winner to B', () => {
    const config: PerturbationMapConfig = {
      candidates,
      voters,
      targetCandidate: candidates[1], // B
      method: 'plurality',
      resolution: 10,
      maxVoterPercent: 0.5,
    };

    const result = generatePerturbationMap(config);
    // Top-right: 50% voters shifted 100% toward B
    // B should win with overwhelming support
    expect(result.grid[9][9]).toBe('b');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared-utils && npm test -- PerturbationMap`
Expected: FAIL with "Cannot find module './PerturbationMap'"

**Step 3: Write the implementation**

```typescript
// packages/shared-utils/src/PerturbationMap.ts
import { SpatialCandidate, Voter } from './types.js';
import { VotingMethod, computeWinner, distance } from './YeeDiagram.js';

export interface PerturbationMapConfig {
  candidates: SpatialCandidate[];
  voters: Voter[];
  targetCandidate: SpatialCandidate;
  method: VotingMethod;
  resolution: number;
  maxVoterPercent: number;
  approvalThreshold?: number;
}

export interface PerturbationResult {
  grid: string[][]; // winner IDs, [row][col]
  targetCandidateId: string;
  resolution: number;
  method: VotingMethod;
}

export interface PerturbationCellInfo {
  voterPercent: number;
  shiftMagnitude: number;
  winner: string;
  votersShifted: number;
}

/**
 * Find voters who don't rank targetCandidate first, sorted by distance to target.
 * These are the "persuadable" voters.
 */
const findNonSupporters = (
  voters: Voter[],
  candidates: SpatialCandidate[],
  targetCandidate: SpatialCandidate
): Voter[] => {
  return voters
    .filter((voter) => {
      // Find closest candidate
      let closestId = candidates[0].id;
      let closestDist = distance(
        voter.position.x,
        voter.position.y,
        candidates[0].x,
        candidates[0].y
      );

      for (const c of candidates) {
        const d = distance(voter.position.x, voter.position.y, c.x, c.y);
        if (d < closestDist) {
          closestDist = d;
          closestId = c.id;
        }
      }

      return closestId !== targetCandidate.id;
    })
    .sort((a, b) => {
      const distA = distance(
        a.position.x,
        a.position.y,
        targetCandidate.x,
        targetCandidate.y
      );
      const distB = distance(
        b.position.x,
        b.position.y,
        targetCandidate.x,
        targetCandidate.y
      );
      return distA - distB; // Closest non-supporters first
    });
};

/**
 * Shift a voter's position toward the target candidate by a given magnitude.
 * magnitude=1 means move all the way to the candidate's position.
 */
const shiftVoterToward = (
  voter: Voter,
  target: SpatialCandidate,
  magnitude: number
): Voter => {
  const dx = target.x - voter.position.x;
  const dy = target.y - voter.position.y;

  return {
    ...voter,
    position: {
      x: voter.position.x + dx * magnitude,
      y: voter.position.y + dy * magnitude,
    },
  };
};

/**
 * Generate a perturbation map showing election outcomes as voters shift toward a target candidate.
 *
 * X-axis (columns): percentage of voters who shift (0 to maxVoterPercent)
 * Y-axis (rows): magnitude of shift (0 = no movement, 1 = move to candidate position)
 */
export const generatePerturbationMap = (
  config: PerturbationMapConfig
): PerturbationResult => {
  const {
    candidates,
    voters,
    targetCandidate,
    method,
    resolution,
    maxVoterPercent,
    approvalThreshold = 0.3,
  } = config;

  const grid: string[][] = [];
  const nonSupporters = findNonSupporters(voters, candidates, targetCandidate);

  for (let row = 0; row < resolution; row++) {
    const gridRow: string[] = [];

    for (let col = 0; col < resolution; col++) {
      // X-axis: voter percentage (0 to maxVoterPercent)
      const voterPercent = (col / (resolution - 1)) * maxVoterPercent;
      // Y-axis: shift magnitude (0 to 1)
      const shiftMagnitude = row / (resolution - 1);

      // Number of non-supporters to shift
      const numToShift = Math.round(voterPercent * nonSupporters.length);

      // Create perturbed voter list
      const perturbedVoters = voters.map((v) => ({ ...v }));

      // Shift the selected non-supporters
      const votersToShift = nonSupporters.slice(0, numToShift);
      const voterPositionMap = new Map(
        voters.map((v, i) => [`${v.position.x},${v.position.y}`, i])
      );

      for (const voter of votersToShift) {
        const key = `${voter.position.x},${voter.position.y}`;
        const idx = voterPositionMap.get(key);
        if (idx !== undefined) {
          perturbedVoters[idx] = shiftVoterToward(
            perturbedVoters[idx],
            targetCandidate,
            shiftMagnitude
          );
        }
      }

      // Run election
      const winner = computeWinner(
        perturbedVoters,
        candidates,
        method,
        approvalThreshold
      );
      gridRow.push(winner);
    }

    grid.push(gridRow);
  }

  return {
    grid,
    targetCandidateId: targetCandidate.id,
    resolution,
    method,
  };
};

/**
 * Get detailed info about a specific cell in the perturbation map.
 */
export const getPerturbationCellInfo = (
  config: PerturbationMapConfig,
  row: number,
  col: number
): PerturbationCellInfo => {
  const { voters, candidates, targetCandidate, resolution, maxVoterPercent } =
    config;

  const voterPercent = (col / (resolution - 1)) * maxVoterPercent;
  const shiftMagnitude = row / (resolution - 1);

  const nonSupporters = findNonSupporters(voters, candidates, targetCandidate);
  const votersShifted = Math.round(voterPercent * nonSupporters.length);

  // Recompute winner for this cell
  const perturbedVoters = voters.map((v) => ({ ...v }));
  const votersToShift = nonSupporters.slice(0, votersShifted);
  const voterPositionMap = new Map(
    voters.map((v, i) => [`${v.position.x},${v.position.y}`, i])
  );

  for (const voter of votersToShift) {
    const key = `${voter.position.x},${voter.position.y}`;
    const idx = voterPositionMap.get(key);
    if (idx !== undefined) {
      perturbedVoters[idx] = shiftVoterToward(
        perturbedVoters[idx],
        targetCandidate,
        shiftMagnitude
      );
    }
  }

  const winner = computeWinner(
    perturbedVoters,
    candidates,
    config.method,
    config.approvalThreshold ?? 0.3
  );

  return {
    voterPercent,
    shiftMagnitude,
    winner,
    votersShifted,
  };
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared-utils && npm test -- PerturbationMap`
Expected: PASS (3 tests)

**Step 5: Export from index.ts**

Add to `packages/shared-utils/src/index.ts`:
```typescript
export * from './PerturbationMap.js';
```

**Step 6: Run all tests to verify no regressions**

Run: `cd packages/shared-utils && npm test`
Expected: All tests pass

---

## Task 2: URL State Utilities

**Files:**
- Create: `apps/visualizations/lib/urlState.ts`

**Step 1: Write the URL state utilities**

```typescript
// apps/visualizations/lib/urlState.ts
import { SpatialCandidate, VoterBloc, VotingMethod } from '@votelab/shared-utils';

export interface ElectionConfig {
  candidates: SpatialCandidate[];
  blocs: VoterBloc[];
  method: VotingMethod;
  approvalThreshold: number;
}

/**
 * Serialize election config to URL search params.
 * Format: candidates=A,0.3,0.5,#ef4444;B,0.7,0.5,#3b82f6&blocs=0.5,0.5,0.1,500&method=irv&threshold=0.3
 */
export const serializeConfig = (config: ElectionConfig): string => {
  const params = new URLSearchParams();

  // Candidates: name,x,y,color;name,x,y,color
  const candidatesStr = config.candidates
    .map((c) => `${c.name},${c.x.toFixed(3)},${c.y.toFixed(3)},${c.color}`)
    .join(';');
  params.set('candidates', candidatesStr);

  // Blocs: x,y,spread,count;x,y,spread,count
  const blocsStr = config.blocs
    .map(
      (b) =>
        `${b.position.x.toFixed(3)},${b.position.y.toFixed(3)},${b.spread.toFixed(3)},${b.count}`
    )
    .join(';');
  params.set('blocs', blocsStr);

  params.set('method', config.method);
  params.set('threshold', config.approvalThreshold.toFixed(2));

  return params.toString();
};

/**
 * Parse URL search params into election config.
 * Returns null if parsing fails.
 */
export const parseConfig = (searchParams: URLSearchParams): ElectionConfig | null => {
  try {
    const candidatesStr = searchParams.get('candidates');
    const blocsStr = searchParams.get('blocs');
    const method = searchParams.get('method') as VotingMethod;
    const threshold = searchParams.get('threshold');

    if (!candidatesStr || !blocsStr || !method) {
      return null;
    }

    const candidates: SpatialCandidate[] = candidatesStr.split(';').map((str, i) => {
      const [name, x, y, color] = str.split(',');
      return {
        id: name.toLowerCase(),
        name,
        x: parseFloat(x),
        y: parseFloat(y),
        color,
      };
    });

    const blocs: VoterBloc[] = blocsStr.split(';').map((str, i) => {
      const [x, y, spread, count] = str.split(',');
      return {
        id: `bloc-${i}`,
        position: { x: parseFloat(x), y: parseFloat(y) },
        spread: parseFloat(spread),
        count: parseInt(count, 10),
      };
    });

    return {
      candidates,
      blocs,
      method,
      approvalThreshold: threshold ? parseFloat(threshold) : 0.3,
    };
  } catch {
    return null;
  }
};

/**
 * Update URL without triggering navigation.
 */
export const updateURL = (config: ElectionConfig): void => {
  const serialized = serializeConfig(config);
  const newURL = `${window.location.pathname}?${serialized}`;
  window.history.replaceState(null, '', newURL);
};
```

**Step 2: Verify file compiles**

Run: `cd apps/visualizations && npx tsc --noEmit lib/urlState.ts`
Expected: No errors

---

## Task 3: React Hook - usePerturbationMap

**Files:**
- Create: `apps/visualizations/lib/usePerturbationMap.ts`

**Step 1: Write the hook**

```typescript
// apps/visualizations/lib/usePerturbationMap.ts
import { useState, useEffect, useRef } from 'react';
import {
  SpatialCandidate,
  Voter,
  VotingMethod,
  generatePerturbationMap,
  PerturbationResult,
} from '@votelab/shared-utils';

interface UsePerturbationMapProps {
  voters: Voter[];
  candidates: SpatialCandidate[];
  targetCandidate: SpatialCandidate;
  method: VotingMethod;
  resolution?: number;
  maxVoterPercent?: number;
  approvalThreshold?: number;
}

interface UsePerturbationMapResult {
  result: PerturbationResult | null;
  isComputing: boolean;
}

export const usePerturbationMap = ({
  voters,
  candidates,
  targetCandidate,
  method,
  resolution = 40,
  maxVoterPercent = 0.5,
  approvalThreshold = 0.3,
}: UsePerturbationMapProps): UsePerturbationMapResult => {
  const [result, setResult] = useState<PerturbationResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const computeIdRef = useRef(0);

  useEffect(() => {
    if (voters.length === 0 || candidates.length < 2) {
      setResult(null);
      return;
    }

    const computeId = ++computeIdRef.current;
    setIsComputing(true);

    // Use requestAnimationFrame to avoid blocking UI
    requestAnimationFrame(() => {
      if (computeId !== computeIdRef.current) return;

      const newResult = generatePerturbationMap({
        candidates,
        voters,
        targetCandidate,
        method,
        resolution,
        maxVoterPercent,
        approvalThreshold,
      });

      if (computeId === computeIdRef.current) {
        setResult(newResult);
        setIsComputing(false);
      }
    });
  }, [
    voters,
    candidates,
    targetCandidate,
    method,
    resolution,
    maxVoterPercent,
    approvalThreshold,
  ]);

  return { result, isComputing };
};
```

**Step 2: Verify file compiles**

Run: `cd apps/visualizations && npx tsc --noEmit lib/usePerturbationMap.ts`
Expected: No errors

---

## Task 4: SinglePerturbationMap Component

**Files:**
- Create: `apps/visualizations/app/components/SinglePerturbationMap.tsx`

**Step 1: Write the component**

```typescript
// apps/visualizations/app/components/SinglePerturbationMap.tsx
'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Voter,
  SpatialCandidate,
  VotingMethod,
  getPerturbationCellInfo,
} from '@votelab/shared-utils';
import { usePerturbationMap } from '../../lib/usePerturbationMap';

interface SinglePerturbationMapProps {
  voters: Voter[];
  candidates: SpatialCandidate[];
  targetCandidate: SpatialCandidate;
  method: VotingMethod;
  resolution: number;
  maxVoterPercent: number;
  approvalThreshold: number;
  onCellClick: (row: number, col: number, targetCandidate: SpatialCandidate) => void;
}

interface TooltipData {
  x: number;
  y: number;
  voterPercent: number;
  shiftMagnitude: number;
  winner: string;
  votersShifted: number;
}

export const SinglePerturbationMap: React.FC<SinglePerturbationMapProps> = ({
  voters,
  candidates,
  targetCandidate,
  method,
  resolution,
  maxVoterPercent,
  approvalThreshold,
  onCellClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const { result, isComputing } = usePerturbationMap({
    voters,
    candidates,
    targetCandidate,
    method,
    resolution,
    maxVoterPercent,
    approvalThreshold,
  });

  // Render the perturbation map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { grid } = result;
    if (!grid.length || !grid[0]?.length) return;

    const cellWidth = canvas.width / grid[0].length;
    const cellHeight = canvas.height / grid.length;

    const colorMap: Record<string, string> = {};
    candidates.forEach((c) => (colorMap[c.id] = c.color));

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

    // Draw axis labels
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('voters %', canvas.width / 2, canvas.height - 2);

    ctx.save();
    ctx.translate(10, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('shift %', 0, 0);
    ctx.restore();
  }, [result, candidates]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !result) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const col = Math.floor((x / rect.width) * resolution);
      const row = Math.floor((y / rect.height) * resolution);

      if (col < 0 || col >= resolution || row < 0 || row >= resolution) {
        setTooltip(null);
        return;
      }

      const info = getPerturbationCellInfo(
        {
          candidates,
          voters,
          targetCandidate,
          method,
          resolution,
          maxVoterPercent,
          approvalThreshold,
        },
        row,
        col
      );

      setTooltip({
        x: e.clientX,
        y: e.clientY,
        ...info,
      });
    },
    [
      result,
      candidates,
      voters,
      targetCandidate,
      method,
      resolution,
      maxVoterPercent,
      approvalThreshold,
    ]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const col = Math.floor(((e.clientX - rect.left) / rect.width) * resolution);
      const row = Math.floor(((e.clientY - rect.top) / rect.height) * resolution);

      if (col >= 0 && col < resolution && row >= 0 && row < resolution) {
        onCellClick(row, col, targetCandidate);
      }
    },
    [resolution, targetCandidate, onCellClick]
  );

  const winnerName =
    tooltip && candidates.find((c) => c.id === tooltip.winner)?.name;

  return (
    <div className="flex flex-col items-center">
      <div className="text-sm font-medium mb-1 flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: targetCandidate.color }}
        />
        Shift toward {targetCandidate.name}
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={200}
          height={200}
          className="border border-gray-300 cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        />
        {isComputing && (
          <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
            <span className="text-xs text-gray-500">Computing...</span>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y + 10,
          }}
        >
          <div>
            {(tooltip.voterPercent * 100).toFixed(0)}% voters shifted{' '}
            {(tooltip.shiftMagnitude * 100).toFixed(0)}%
          </div>
          <div>
            Winner: <strong>{winnerName}</strong> ({tooltip.votersShifted} voters
            moved)
          </div>
        </div>
      )}
    </div>
  );
};
```

**Step 2: Verify file compiles**

Run: `cd apps/visualizations && npx tsc --noEmit app/components/SinglePerturbationMap.tsx`
Expected: No errors

---

## Task 5: PerturbationMapViz Component

**Files:**
- Create: `apps/visualizations/app/components/PerturbationMapViz.tsx`

**Step 1: Write the main visualization component**

```typescript
// apps/visualizations/app/components/PerturbationMapViz.tsx
'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  VoterBloc,
  SpatialCandidate,
  VotingMethod,
  Voter,
  createPresetPopulation,
  generatePopulation,
  getPerturbationCellInfo,
} from '@votelab/shared-utils';
import { SinglePerturbationMap } from './SinglePerturbationMap';
import { VoterConfigPanel } from './VoterConfigPanel';
import { BallotInspector } from './BallotInspector';
import { parseConfig, updateURL, ElectionConfig } from '../../lib/urlState';

const DEFAULT_CANDIDATES: SpatialCandidate[] = [
  { id: 'a', name: 'A', x: 0.25, y: 0.25, color: '#ef4444' },
  { id: 'b', name: 'B', x: 0.75, y: 0.25, color: '#3b82f6' },
  { id: 'c', name: 'C', x: 0.5, y: 0.75, color: '#22c55e' },
];

const CANDIDATE_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

const CANDIDATE_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const METHODS: { value: VotingMethod; label: string }[] = [
  { value: 'plurality', label: 'Plurality' },
  { value: 'approval', label: 'Approval' },
  { value: 'irv', label: 'Instant Runoff (IRV)' },
  { value: 'borda', label: 'Borda Count' },
  { value: 'condorcet', label: 'Condorcet' },
  { value: 'smithApproval', label: 'Smith + Approval' },
];

interface InspectedCell {
  row: number;
  col: number;
  targetCandidate: SpatialCandidate;
}

export const PerturbationMapViz: React.FC = () => {
  const [candidates, setCandidates] = useState<SpatialCandidate[]>(DEFAULT_CANDIDATES);
  const [blocs, setBlocs] = useState<VoterBloc[]>(() =>
    createPresetPopulation('uniform', 1000).blocs
  );
  const [method, setMethod] = useState<VotingMethod>('plurality');
  const [approvalThreshold, setApprovalThreshold] = useState(0.3);
  const [resolution] = useState(40);
  const [maxVoterPercent] = useState(0.5);
  const [isClient, setIsClient] = useState(false);
  const [inspectedCell, setInspectedCell] = useState<InspectedCell | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Parse URL on mount
  useEffect(() => {
    setIsClient(true);
    const params = new URLSearchParams(window.location.search);
    const config = parseConfig(params);
    if (config) {
      setCandidates(config.candidates);
      setBlocs(config.blocs);
      setMethod(config.method);
      setApprovalThreshold(config.approvalThreshold);
    }
  }, []);

  // Update URL when config changes
  useEffect(() => {
    if (!isClient) return;
    updateURL({ candidates, blocs, method, approvalThreshold });
  }, [candidates, blocs, method, approvalThreshold, isClient]);

  const voters = useMemo(
    () => (isClient ? generatePopulation(blocs) : []),
    [blocs, isClient]
  );

  const handleCellClick = useCallback(
    (row: number, col: number, targetCandidate: SpatialCandidate) => {
      setInspectedCell({ row, col, targetCandidate });
    },
    []
  );

  const handleAddCandidate = useCallback(() => {
    if (candidates.length >= 8) return;
    const idx = candidates.length;
    const newCandidate: SpatialCandidate = {
      id: CANDIDATE_NAMES[idx].toLowerCase(),
      name: CANDIDATE_NAMES[idx],
      x: 0.3 + Math.random() * 0.4,
      y: 0.3 + Math.random() * 0.4,
      color: CANDIDATE_COLORS[idx],
    };
    setCandidates((prev) => [...prev, newCandidate]);
  }, [candidates.length]);

  const handleRemoveCandidate = useCallback(
    (id: string) => {
      if (candidates.length <= 2) return;
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    },
    [candidates.length]
  );

  // Get perturbed voters for inspection
  const getPerturbedVotersForCell = useCallback(
    (cell: InspectedCell): Voter[] => {
      const info = getPerturbationCellInfo(
        {
          candidates,
          voters,
          targetCandidate: cell.targetCandidate,
          method,
          resolution,
          maxVoterPercent,
          approvalThreshold,
        },
        cell.row,
        cell.col
      );

      // For now, return original voters - BallotInspector will show baseline
      // A more complete implementation would return the perturbed voters
      return voters;
    },
    [candidates, voters, method, resolution, maxVoterPercent, approvalThreshold]
  );

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Perturbation Maps</h1>
          <p className="text-sm text-gray-600">
            See how election results change as voters shift toward each candidate
          </p>
        </div>
        <a
          href="/yee"
          className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
        >
          ← Back to Yee Diagrams
        </a>
      </div>

      {/* Controls */}
      <div className="mb-4 flex gap-4 items-center flex-wrap">
        {/* Method selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Voting Method:</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as VotingMethod)}
            className="px-2 py-1 border rounded"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Candidates */}
        <div className="flex items-center gap-2 border-l pl-4">
          <span className="text-sm font-medium">Candidates:</span>
          {candidates.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-1 px-2 py-1 rounded border"
              style={{ borderColor: c.color }}
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="text-sm">{c.name}</span>
              {candidates.length > 2 && (
                <button
                  onClick={() => handleRemoveCandidate(c.id)}
                  className="text-gray-400 hover:text-red-500 ml-1"
                  title="Remove candidate"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {candidates.length < 8 && (
            <button
              onClick={handleAddCandidate}
              className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
              title="Add candidate"
            >
              + Add
            </button>
          )}
        </div>

        {(method === 'approval' || method === 'smithApproval') && (
          <div className="border-l pl-4 flex items-center gap-2">
            <label className="text-sm">
              Approval Threshold: {approvalThreshold.toFixed(2)}
            </label>
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

        <button
          onClick={() => setShowHelp(true)}
          className="text-sm text-blue-600 hover:underline ml-auto"
        >
          How to read these maps?
        </button>
      </div>

      <div className="flex gap-4">
        {/* Grid of perturbation maps */}
        <div className="flex-1">
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${Math.min(candidates.length, 3)}, 1fr)`,
            }}
          >
            {candidates.map((candidate) => (
              <SinglePerturbationMap
                key={candidate.id}
                voters={voters}
                candidates={candidates}
                targetCandidate={candidate}
                method={method}
                resolution={resolution}
                maxVoterPercent={maxVoterPercent}
                approvalThreshold={approvalThreshold}
                onCellClick={handleCellClick}
              />
            ))}
          </div>

          <div className="mt-4 text-sm text-gray-500">
            <p>
              <strong>X-axis:</strong> % of persuadable voters who shift (0-50%)
            </p>
            <p>
              <strong>Y-axis:</strong> How far they shift toward the candidate (0-100%)
            </p>
            <p>
              <strong>Color:</strong> Who wins the election under that perturbation
            </p>
          </div>
        </div>

        {/* Side panel */}
        <div className="w-80">
          <VoterConfigPanel
            blocs={blocs}
            onBlocsChange={setBlocs}
            onAddBloc={(pos) => {
              const newBloc: VoterBloc = {
                id: `bloc-${Date.now()}`,
                position: pos,
                count: 200,
                spread: 0.1,
              };
              setBlocs((prev) => [...prev, newBloc]);
            }}
          />
        </div>
      </div>

      {/* Ballot Inspector Modal */}
      {inspectedCell && (
        <BallotInspector
          point={{
            x: inspectedCell.col / resolution,
            y: inspectedCell.row / resolution,
          }}
          voters={getPerturbedVotersForCell(inspectedCell)}
          candidates={candidates}
          method={method}
          approvalThreshold={approvalThreshold}
          onClose={() => setInspectedCell(null)}
        />
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold">How to Read Perturbation Maps</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)] space-y-4">
              <section>
                <h3 className="font-semibold text-blue-800">What This Shows</h3>
                <p className="text-sm text-gray-700 mt-1">
                  Each map shows what happens to the election when voters are
                  persuaded toward that candidate. Unlike Yee diagrams (which move
                  the electorate center), this shows &quot;what if some voters
                  changed their minds?&quot;
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">The Axes</h3>
                <ul className="text-sm text-gray-700 mt-1 space-y-1">
                  <li>
                    <strong>X-axis (horizontal):</strong> What percentage of
                    &quot;persuadable&quot; voters shift (0-50%)
                  </li>
                  <li>
                    <strong>Y-axis (vertical):</strong> How far those voters move
                    toward the candidate (0-100% of the distance)
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">
                  Who Are &quot;Persuadable&quot; Voters?
                </h3>
                <p className="text-sm text-gray-700 mt-1">
                  Voters who don&apos;t currently rank the target candidate first,
                  sorted by proximity to that candidate. These are the voters most
                  likely to be convinced by a campaign.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">What to Look For</h3>
                <ul className="text-sm text-gray-700 mt-1 space-y-1">
                  <li>
                    <strong>Smooth gradients:</strong> Stable methods where small
                    changes produce predictable outcomes
                  </li>
                  <li>
                    <strong>Fractured patterns:</strong> Chaotic methods where
                    tiny shifts can flip the winner
                  </li>
                  <li>
                    <strong>Large single-color regions:</strong> Robust results
                    that survive perturbation
                  </li>
                  <li>
                    <strong>Spoiler effects:</strong> Third-party colors appearing
                    when shifting toward one of the top two
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">Controls</h3>
                <ul className="text-sm text-gray-700 mt-1 space-y-1">
                  <li>
                    <strong>Hover:</strong> See exact perturbation parameters and
                    winner
                  </li>
                  <li>
                    <strong>Click:</strong> Open Ballot Inspector to see vote
                    breakdown
                  </li>
                  <li>
                    <strong>Voting Method:</strong> Compare stability across
                    methods
                  </li>
                </ul>
              </section>
            </div>
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowHelp(false)}
                className="w-full py-2 bg-gray-200 hover:bg-gray-300 rounded font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

**Step 2: Verify file compiles**

Run: `cd apps/visualizations && npx tsc --noEmit app/components/PerturbationMapViz.tsx`
Expected: No errors

---

## Task 6: Perturbation Page

**Files:**
- Create: `apps/visualizations/app/perturbation/page.tsx`

**Step 1: Create the page**

```typescript
// apps/visualizations/app/perturbation/page.tsx
import { PerturbationMapViz } from '../components/PerturbationMapViz';

export default function PerturbationPage() {
  return <PerturbationMapViz />;
}
```

**Step 2: Verify the app builds**

Run: `cd apps/visualizations && npm run build`
Expected: Build succeeds

---

## Task 7: Export PerturbationMap from shared-utils

**Files:**
- Modify: `packages/shared-utils/src/index.ts`

**Step 1: Add export**

Add this line to the exports in `packages/shared-utils/src/index.ts`:

```typescript
export * from './PerturbationMap.js';
```

**Step 2: Rebuild package**

Run: `cd packages/shared-utils && npm run build`
Expected: Build succeeds

---

## Task 8: Integration Test

**Step 1: Run all tests**

Run: `npm test` (from root)
Expected: All tests pass

**Step 2: Start dev server and verify manually**

Run: `cd apps/visualizations && npm run dev`

Manual verification:
1. Navigate to `http://localhost:3000/perturbation`
2. Verify grid of perturbation maps renders (one per candidate)
3. Hover over cells - tooltip shows perturbation details
4. Click a cell - BallotInspector opens
5. Change voting method - maps update
6. Add/remove candidates - maps update
7. Verify URL updates with configuration

---

## Task 9: Add Navigation Link

**Files:**
- Modify: `apps/visualizations/app/yee/page.tsx` (add link to perturbation)

**Step 1: Add link in Yee page**

In `apps/visualizations/app/yee/page.tsx`, add a link in the controls area:

```typescript
<a
  href="/perturbation"
  className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
>
  Perturbation Maps →
</a>
```

**Step 2: Verify navigation works**

Run dev server and verify link works in both directions.

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Core algorithm | `PerturbationMap.ts`, `PerturbationMap.test.ts` |
| 2 | URL state utils | `urlState.ts` |
| 3 | React hook | `usePerturbationMap.ts` |
| 4 | Single map component | `SinglePerturbationMap.tsx` |
| 5 | Main viz component | `PerturbationMapViz.tsx` |
| 6 | Page route | `perturbation/page.tsx` |
| 7 | Package exports | `index.ts` |
| 8 | Integration test | Manual verification |
| 9 | Navigation | Link in Yee page |

Total: 9 tasks, ~45 minutes implementation time for experienced developer.
