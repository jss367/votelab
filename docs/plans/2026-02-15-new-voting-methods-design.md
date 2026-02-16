# New Voting Methods Design

**Date:** 2026-02-15

## Overview

Add 6 new voting methods to VoteLab: STAR, Score, STV, Ranked Pairs, Majority Judgment, and Cumulative Voting.

## New Methods

### STAR Voting (Score Then Automatic Runoff)
- **Ballot:** Score each candidate 0-5
- **Tally:** Sum scores, top 2 go to automatic runoff decided by which candidate each voter scored higher
- **Winner type:** Single
- **Ballot UI:** Reuse ScoreBallot with `maxScore=5`

### Score/Range Voting
- **Ballot:** Score each candidate 0-10
- **Tally:** Sum (or average) scores, highest wins
- **Winner type:** Single
- **Ballot UI:** Reuse ScoreBallot as-is (maxScore=10)

### STV (Single Transferable Vote)
- **Ballot:** Rank candidates
- **Tally:** Droop quota = floor(votes/(seats+1)) + 1. Elect candidates meeting quota, transfer surplus proportionally. Eliminate lowest if no one meets quota. Repeat until all seats filled.
- **Winner type:** Multi-winner
- **Ballot UI:** Reuse RankedApprovalList (no approval line)

### Ranked Pairs (Tideman)
- **Ballot:** Rank candidates
- **Tally:** Build pairwise margin matrix. Sort pairs by margin (largest first). Lock each pair unless it creates a cycle. Winner is the source of the resulting DAG.
- **Winner type:** Single
- **Ballot UI:** Reuse RankedApprovalList (no approval line)

### Majority Judgment
- **Ballot:** Assign one of 6 grades to each candidate: Excellent (5), Very Good (4), Good (3), Acceptable (2), Poor (1), Reject (0)
- **Tally:** Find median grade per candidate. Tiebreak: iteratively remove one median-grade vote from tied candidates until median differs.
- **Winner type:** Single
- **Ballot UI:** New GradeBallot component

### Cumulative Voting
- **Ballot:** Distribute a configurable point budget across candidates (can put multiple on one)
- **Tally:** Sum points per candidate, top N win
- **Winner type:** Multi-winner
- **Ballot UI:** New CumulativeBallot component with remaining-points counter
- **Config:** Election creator sets `pointBudget`

## Ballot UI Strategy

### Reuse existing components
- **ScoreBallot** — Add `maxScore` prop (default 10). Used by Score (max=10), STAR (max=5), RRV (max=10, existing).
- **RankedApprovalList** — Already supports `showApprovalLine` toggle. Used by STV and Ranked Pairs with `showApprovalLine=false`.

### New components
- **GradeBallot** — Button group or dropdown per candidate with 6 grade labels. Stores grades as numeric 0-5 in the `scores` field.
- **CumulativeBallot** — Numeric input per candidate with a remaining-points display. Prevents exceeding budget. Stores allocations in the `scores` field.

## Data Model

All new methods use the existing `Vote` interface. The `scores: Record<string, number>` field carries score, grade, and point data:

| Method | ranking | approved | scores |
|--------|---------|----------|--------|
| STAR | [] | [] | {candidateId: 0-5} |
| Score | [] | [] | {candidateId: 0-10} |
| STV | [ordered IDs] | [] | undefined |
| Ranked Pairs | [ordered IDs] | [] | undefined |
| Majority Judgment | [] | [] | {candidateId: 0-5} |
| Cumulative | [] | [] | {candidateId: points} |

Election type needs a new optional field: `pointBudget?: number` for Cumulative voting.

## Results Components (6 new)

- **STARResults** — Scoring round totals table + runoff matchup display
- **ScoreResults** — Bar chart of average/total scores
- **STVResults** — Round-by-round table showing quotas, elections, transfers, eliminations
- **RankedPairsResults** — Pairwise matrix + locked pairs list in margin order + final ranking
- **MajorityJudgmentResults** — Grade distribution per candidate with median highlighted
- **CumulativeResults** — Point totals per candidate, top N winners highlighted

## Files to Modify

1. `packages/shared-utils/src/YeeDiagram.ts` — Add `'star' | 'score' | 'stv' | 'rankedPairs' | 'majorityJudgment' | 'cumulative'` to VotingMethod
2. `packages/shared-utils/src/electionTallies.ts` — 6 new tally functions + result interfaces
3. `apps/election-site/src/ScoreBallot.tsx` — Add `maxScore` prop
4. `apps/election-site/src/BallotInput.tsx` — Route 6 new methods to ballot components
5. `apps/election-site/src/MethodResults.tsx` — Route 6 new methods to results components
6. `apps/election-site/src/App.tsx` — Method dropdown + vote submission logic
7. `apps/election-site/src/types.ts` — Add `pointBudget` to Election interface

## New Files

- `apps/election-site/src/GradeBallot.tsx`
- `apps/election-site/src/CumulativeBallot.tsx`
- `apps/election-site/src/STARResults.tsx`
- `apps/election-site/src/ScoreResults.tsx`
- `apps/election-site/src/STVResults.tsx`
- `apps/election-site/src/RankedPairsResults.tsx`
- `apps/election-site/src/MajorityJudgmentResults.tsx`
- `apps/election-site/src/CumulativeResults.tsx`
