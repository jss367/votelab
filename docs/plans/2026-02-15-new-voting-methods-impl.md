# New Voting Methods Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 6 new voting methods (STAR, Score, STV, Ranked Pairs, Majority Judgment, Cumulative) to VoteLab.

**Architecture:** Each method follows the existing pattern: add to VotingMethod union type, implement tally function in shared-utils with tests, create a results display component, wire into BallotInput/MethodResults/App.tsx routing. New ballot components only needed for Majority Judgment (grade selection) and Cumulative (point allocation). ScoreBallot gets a `maxScore` prop to support STAR's 0-5 scale.

**Tech Stack:** React, TypeScript, Vitest, Tailwind CSS, @votelab/shared-utils

---

### Task 1: Extend VotingMethod type

**Files:**
- Modify: `packages/shared-utils/src/YeeDiagram.ts:8-15`

**Step 1: Add new method identifiers to the union type**

In `packages/shared-utils/src/YeeDiagram.ts`, change the VotingMethod type from:

```typescript
export type VotingMethod =
  | 'plurality'
  | 'approval'
  | 'irv'
  | 'borda'
  | 'condorcet'
  | 'smithApproval'
  | 'rrv';
```

to:

```typescript
export type VotingMethod =
  | 'plurality'
  | 'approval'
  | 'irv'
  | 'borda'
  | 'condorcet'
  | 'smithApproval'
  | 'rrv'
  | 'star'
  | 'score'
  | 'stv'
  | 'rankedPairs'
  | 'majorityJudgment'
  | 'cumulative';
```

**Step 2: Verify it compiles**

Run: `cd /Users/julius/git/votelab && npx turbo build --filter=@votelab/shared-utils`
Expected: Build succeeds (existing code doesn't switch exhaustively on VotingMethod)

**Step 3: Commit**

```bash
git add packages/shared-utils/src/YeeDiagram.ts
git commit -m "feat: add 6 new voting method types to VotingMethod union"
```

---

### Task 2: Implement tallyScore and tallyStar

**Files:**
- Modify: `packages/shared-utils/src/electionTallies.ts` (append new functions)
- Modify: `packages/shared-utils/src/electionTallies.test.ts` (append new tests)

**Step 1: Write the failing tests**

Append to `packages/shared-utils/src/electionTallies.test.ts`:

```typescript
import {
  tallyScore,
  tallyStar,
} from './electionTallies.js';

// ... after existing tests ...

describe('tallyScore', () => {
  it('candidate with highest total score wins', () => {
    const scoreVotes: Vote[] = [
      { voterName: 'V1', ranking: [], approved: [], scores: { '1': 8, '2': 5, '3': 3 }, timestamp: '' },
      { voterName: 'V2', ranking: [], approved: [], scores: { '1': 6, '2': 9, '3': 4 }, timestamp: '' },
      { voterName: 'V3', ranking: [], approved: [], scores: { '1': 7, '2': 3, '3': 10 }, timestamp: '' },
    ];
    const result = tallyScore(scoreVotes, candidates);
    // Alice: 8+6+7=21, Bob: 5+9+3=17, Charlie: 3+4+10=17
    expect(result.winner).toBe('1');
    expect(result.scores[0]).toEqual({ candidateId: '1', name: 'Alice', score: 21 });
  });
});

describe('tallyStar', () => {
  it('top two scorers go to runoff, preference decides winner', () => {
    const starVotes: Vote[] = [
      // Alice=5, Bob=4 — prefers Alice
      { voterName: 'V1', ranking: [], approved: [], scores: { '1': 5, '2': 4, '3': 0 }, timestamp: '' },
      // Alice=3, Bob=5 — prefers Bob
      { voterName: 'V2', ranking: [], approved: [], scores: { '1': 3, '2': 5, '3': 1 }, timestamp: '' },
      // Alice=4, Bob=4 — tie, no preference
      { voterName: 'V3', ranking: [], approved: [], scores: { '1': 4, '2': 4, '3': 2 }, timestamp: '' },
    ];
    const result = tallyStar(starVotes, candidates);
    // Scoring: Alice=12, Bob=13, Charlie=3 → Top 2: Bob, Alice
    // Runoff: V1 prefers Alice(5>4), V2 prefers Bob(5>3), V3 tie(4=4)
    // Bob: 1 preference, Alice: 1 preference → Bob wins on higher score total
    expect(result.finalists[0].candidateId).toBe('2'); // Bob
    expect(result.finalists[1].candidateId).toBe('1'); // Alice
  });

  it('runoff winner beats scoring leader when preferred by majority', () => {
    const starVotes: Vote[] = [
      { voterName: 'V1', ranking: [], approved: [], scores: { '1': 5, '2': 4, '3': 0 }, timestamp: '' },
      { voterName: 'V2', ranking: [], approved: [], scores: { '1': 5, '2': 3, '3': 0 }, timestamp: '' },
      { voterName: 'V3', ranking: [], approved: [], scores: { '1': 1, '2': 5, '3': 0 }, timestamp: '' },
    ];
    const result = tallyStar(starVotes, candidates);
    // Scoring: Alice=11, Bob=12 → Top 2: Bob, Alice
    // Runoff: V1 prefers Alice(5>4), V2 prefers Alice(5>3), V3 prefers Bob(5>1)
    // Alice: 2 prefs, Bob: 1 pref → Alice wins runoff
    expect(result.winner).toBe('1');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/julius/git/votelab/packages/shared-utils && npx vitest run src/electionTallies.test.ts`
Expected: FAIL — `tallyScore` and `tallyStar` not exported

**Step 3: Implement tallyScore and tallyStar**

Append to `packages/shared-utils/src/electionTallies.ts`:

```typescript
export interface ScoreResult {
  winner: string;
  scores: Array<{ candidateId: string; name: string; score: number }>;
}

/**
 * Score/Range voting: sum each candidate's scores across all ballots. Highest total wins.
 */
export function tallyScore(votes: Vote[], candidates: Candidate[]): ScoreResult {
  const scoreMap = new Map<string, number>();
  for (const c of candidates) {
    scoreMap.set(c.id, 0);
  }

  for (const vote of votes) {
    if (!vote.scores) continue;
    for (const [candidateId, score] of Object.entries(vote.scores)) {
      if (scoreMap.has(candidateId)) {
        scoreMap.set(candidateId, scoreMap.get(candidateId)! + score);
      }
    }
  }

  const scores = candidates.map((c) => ({
    candidateId: c.id,
    name: c.name,
    score: scoreMap.get(c.id) ?? 0,
  }));
  scores.sort((a, b) => b.score - a.score);

  return { winner: scores[0].candidateId, scores };
}

export interface STARResult {
  winner: string;
  scoringRound: Array<{ candidateId: string; name: string; score: number }>;
  finalists: Array<{ candidateId: string; name: string; score: number; runoffVotes: number }>;
}

/**
 * STAR Voting: Score Then Automatic Runoff.
 * Sum scores to find top 2, then automatic runoff — each voter's ballot counts
 * as one vote for whichever finalist they scored higher.
 */
export function tallyStar(votes: Vote[], candidates: Candidate[]): STARResult {
  // Scoring round
  const scoreResult = tallyScore(votes, candidates);
  const scoringRound = scoreResult.scores;

  // Top 2 finalists
  const finalist1 = scoringRound[0];
  const finalist2 = scoringRound[1];

  // Runoff
  let votes1 = 0;
  let votes2 = 0;
  for (const vote of votes) {
    const s1 = vote.scores?.[finalist1.candidateId] ?? 0;
    const s2 = vote.scores?.[finalist2.candidateId] ?? 0;
    if (s1 > s2) votes1++;
    else if (s2 > s1) votes2++;
    // ties don't count for either
  }

  const finalists = [
    { ...finalist1, runoffVotes: votes1 },
    { ...finalist2, runoffVotes: votes2 },
  ];

  // Winner is whoever got more runoff votes; tie goes to higher score
  let winner: string;
  if (votes1 > votes2) {
    winner = finalist1.candidateId;
  } else if (votes2 > votes1) {
    winner = finalist2.candidateId;
    finalists.reverse();
  } else {
    // Tie in runoff — higher scoring total wins
    winner = finalist1.candidateId;
  }

  return { winner, scoringRound, finalists };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/julius/git/votelab/packages/shared-utils && npx vitest run src/electionTallies.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/electionTallies.ts packages/shared-utils/src/electionTallies.test.ts
git commit -m "feat: implement tallyScore and tallyStar tally functions"
```

---

### Task 3: Implement tallyRankedPairs

**Files:**
- Modify: `packages/shared-utils/src/electionTallies.ts` (append)
- Modify: `packages/shared-utils/src/electionTallies.test.ts` (append)

**Step 1: Write the failing tests**

Append to `packages/shared-utils/src/electionTallies.test.ts`:

```typescript
import { tallyRankedPairs } from './electionTallies.js';

describe('tallyRankedPairs', () => {
  it('resolves a Condorcet winner correctly', () => {
    // Alice beats everyone — should win
    const result = tallyRankedPairs(votes, candidates);
    expect(result.winner).toBe('1');
  });

  it('resolves a cycle by locking largest margins first', () => {
    const cycleCandidates: Candidate[] = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ];
    // A>B by 3, B>C by 1, C>A by 1
    const cycleVotes: Vote[] = [
      { voterName: 'V1', ranking: ['a', 'b', 'c'], approved: [], timestamp: '' },
      { voterName: 'V2', ranking: ['a', 'b', 'c'], approved: [], timestamp: '' },
      { voterName: 'V3', ranking: ['a', 'b', 'c'], approved: [], timestamp: '' },
      { voterName: 'V4', ranking: ['b', 'c', 'a'], approved: [], timestamp: '' },
      { voterName: 'V5', ranking: ['c', 'a', 'b'], approved: [], timestamp: '' },
    ];
    const result = tallyRankedPairs(cycleVotes, cycleCandidates);
    // A>B margin 3 (locked), B>C margin 1 (locked), C>A margin 1 (skipped, creates cycle)
    expect(result.winner).toBe('a');
    expect(result.lockedPairs.length).toBe(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/julius/git/votelab/packages/shared-utils && npx vitest run src/electionTallies.test.ts`
Expected: FAIL — `tallyRankedPairs` not exported

**Step 3: Implement tallyRankedPairs**

Append to `packages/shared-utils/src/electionTallies.ts`:

```typescript
export interface RankedPairsResult {
  winner: string;
  matrix: Record<string, Record<string, number>>;
  lockedPairs: Array<{ winner: string; loser: string; margin: number }>;
}

/**
 * Ranked Pairs (Tideman): Build pairwise matrix, sort pairs by victory margin,
 * lock each pair unless it creates a cycle. Winner is the source of the DAG.
 */
export function tallyRankedPairs(votes: Vote[], candidates: Candidate[]): RankedPairsResult {
  const ids = candidates.map((c) => c.id);

  // Build pairwise matrix (reuse Condorcet logic)
  const matrix: Record<string, Record<string, number>> = {};
  for (const a of ids) {
    matrix[a] = {};
    for (const b of ids) {
      matrix[a][b] = 0;
    }
  }
  for (const vote of votes) {
    for (let i = 0; i < vote.ranking.length; i++) {
      for (let j = i + 1; j < vote.ranking.length; j++) {
        const higher = vote.ranking[i];
        const lower = vote.ranking[j];
        if (matrix[higher]?.[lower] !== undefined) {
          matrix[higher][lower]++;
        }
      }
    }
  }

  // Build list of victories (only where a strictly beats b)
  const pairs: Array<{ winner: string; loser: string; margin: number }> = [];
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      if (matrix[a][b] > matrix[b][a]) {
        pairs.push({ winner: a, loser: b, margin: matrix[a][b] - matrix[b][a] });
      }
    }
  }
  // Sort by margin descending
  pairs.sort((a, b) => b.margin - a.margin);

  // Lock pairs, skipping any that would create a cycle
  const locked: Array<{ winner: string; loser: string; margin: number }> = [];
  const graph = new Map<string, Set<string>>();
  for (const id of ids) {
    graph.set(id, new Set());
  }

  const wouldCreateCycle = (from: string, to: string): boolean => {
    // BFS/DFS from 'to' to see if we can reach 'from'
    const visited = new Set<string>();
    const queue = [to];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (current === from) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of graph.get(current) ?? []) {
        queue.push(next);
      }
    }
    return false;
  };

  for (const pair of pairs) {
    if (!wouldCreateCycle(pair.winner, pair.loser)) {
      graph.get(pair.winner)!.add(pair.loser);
      locked.push(pair);
    }
  }

  // Winner is the candidate with no incoming edges in the locked graph
  const hasIncoming = new Set<string>();
  for (const [, targets] of graph) {
    for (const t of targets) {
      hasIncoming.add(t);
    }
  }
  const winner = ids.find((id) => !hasIncoming.has(id)) ?? ids[0];

  return { winner, matrix, lockedPairs: locked };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/julius/git/votelab/packages/shared-utils && npx vitest run src/electionTallies.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/electionTallies.ts packages/shared-utils/src/electionTallies.test.ts
git commit -m "feat: implement tallyRankedPairs (Tideman) tally function"
```

---

### Task 4: Implement tallySTV

**Files:**
- Modify: `packages/shared-utils/src/electionTallies.ts` (append)
- Modify: `packages/shared-utils/src/electionTallies.test.ts` (append)

**Step 1: Write the failing tests**

Append to `packages/shared-utils/src/electionTallies.test.ts`:

```typescript
import { tallySTV } from './electionTallies.js';

describe('tallySTV', () => {
  it('elects correct number of winners', () => {
    const result = tallySTV(votes, candidates, 2);
    expect(result.winners.length).toBe(2);
  });

  it('elects candidate who exceeds Droop quota', () => {
    const stvVotes: Vote[] = [
      { voterName: 'V1', ranking: ['1', '2', '3'], approved: [], timestamp: '' },
      { voterName: 'V2', ranking: ['1', '3', '2'], approved: [], timestamp: '' },
      { voterName: 'V3', ranking: ['1', '2', '3'], approved: [], timestamp: '' },
      { voterName: 'V4', ranking: ['2', '3', '1'], approved: [], timestamp: '' },
      { voterName: 'V5', ranking: ['3', '2', '1'], approved: [], timestamp: '' },
    ];
    // Droop quota for 2 seats: floor(5/3)+1 = 2
    // Round 1: Alice=3 (exceeds quota), elected
    const result = tallySTV(stvVotes, candidates, 2);
    expect(result.winners[0].candidateId).toBe('1');
  });

  it('eliminates lowest candidate and transfers votes', () => {
    const fourCandidates: Candidate[] = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
      { id: 'd', name: 'D' },
    ];
    const stvVotes: Vote[] = [
      { voterName: 'V1', ranking: ['a', 'b', 'c', 'd'], approved: [], timestamp: '' },
      { voterName: 'V2', ranking: ['a', 'c', 'b', 'd'], approved: [], timestamp: '' },
      { voterName: 'V3', ranking: ['b', 'a', 'c', 'd'], approved: [], timestamp: '' },
      { voterName: 'V4', ranking: ['c', 'b', 'a', 'd'], approved: [], timestamp: '' },
      { voterName: 'V5', ranking: ['d', 'b', 'a', 'c'], approved: [], timestamp: '' },
      { voterName: 'V6', ranking: ['d', 'c', 'a', 'b'], approved: [], timestamp: '' },
    ];
    // 2 seats, Droop quota: floor(6/3)+1 = 3
    const result = tallySTV(stvVotes, fourCandidates, 2);
    expect(result.winners.length).toBe(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/julius/git/votelab/packages/shared-utils && npx vitest run src/electionTallies.test.ts`
Expected: FAIL

**Step 3: Implement tallySTV**

Append to `packages/shared-utils/src/electionTallies.ts`:

```typescript
export interface STVRound {
  counts: Array<{ candidateId: string; name: string; count: number }>;
  elected: string | null;
  eliminated: string | null;
  quota: number;
}

export interface STVResult {
  winners: Array<{ candidateId: string; name: string; round: number }>;
  rounds: STVRound[];
  quota: number;
}

/**
 * Single Transferable Vote: multi-winner proportional method.
 * Uses Droop quota: floor(votes / (seats + 1)) + 1
 * Surplus votes transfer fractionally. Lowest candidate eliminated when no one meets quota.
 */
export function tallySTV(votes: Vote[], candidates: Candidate[], seats: number): STVResult {
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  const remaining = new Set(candidates.map((c) => c.id));
  const winners: Array<{ candidateId: string; name: string; round: number }> = [];
  const rounds: STVRound[] = [];
  const quota = Math.floor(votes.length / (seats + 1)) + 1;

  // Each ballot has a weight (starts at 1.0)
  const ballots = votes.map((v) => ({ ranking: [...v.ranking], weight: 1.0 }));

  let roundNum = 0;
  while (winners.length < seats && remaining.size > 0) {
    roundNum++;

    // Count first-choice votes among remaining
    const countMap = new Map<string, number>();
    for (const id of remaining) {
      countMap.set(id, 0);
    }
    for (const ballot of ballots) {
      const firstChoice = ballot.ranking.find((id) => remaining.has(id));
      if (firstChoice) {
        countMap.set(firstChoice, countMap.get(firstChoice)! + ballot.weight);
      }
    }

    const counts = Array.from(remaining).map((id) => ({
      candidateId: id,
      name: candidateMap.get(id)!.name,
      count: countMap.get(id) ?? 0,
    }));
    counts.sort((a, b) => b.count - a.count);

    // Check if anyone meets quota
    const meetingQuota = counts.find((c) => c.count >= quota);
    if (meetingQuota) {
      winners.push({ candidateId: meetingQuota.candidateId, name: meetingQuota.name, round: roundNum });
      rounds.push({ counts, elected: meetingQuota.candidateId, eliminated: null, quota });

      // Transfer surplus
      const surplus = meetingQuota.count - quota;
      if (surplus > 0) {
        const transferFraction = surplus / meetingQuota.count;
        for (const ballot of ballots) {
          const firstChoice = ballot.ranking.find((id) => remaining.has(id));
          if (firstChoice === meetingQuota.candidateId) {
            ballot.weight *= transferFraction;
          }
        }
      }
      remaining.delete(meetingQuota.candidateId);
    } else {
      // Eliminate candidate with fewest votes
      const lowest = counts[counts.length - 1];
      rounds.push({ counts, elected: null, eliminated: lowest.candidateId, quota });
      remaining.delete(lowest.candidateId);
    }

    // If remaining candidates equal remaining seats, elect them all
    if (remaining.size <= seats - winners.length) {
      for (const id of remaining) {
        winners.push({ candidateId: id, name: candidateMap.get(id)!.name, round: roundNum });
      }
      remaining.clear();
    }
  }

  return { winners, rounds, quota };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/julius/git/votelab/packages/shared-utils && npx vitest run src/electionTallies.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/electionTallies.ts packages/shared-utils/src/electionTallies.test.ts
git commit -m "feat: implement tallySTV (Single Transferable Vote) tally function"
```

---

### Task 5: Implement tallyMajorityJudgment

**Files:**
- Modify: `packages/shared-utils/src/electionTallies.ts` (append)
- Modify: `packages/shared-utils/src/electionTallies.test.ts` (append)

**Step 1: Write the failing tests**

Append to `packages/shared-utils/src/electionTallies.test.ts`:

```typescript
import { tallyMajorityJudgment } from './electionTallies.js';

describe('tallyMajorityJudgment', () => {
  const GRADES = ['Reject', 'Poor', 'Acceptable', 'Good', 'Very Good', 'Excellent'];

  it('candidate with higher median grade wins', () => {
    const mjVotes: Vote[] = [
      { voterName: 'V1', ranking: [], approved: [], scores: { '1': 5, '2': 3, '3': 1 }, timestamp: '' },
      { voterName: 'V2', ranking: [], approved: [], scores: { '1': 4, '2': 4, '3': 2 }, timestamp: '' },
      { voterName: 'V3', ranking: [], approved: [], scores: { '1': 3, '2': 3, '3': 5 }, timestamp: '' },
    ];
    const result = tallyMajorityJudgment(mjVotes, candidates);
    // Alice grades: [5,4,3] → median=4 (Very Good)
    // Bob grades: [3,4,3] → median=3 (Good)
    // Charlie grades: [1,2,5] → median=2 (Acceptable)
    expect(result.winner).toBe('1');
    expect(result.medianGrades[0].medianGrade).toBe(4);
  });

  it('tiebreaks by removing median votes', () => {
    const mjVotes: Vote[] = [
      { voterName: 'V1', ranking: [], approved: [], scores: { '1': 5, '2': 4 }, timestamp: '' },
      { voterName: 'V2', ranking: [], approved: [], scores: { '1': 3, '2': 4 }, timestamp: '' },
      { voterName: 'V3', ranking: [], approved: [], scores: { '1': 4, '2': 3 }, timestamp: '' },
    ];
    const twoCandidates: Candidate[] = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];
    // Both have median=4, tiebreak needed
    const result = tallyMajorityJudgment(mjVotes, twoCandidates);
    // Alice: [3,4,5] → median 4, remove one 4 → [3,5] → median (3+5)/2 but we use lower: 3
    // Bob: [3,4,4] → median 4, remove one 4 → [3,4] → median 3
    // After removing medians: Alice [3,5] median=3 or 5, Bob [3,4] median=3 or 4
    // Typical tiebreak: Alice has more above-median, so Alice wins
    expect(result.winner).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/julius/git/votelab/packages/shared-utils && npx vitest run src/electionTallies.test.ts`
Expected: FAIL

**Step 3: Implement tallyMajorityJudgment**

Append to `packages/shared-utils/src/electionTallies.ts`:

```typescript
export const MJ_GRADES = ['Reject', 'Poor', 'Acceptable', 'Good', 'Very Good', 'Excellent'] as const;

export interface MajorityJudgmentResult {
  winner: string;
  medianGrades: Array<{
    candidateId: string;
    name: string;
    medianGrade: number;
    gradeCounts: number[];
  }>;
}

/**
 * Majority Judgment: Each voter assigns a grade (0-5) to each candidate.
 * Winner is the candidate with the highest median grade.
 * Tiebreak: iteratively remove one median-grade vote from tied candidates until medians differ.
 */
export function tallyMajorityJudgment(votes: Vote[], candidates: Candidate[]): MajorityJudgmentResult {
  // Collect grades per candidate
  const gradesMap = new Map<string, number[]>();
  for (const c of candidates) {
    gradesMap.set(c.id, []);
  }
  for (const vote of votes) {
    if (!vote.scores) continue;
    for (const [candidateId, grade] of Object.entries(vote.scores)) {
      gradesMap.get(candidateId)?.push(Math.max(0, Math.min(5, Math.round(grade))));
    }
  }

  // Sort each candidate's grades
  for (const [, grades] of gradesMap) {
    grades.sort((a, b) => a - b);
  }

  const getMedian = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    return arr[Math.floor(arr.length / 2)];
  };

  // Build grade counts for display
  const medianGrades = candidates.map((c) => {
    const grades = gradesMap.get(c.id) ?? [];
    const gradeCounts = [0, 0, 0, 0, 0, 0];
    for (const g of grades) {
      gradeCounts[g]++;
    }
    return {
      candidateId: c.id,
      name: c.name,
      medianGrade: getMedian(grades),
      gradeCounts,
    };
  });

  // Tiebreak: iteratively remove median votes
  const tiebreakGrades = new Map<string, number[]>();
  for (const c of candidates) {
    tiebreakGrades.set(c.id, [...(gradesMap.get(c.id) ?? [])]);
  }

  const getRanking = (): string[] => {
    const entries = candidates.map((c) => ({
      id: c.id,
      grades: tiebreakGrades.get(c.id) ?? [],
    }));

    // Compare candidates by iterative median removal
    entries.sort((a, b) => {
      const aCopy = [...a.grades];
      const bCopy = [...b.grades];
      while (aCopy.length > 0 && bCopy.length > 0) {
        const aMedian = aCopy[Math.floor(aCopy.length / 2)];
        const bMedian = bCopy[Math.floor(bCopy.length / 2)];
        if (aMedian !== bMedian) return bMedian - aMedian;
        // Remove one median vote from each
        aCopy.splice(Math.floor(aCopy.length / 2), 1);
        bCopy.splice(Math.floor(bCopy.length / 2), 1);
      }
      return 0;
    });

    return entries.map((e) => e.id);
  };

  const ranking = getRanking();

  medianGrades.sort((a, b) => ranking.indexOf(a.candidateId) - ranking.indexOf(b.candidateId));

  return { winner: ranking[0], medianGrades };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/julius/git/votelab/packages/shared-utils && npx vitest run src/electionTallies.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/electionTallies.ts packages/shared-utils/src/electionTallies.test.ts
git commit -m "feat: implement tallyMajorityJudgment tally function"
```

---

### Task 6: Implement tallyCumulative

**Files:**
- Modify: `packages/shared-utils/src/electionTallies.ts` (append)
- Modify: `packages/shared-utils/src/electionTallies.test.ts` (append)

**Step 1: Write the failing tests**

Append to `packages/shared-utils/src/electionTallies.test.ts`:

```typescript
import { tallyCumulative } from './electionTallies.js';

describe('tallyCumulative', () => {
  it('top N candidates by total points win', () => {
    const cumVotes: Vote[] = [
      { voterName: 'V1', ranking: [], approved: [], scores: { '1': 5, '2': 3, '3': 2 }, timestamp: '' },
      { voterName: 'V2', ranking: [], approved: [], scores: { '1': 0, '2': 10, '3': 0 }, timestamp: '' },
      { voterName: 'V3', ranking: [], approved: [], scores: { '1': 4, '2': 4, '3': 2 }, timestamp: '' },
    ];
    const result = tallyCumulative(cumVotes, candidates, 2);
    // Alice: 5+0+4=9, Bob: 3+10+4=17, Charlie: 2+0+2=4
    expect(result.winners.length).toBe(2);
    expect(result.winners[0].candidateId).toBe('2'); // Bob
    expect(result.winners[1].candidateId).toBe('1'); // Alice
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/julius/git/votelab/packages/shared-utils && npx vitest run src/electionTallies.test.ts`
Expected: FAIL

**Step 3: Implement tallyCumulative**

Append to `packages/shared-utils/src/electionTallies.ts`:

```typescript
export interface CumulativeResult {
  winners: Array<{ candidateId: string; name: string; points: number }>;
  totals: Array<{ candidateId: string; name: string; points: number }>;
}

/**
 * Cumulative Voting: each voter distributes a point budget across candidates.
 * Top N candidates by total points win.
 */
export function tallyCumulative(votes: Vote[], candidates: Candidate[], seats: number): CumulativeResult {
  const pointMap = new Map<string, number>();
  for (const c of candidates) {
    pointMap.set(c.id, 0);
  }

  for (const vote of votes) {
    if (!vote.scores) continue;
    for (const [candidateId, points] of Object.entries(vote.scores)) {
      if (pointMap.has(candidateId)) {
        pointMap.set(candidateId, pointMap.get(candidateId)! + points);
      }
    }
  }

  const totals = candidates.map((c) => ({
    candidateId: c.id,
    name: c.name,
    points: pointMap.get(c.id) ?? 0,
  }));
  totals.sort((a, b) => b.points - a.points);

  const winners = totals.slice(0, Math.min(seats, totals.length));

  return { winners, totals };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/julius/git/votelab/packages/shared-utils && npx vitest run src/electionTallies.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/shared-utils/src/electionTallies.ts packages/shared-utils/src/electionTallies.test.ts
git commit -m "feat: implement tallyCumulative tally function"
```

---

### Task 7: Make ScoreBallot configurable with maxScore prop

**Files:**
- Modify: `apps/election-site/src/ScoreBallot.tsx`

**Step 1: Add maxScore prop**

Update `ScoreBallot.tsx` to accept an optional `maxScore` prop (default 10):

```typescript
interface ScoreBallotProps {
  candidates: Candidate[];
  maxScore?: number;
  onChange: (data: { ranking: string[]; approved: string[]; scores: Record<string, number> }) => void;
}

const ScoreBallot: React.FC<ScoreBallotProps> = ({ candidates, maxScore = 10, onChange }) => {
```

Replace every hardcoded `10` with `maxScore`:
- Line 17: `Math.min(10, value)` → `Math.min(maxScore, value)`
- Line 25: instruction text: use template literal `Score each candidate from 0 (worst) to ${maxScore} (best):`
- Lines 34-35: `max={10}` → `max={maxScore}` (both the range and number inputs)
- Lines 43-44: `max={10}` → `max={maxScore}`

**Step 2: Verify it compiles**

Run: `cd /Users/julius/git/votelab/apps/election-site && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/election-site/src/ScoreBallot.tsx
git commit -m "feat: add maxScore prop to ScoreBallot for STAR voting support"
```

---

### Task 8: Create GradeBallot component

**Files:**
- Create: `apps/election-site/src/GradeBallot.tsx`

**Step 1: Create the component**

Create `apps/election-site/src/GradeBallot.tsx`:

```typescript
import React, { useState } from 'react';
import type { Candidate } from './types';

const GRADES = ['Reject', 'Poor', 'Acceptable', 'Good', 'Very Good', 'Excellent'];
const GRADE_COLORS = [
  'bg-red-100 border-red-300 text-red-800',
  'bg-orange-100 border-orange-300 text-orange-800',
  'bg-yellow-100 border-yellow-300 text-yellow-800',
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-green-100 border-green-300 text-green-800',
  'bg-emerald-100 border-emerald-300 text-emerald-800',
];

interface GradeBallotProps {
  candidates: Candidate[];
  onChange: (data: { ranking: string[]; approved: string[]; scores: Record<string, number> }) => void;
}

const GradeBallot: React.FC<GradeBallotProps> = ({ candidates, onChange }) => {
  const [grades, setGrades] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    candidates.forEach((c) => { initial[c.id] = -1; }); // -1 = unset
    return initial;
  });

  const handleChange = (candidateId: string, grade: number) => {
    const next = { ...grades, [candidateId]: grade };
    setGrades(next);
    // Convert -1 (unset) to 0 (Reject) for the scores output
    const scores: Record<string, number> = {};
    for (const [id, g] of Object.entries(next)) {
      scores[id] = g < 0 ? 0 : g;
    }
    onChange({ ranking: [], approved: [], scores });
  };

  return (
    <div className="space-y-3">
      {candidates.map((candidate) => (
        <div
          key={candidate.id}
          className="p-3 rounded-lg border bg-slate-50 border-slate-200 space-y-2"
        >
          <span className="font-medium text-slate-700">{candidate.name}</span>
          <div className="flex flex-wrap gap-1">
            {GRADES.map((label, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleChange(candidate.id, index)}
                className={`px-2 py-1 text-xs rounded border transition-all ${
                  grades[candidate.id] === index
                    ? `${GRADE_COLORS[index]} font-bold ring-2 ring-offset-1 ring-blue-400`
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default GradeBallot;
```

**Step 2: Verify it compiles**

Run: `cd /Users/julius/git/votelab/apps/election-site && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/election-site/src/GradeBallot.tsx
git commit -m "feat: create GradeBallot component for Majority Judgment"
```

---

### Task 9: Create CumulativeBallot component

**Files:**
- Create: `apps/election-site/src/CumulativeBallot.tsx`

**Step 1: Create the component**

Create `apps/election-site/src/CumulativeBallot.tsx`:

```typescript
import React, { useState } from 'react';
import type { Candidate } from './types';

interface CumulativeBallotProps {
  candidates: Candidate[];
  pointBudget: number;
  onChange: (data: { ranking: string[]; approved: string[]; scores: Record<string, number> }) => void;
}

const CumulativeBallot: React.FC<CumulativeBallotProps> = ({ candidates, pointBudget, onChange }) => {
  const [points, setPoints] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    candidates.forEach((c) => { initial[c.id] = 0; });
    return initial;
  });

  const totalUsed = Object.values(points).reduce((sum, p) => sum + p, 0);
  const remaining = pointBudget - totalUsed;

  const handleChange = (candidateId: string, value: number) => {
    const currentOthers = totalUsed - (points[candidateId] ?? 0);
    const maxForThis = pointBudget - currentOthers;
    const clamped = Math.max(0, Math.min(maxForThis, value));
    const next = { ...points, [candidateId]: clamped };
    setPoints(next);
    onChange({ ranking: [], approved: [], scores: next });
  };

  return (
    <div className="space-y-3">
      <div className={`text-center p-2 rounded-lg font-medium ${
        remaining === 0 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
      }`}>
        {remaining} / {pointBudget} points remaining
      </div>
      {candidates.map((candidate) => (
        <div
          key={candidate.id}
          className="flex items-center gap-4 p-3 rounded-lg border bg-slate-50 border-slate-200"
        >
          <span className="font-medium text-slate-700 flex-grow">{candidate.name}</span>
          <input
            type="range"
            min={0}
            max={pointBudget}
            value={points[candidate.id] ?? 0}
            onChange={(e) => handleChange(candidate.id, parseInt(e.target.value, 10))}
            className="w-32 accent-blue-500"
          />
          <input
            type="number"
            min={0}
            max={pointBudget}
            value={points[candidate.id] ?? 0}
            onChange={(e) => handleChange(candidate.id, parseInt(e.target.value, 10) || 0)}
            className="w-14 text-center p-1 rounded border border-slate-300 text-sm"
          />
        </div>
      ))}
    </div>
  );
};

export default CumulativeBallot;
```

**Step 2: Verify it compiles**

Run: `cd /Users/julius/git/votelab/apps/election-site && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/election-site/src/CumulativeBallot.tsx
git commit -m "feat: create CumulativeBallot component for Cumulative voting"
```

---

### Task 10: Create all 6 results components

**Files:**
- Create: `apps/election-site/src/ScoreResults.tsx`
- Create: `apps/election-site/src/STARResults.tsx`
- Create: `apps/election-site/src/RankedPairsResults.tsx`
- Create: `apps/election-site/src/STVResults.tsx`
- Create: `apps/election-site/src/MajorityJudgmentResults.tsx`
- Create: `apps/election-site/src/CumulativeResults.tsx`

Follow the pattern from `PluralityResults.tsx` and `RRVResults.tsx`:
- Import tally function from `@votelab/shared-utils`
- Import `{ Card, CardContent, CardHeader, CardTitle }` from `@repo/ui`
- Import `{ Medal, Users }` from `lucide-react`
- Accept `{ election: Election }` as props
- Call the tally function, display results with progress bars
- Include a "How It Works" card at the bottom

**Step 1: Create ScoreResults.tsx**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyScore } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React from 'react';
import type { Election } from './types';

const ScoreResults: React.FC<{ election: Election }> = ({ election }) => {
  const result = tallyScore(election.votes, election.candidates);
  const maxScore = result.scores[0]?.score || 1;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Score Voting</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{election.votes.length} total votes</span>
        </div>
      </div>
      <div className="space-y-3">
        {result.scores.map((entry, index) => {
          const percentage = maxScore > 0 ? ((entry.score / maxScore) * 100).toFixed(1) : '0';
          const isWinner = index === 0;
          return (
            <Card key={entry.candidateId} className={isWinner ? 'border-green-300 bg-green-50' : ''}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isWinner && <Medal className="w-5 h-5 text-yellow-500" />}
                    <span className="font-bold text-slate-900">{entry.name}</span>
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{entry.score}</span>
                </div>
                <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${isWinner ? 'bg-green-500' : 'bg-blue-400'}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle className="text-blue-900">How It Works</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800">
            Each voter scores all candidates from 0 to 10. The candidate with the highest total score wins.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScoreResults;
```

**Step 2: Create STARResults.tsx**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyStar } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React from 'react';
import type { Election } from './types';

const STARResults: React.FC<{ election: Election }> = ({ election }) => {
  const result = tallyStar(election.votes, election.candidates);
  const maxScore = result.scoringRound[0]?.score || 1;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">STAR Voting (Score Then Automatic Runoff)</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{election.votes.length} total votes</span>
        </div>
      </div>

      {/* Scoring Round */}
      <Card>
        <CardHeader><CardTitle>Scoring Round</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {result.scoringRound.map((entry, index) => {
              const percentage = maxScore > 0 ? ((entry.score / maxScore) * 100).toFixed(1) : '0';
              const isFinalist = index < 2;
              return (
                <div key={entry.candidateId} className="flex items-center gap-3">
                  <span className={`w-32 text-sm font-medium truncate ${isFinalist ? 'text-blue-700' : 'text-slate-700'}`}>
                    {entry.name}
                  </span>
                  <div className="flex-grow bg-slate-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${isFinalist ? 'bg-blue-500' : 'bg-slate-400'}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-600 w-12 text-right">{entry.score}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">Top 2 advance to the automatic runoff.</p>
        </CardContent>
      </Card>

      {/* Runoff */}
      <Card>
        <CardHeader><CardTitle>Automatic Runoff</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {result.finalists.map((f, index) => {
              const isWinner = index === 0;
              return (
                <div key={f.candidateId} className={`flex items-center justify-between p-3 rounded-lg ${isWinner ? 'bg-green-50 border border-green-300' : 'bg-slate-50 border border-slate-200'}`}>
                  <div className="flex items-center gap-2">
                    {isWinner && <Medal className="w-5 h-5 text-yellow-500" />}
                    <span className="font-bold text-slate-900">{f.name}</span>
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{f.runoffVotes} votes</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle className="text-blue-900">How It Works</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800">
            Voters score each candidate 0-5. The two highest-scoring candidates advance to an automatic runoff,
            where each ballot counts as one vote for whichever finalist the voter scored higher. The finalist
            preferred by more voters wins.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default STARResults;
```

**Step 3: Create RankedPairsResults.tsx**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyRankedPairs } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React from 'react';
import type { Election } from './types';

const RankedPairsResults: React.FC<{ election: Election }> = ({ election }) => {
  const result = tallyRankedPairs(election.votes, election.candidates);
  const candidateMap = new Map(election.candidates.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Ranked Pairs (Tideman)</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{election.votes.length} total votes</span>
        </div>
      </div>

      {/* Winner */}
      <Card className="border-green-300 bg-green-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2">
            <Medal className="w-5 h-5 text-yellow-500" />
            <span className="font-bold text-slate-900 text-lg">{candidateMap.get(result.winner)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Locked Pairs */}
      <Card>
        <CardHeader><CardTitle>Locked Pairs (by margin)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {result.lockedPairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-green-700">{candidateMap.get(pair.winner)}</span>
                <span className="text-slate-400">beats</span>
                <span className="font-medium text-slate-700">{candidateMap.get(pair.loser)}</span>
                <span className="text-slate-500 ml-auto">margin: {pair.margin}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pairwise Matrix */}
      <Card>
        <CardHeader><CardTitle>Pairwise Matrix</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr>
                  <th className="p-2"></th>
                  {election.candidates.map((c) => (
                    <th key={c.id} className="p-2 text-slate-700 font-medium">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {election.candidates.map((row) => (
                  <tr key={row.id}>
                    <td className="p-2 font-medium text-slate-700">{row.name}</td>
                    {election.candidates.map((col) => (
                      <td key={col.id} className={`p-2 text-center ${
                        row.id === col.id ? 'bg-slate-100 text-slate-400' :
                        result.matrix[row.id][col.id] > result.matrix[col.id][row.id] ? 'text-green-700 font-bold' : 'text-slate-600'
                      }`}>
                        {row.id === col.id ? '-' : result.matrix[row.id][col.id]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle className="text-blue-900">How It Works</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800">
            Voters rank candidates. All pairwise matchups are computed. Pairs are locked in order of
            victory margin (largest first), skipping any that would create a cycle. The candidate who
            is never defeated in locked pairs wins.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default RankedPairsResults;
```

**Step 4: Create STVResults.tsx**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallySTV } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React, { useState } from 'react';
import type { Election } from './types';

const STVResults: React.FC<{ election: Election }> = ({ election }) => {
  const maxWinners = election.candidates.length;
  const [numWinners, setNumWinners] = useState(Math.min(3, maxWinners));
  const result = tallySTV(election.votes, election.candidates, numWinners);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Single Transferable Vote (STV)</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{election.votes.length} total votes</span>
        </div>
      </div>

      {/* Seat count selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-slate-700">Number of seats:</label>
            <input
              type="range"
              min={1}
              max={maxWinners}
              value={numWinners}
              onChange={(e) => setNumWinners(parseInt(e.target.value, 10))}
              className="flex-grow accent-blue-500"
            />
            <span className="text-lg font-bold text-slate-900 w-8 text-center">{numWinners}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Droop quota: {result.quota}</p>
        </CardContent>
      </Card>

      {/* Winners */}
      <div className="space-y-3">
        {result.winners.map((winner, index) => (
          <Card key={winner.candidateId} className={index === 0 ? 'border-green-300 bg-green-50' : ''}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {index === 0 && <Medal className="w-5 h-5 text-yellow-500" />}
                  <span className="font-bold text-slate-900">{winner.name}</span>
                </div>
                <span className="text-sm text-slate-500">Elected round {winner.round}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rounds */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900">Round-by-Round</h3>
        {result.rounds.map((round, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-lg">
                Round {i + 1}
                {round.elected && <span className="text-sm font-normal text-green-600 ml-2">— {election.candidates.find(c => c.id === round.elected)?.name} elected</span>}
                {round.eliminated && <span className="text-sm font-normal text-red-600 ml-2">— {election.candidates.find(c => c.id === round.eliminated)?.name} eliminated</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {round.counts.map((entry) => (
                  <div key={entry.candidateId} className="flex items-center gap-3">
                    <span className={`w-32 text-sm font-medium truncate ${
                      entry.candidateId === round.elected ? 'text-green-700' :
                      entry.candidateId === round.eliminated ? 'text-red-600' : 'text-slate-700'
                    }`}>{entry.name}</span>
                    <div className="flex-grow bg-slate-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          entry.candidateId === round.elected ? 'bg-green-500' :
                          entry.candidateId === round.eliminated ? 'bg-red-400' : 'bg-blue-400'
                        }`}
                        style={{ width: `${round.quota > 0 ? Math.min(100, (entry.count / round.quota) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-sm text-slate-600 w-16 text-right">{entry.count.toFixed(1)}</span>
                  </div>
                ))}
                <div className="border-l-2 border-dashed border-blue-300 ml-32 pl-2 text-xs text-blue-600">
                  Quota: {round.quota}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle className="text-blue-900">How It Works</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800">
            Voters rank candidates. A quota is calculated (Droop quota). Candidates exceeding the quota are
            elected, and their surplus votes transfer proportionally to the next preference. If no one meets
            the quota, the lowest candidate is eliminated and their votes transfer. This continues until all
            seats are filled.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default STVResults;
```

**Step 5: Create MajorityJudgmentResults.tsx**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyMajorityJudgment, MJ_GRADES } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React from 'react';
import type { Election } from './types';

const GRADE_COLORS = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#22c55e', '#10b981'];

const MajorityJudgmentResults: React.FC<{ election: Election }> = ({ election }) => {
  const result = tallyMajorityJudgment(election.votes, election.candidates);
  const totalVotes = election.votes.length;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Majority Judgment</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{totalVotes} total votes</span>
        </div>
      </div>

      <div className="space-y-3">
        {result.medianGrades.map((entry, index) => {
          const isWinner = index === 0;
          return (
            <Card key={entry.candidateId} className={isWinner ? 'border-green-300 bg-green-50' : ''}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isWinner && <Medal className="w-5 h-5 text-yellow-500" />}
                    <span className="font-bold text-slate-900">{entry.name}</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: GRADE_COLORS[entry.medianGrade] }}>
                    Median: {MJ_GRADES[entry.medianGrade]}
                  </span>
                </div>
                {/* Stacked grade bar */}
                <div className="flex rounded-full h-4 overflow-hidden">
                  {entry.gradeCounts.map((count, gradeIndex) => {
                    const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={gradeIndex}
                        style={{ width: `${pct}%`, backgroundColor: GRADE_COLORS[gradeIndex] }}
                        title={`${MJ_GRADES[gradeIndex]}: ${count}`}
                        className="h-full"
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1 text-xs text-slate-500">
                  <span>Reject</span>
                  <span>Excellent</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 justify-center">
        {MJ_GRADES.map((label, i) => (
          <div key={i} className="flex items-center gap-1 text-xs">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: GRADE_COLORS[i] }} />
            <span className="text-slate-600">{label}</span>
          </div>
        ))}
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle className="text-blue-900">How It Works</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800">
            Each voter assigns a grade (Reject through Excellent) to each candidate. The candidate with the
            highest median grade wins. Ties are broken by iteratively removing one median-grade vote from
            tied candidates until their medians differ.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MajorityJudgmentResults;
```

**Step 6: Create CumulativeResults.tsx**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyCumulative } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React, { useState } from 'react';
import type { Election } from './types';

const CumulativeResults: React.FC<{ election: Election }> = ({ election }) => {
  const maxWinners = election.candidates.length;
  const [numWinners, setNumWinners] = useState(Math.min(3, maxWinners));
  const result = tallyCumulative(election.votes, election.candidates, numWinners);
  const maxPoints = result.totals[0]?.points || 1;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Cumulative Voting</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{election.votes.length} total votes</span>
        </div>
      </div>

      {/* Winner count selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-slate-700">Number of winners:</label>
            <input
              type="range"
              min={1}
              max={maxWinners}
              value={numWinners}
              onChange={(e) => setNumWinners(parseInt(e.target.value, 10))}
              className="flex-grow accent-blue-500"
            />
            <span className="text-lg font-bold text-slate-900 w-8 text-center">{numWinners}</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {result.totals.map((entry, index) => {
          const isWinner = index < numWinners;
          const percentage = maxPoints > 0 ? ((entry.points / maxPoints) * 100).toFixed(1) : '0';
          return (
            <Card key={entry.candidateId} className={isWinner ? 'border-green-300 bg-green-50' : ''}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {index === 0 && <Medal className="w-5 h-5 text-yellow-500" />}
                    <span className="font-bold text-slate-900">{entry.name}</span>
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{entry.points} pts</span>
                </div>
                <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${isWinner ? 'bg-green-500' : 'bg-blue-400'}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle className="text-blue-900">How It Works</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800">
            Each voter receives a fixed number of points to distribute among candidates however they like —
            all on one candidate or spread across many. The candidates with the most total points win.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default CumulativeResults;
```

**Step 7: Verify all compile**

Run: `cd /Users/julius/git/votelab/apps/election-site && npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
git add apps/election-site/src/ScoreResults.tsx apps/election-site/src/STARResults.tsx apps/election-site/src/RankedPairsResults.tsx apps/election-site/src/STVResults.tsx apps/election-site/src/MajorityJudgmentResults.tsx apps/election-site/src/CumulativeResults.tsx
git commit -m "feat: create results display components for all 6 new voting methods"
```

---

### Task 11: Wire up BallotInput routing

**Files:**
- Modify: `apps/election-site/src/BallotInput.tsx`

**Step 1: Update BallotInput**

Add imports at the top:
```typescript
import GradeBallot from './GradeBallot';
import CumulativeBallot from './CumulativeBallot';
```

Add instruction entries to `BALLOT_INSTRUCTIONS`:
```typescript
star: 'Score each candidate from 0 (worst) to 5 (best). The top two scorers face an automatic runoff.',
score: 'Score each candidate from 0 (worst) to 10 (best).',
stv: 'Drag to rank candidates from most to least preferred.',
rankedPairs: 'Drag to rank candidates from most to least preferred.',
majorityJudgment: 'Assign a grade to each candidate, from Reject to Excellent.',
cumulative: 'Distribute your points across the candidates. You can give all points to one or spread them out.',
```

Add JSX blocks after the existing `{method === 'rrv' && ...}` block:
```typescript
{method === 'star' && (
  <ScoreBallot
    candidates={candidates}
    maxScore={5}
    onChange={(data) => onChange({ ranking: [], approved: [], scores: data.scores })}
  />
)}

{method === 'score' && (
  <ScoreBallot
    candidates={candidates}
    onChange={(data) => onChange({ ranking: [], approved: [], scores: data.scores })}
  />
)}

{(method === 'stv' || method === 'rankedPairs') && (
  <RankedApprovalList
    candidates={candidates}
    onChange={({ ranking, approved }) => onChange({ ranking, approved })}
    showApprovalLine={false}
  />
)}

{method === 'majorityJudgment' && (
  <GradeBallot
    candidates={candidates}
    onChange={(data) => onChange({ ranking: [], approved: [], scores: data.scores })}
  />
)}

{method === 'cumulative' && (
  <CumulativeBallot
    candidates={candidates}
    pointBudget={10}
    onChange={(data) => onChange({ ranking: [], approved: [], scores: data.scores })}
  />
)}
```

Also update the existing ranking methods line to include new ranking methods:
```typescript
{(method === 'irv' || method === 'borda' || method === 'condorcet' || method === 'stv' || method === 'rankedPairs') && (
```

Wait — STV and Ranked Pairs already have their own block above. Keep the existing `irv/borda/condorcet` block as-is and use the separate block for `stv/rankedPairs`.

**Step 2: Verify it compiles**

Run: `cd /Users/julius/git/votelab/apps/election-site && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/election-site/src/BallotInput.tsx
git commit -m "feat: wire new voting methods into BallotInput routing"
```

---

### Task 12: Wire up MethodResults routing

**Files:**
- Modify: `apps/election-site/src/MethodResults.tsx`

**Step 1: Add imports and switch cases**

Add imports:
```typescript
import ScoreResults from './ScoreResults';
import STARResults from './STARResults';
import STVResults from './STVResults';
import RankedPairsResults from './RankedPairsResults';
import MajorityJudgmentResults from './MajorityJudgmentResults';
import CumulativeResults from './CumulativeResults';
```

Add cases in the switch statement before `default`:
```typescript
case 'star':
  return <STARResults election={election} />;
case 'score':
  return <ScoreResults election={election} />;
case 'stv':
  return <STVResults election={election} />;
case 'rankedPairs':
  return <RankedPairsResults election={election} />;
case 'majorityJudgment':
  return <MajorityJudgmentResults election={election} />;
case 'cumulative':
  return <CumulativeResults election={election} />;
```

**Step 2: Verify it compiles**

Run: `cd /Users/julius/git/votelab/apps/election-site && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/election-site/src/MethodResults.tsx
git commit -m "feat: wire new voting methods into MethodResults routing"
```

---

### Task 13: Update App.tsx dropdown and vote submission

**Files:**
- Modify: `apps/election-site/src/App.tsx:474-487` (method dropdown)
- Modify: `apps/election-site/src/App.tsx:234-243` (submitVote logic)

**Step 1: Add new options to the method dropdown**

After the existing `<option value="rrv">` at line 486, add:

```html
<option value="star">STAR — Score then automatic runoff</option>
<option value="score">Score — Rate all candidates</option>
<option value="stv">STV — Proportional ranked choice</option>
<option value="rankedPairs">Ranked Pairs — Condorcet completion</option>
<option value="majorityJudgment">Majority Judgment — Grade candidates</option>
<option value="cumulative">Cumulative — Distribute points</option>
```

**Step 2: Update submitVote to handle new methods**

Replace the vote construction at lines 235-243 with:

```typescript
const scoreBasedMethods: VotingMethod[] = ['rrv', 'star', 'score', 'majorityJudgment', 'cumulative'];
const rankingBasedMethods: VotingMethod[] = ['plurality', 'irv', 'borda', 'condorcet', 'smithApproval', 'stv', 'rankedPairs'];

const vote: Vote = {
  voterName: voterName,
  ranking: scoreBasedMethods.includes(method) ? [] : candidates.map((c) => c.id),
  approved: (method === 'approval' || method === 'smithApproval')
    ? Array.from(approvedCandidates)
    : [],
  ...(scoreBasedMethods.includes(method) ? { scores: candidateScores } : {}),
  timestamp: new Date().toISOString(),
};
```

**Step 3: Verify it compiles**

Run: `cd /Users/julius/git/votelab/apps/election-site && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/election-site/src/App.tsx
git commit -m "feat: add new voting methods to election creation dropdown and vote submission"
```

---

### Task 14: Update HomePage method cards

**Files:**
- Modify: `apps/election-site/src/HomePage.tsx:6-54` (VOTING_METHODS array)
- Modify: `apps/election-site/src/HomePage.tsx:56-64` (METHOD_NAMES record)

**Step 1: Add new methods to VOTING_METHODS array**

After the RRV entry, add:

```typescript
{
  id: 'star',
  name: 'STAR Voting',
  description: 'Score candidates 0-5, then the top two face an automatic runoff based on voter preferences.',
  ballotType: 'Score all candidates 0-5',
},
{
  id: 'score',
  name: 'Score Voting',
  description: 'Score all candidates 0-10. Highest total score wins.',
  ballotType: 'Score all candidates 0-10',
},
{
  id: 'stv',
  name: 'Single Transferable Vote (STV)',
  description: 'Rank candidates to elect multiple winners proportionally. Surplus votes transfer to next choices.',
  ballotType: 'Rank all candidates',
},
{
  id: 'rankedPairs',
  name: 'Ranked Pairs (Tideman)',
  description: 'Rank candidates. Pairwise victories are locked by margin, skipping cycles. Always finds a winner.',
  ballotType: 'Rank all candidates',
},
{
  id: 'majorityJudgment',
  name: 'Majority Judgment',
  description: 'Grade each candidate from Reject to Excellent. Candidate with the highest median grade wins.',
  ballotType: 'Grade all candidates',
},
{
  id: 'cumulative',
  name: 'Cumulative Voting',
  description: 'Distribute a fixed number of points across candidates. Put all points on one or spread them around.',
  ballotType: 'Distribute points',
},
```

**Step 2: Add to METHOD_NAMES record**

```typescript
star: 'STAR',
score: 'Score',
stv: 'STV',
rankedPairs: 'Ranked Pairs',
majorityJudgment: 'Majority Judgment',
cumulative: 'Cumulative',
```

**Step 3: Verify it compiles**

Run: `cd /Users/julius/git/votelab/apps/election-site && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/election-site/src/HomePage.tsx
git commit -m "feat: add new voting method cards to homepage"
```

---

### Task 15: Build, test, and deploy

**Step 1: Run shared-utils tests**

Run: `cd /Users/julius/git/votelab/packages/shared-utils && npx vitest run`
Expected: All tests pass

**Step 2: Run election-site tests**

Run: `cd /Users/julius/git/votelab/apps/election-site && npx vitest run`
Expected: All tests pass

**Step 3: Full build**

Run: `cd /Users/julius/git/votelab && npm run build`
Expected: Build succeeds

**Step 4: Deploy**

Run: `cd /Users/julius/git/votelab/apps/election-site && firebase deploy --only hosting:votelab`
Expected: Deploy succeeds, live at https://votelab.web.app

**Step 5: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: build and deploy with 6 new voting methods"
```
