import type { Candidate, Vote } from './types.js';

// Tie reporting: when candidates are exactly tied at a point that decides the
// outcome, the tallies still resolve it by candidate order (so there is always
// a winner to show), but they also return the tied candidates' ids in `tied` so
// the UI can say the result came down to a tie-break. Round-based methods (IRV,
// STV, RRV) report ties per round. `tied` is empty when no tie-break was needed.

export interface PluralityResult {
  winner: string;
  tied: string[];
  counts: Array<{ candidateId: string; name: string; count: number }>;
}

export interface ApprovalResult {
  winner: string;
  tied: string[];
  counts: Array<{ candidateId: string; name: string; count: number }>;
}

export interface IRVRound {
  counts: Array<{ candidateId: string; name: string; count: number }>;
  eliminated: string | null;
  /** Candidates tied for last place when `eliminated` was chosen among them. */
  tied: string[];
}

export interface IRVResult {
  winner: string;
  /** The final two candidates, when they were tied. */
  tied: string[];
  rounds: IRVRound[];
}

export interface BordaResult {
  winner: string;
  tied: string[];
  scores: Array<{ candidateId: string; name: string; score: number }>;
}

export interface CondorcetResult {
  winner: string | null;
  matrix: Record<string, Record<string, number>>;
}

/**
 * Build a pairwise preference matrix where matrix[a][b] = number of voters who
 * prefer a over b. Unranked candidates are treated as the lowest preference
 * (a ranked candidate beats an unranked one), matching getPairwiseResults in
 * ElectionUtils. Ballots that rank neither candidate of a pair contribute
 * nothing to that pair.
 */
function buildPairwiseMatrix(
  votes: Vote[],
  ids: string[]
): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {};
  for (const a of ids) {
    matrix[a] = {};
    for (const b of ids) {
      matrix[a][b] = 0;
    }
  }

  for (const vote of votes) {
    // Position of each candidate on this ballot (first occurrence wins).
    const pos = new Map<string, number>();
    vote.ranking.forEach((id, i) => {
      if (!pos.has(id)) pos.set(id, i);
    });

    for (let x = 0; x < ids.length; x++) {
      for (let y = x + 1; y < ids.length; y++) {
        const a = ids[x];
        const b = ids[y];
        const pa = pos.has(a) ? pos.get(a)! : Infinity;
        const pb = pos.has(b) ? pos.get(b)! : Infinity;
        if (pa === Infinity && pb === Infinity) continue; // neither ranked
        if (pa < pb) matrix[a][b]++;
        else if (pb < pa) matrix[b][a]++;
      }
    }
  }

  return matrix;
}

/**
 * Ids of every entry whose value equals the value at `index` in an already
 * sorted list, or an empty array when that value is not shared (no tie).
 * Values are compared with a small tolerance because some tallies use
 * fractional ballot weights.
 */
function tiedAt<T>(
  sorted: T[],
  index: number,
  value: (entry: T) => number,
  id: (entry: T) => string
): string[] {
  const target = sorted[index];
  if (target === undefined) return [];
  const tied = sorted.filter((e) => Math.abs(value(e) - value(target)) < 1e-9);
  return tied.length > 1 ? tied.map(id) : [];
}

/**
 * Count first-choice votes. Winner = candidate with most first-choice votes.
 */
export function tallyPlurality(votes: Vote[], candidates: Candidate[]): PluralityResult {
  const countMap = new Map<string, number>();

  for (const c of candidates) {
    countMap.set(c.id, 0);
  }

  for (const vote of votes) {
    const firstChoice = vote.ranking[0];
    if (firstChoice && countMap.has(firstChoice)) {
      countMap.set(firstChoice, countMap.get(firstChoice)! + 1);
    }
  }

  const counts = candidates.map((c) => ({
    candidateId: c.id,
    name: c.name,
    count: countMap.get(c.id) ?? 0,
  }));

  counts.sort((a, b) => b.count - a.count);

  return {
    winner: counts[0].candidateId,
    tied: tiedAt(counts, 0, (c) => c.count, (c) => c.candidateId),
    counts,
  };
}

/**
 * Count how many times each candidate appears in voters' approved arrays.
 */
export function tallyApproval(votes: Vote[], candidates: Candidate[]): ApprovalResult {
  const countMap = new Map<string, number>();

  for (const c of candidates) {
    countMap.set(c.id, 0);
  }

  for (const vote of votes) {
    for (const approved of vote.approved) {
      if (countMap.has(approved)) {
        countMap.set(approved, countMap.get(approved)! + 1);
      }
    }
  }

  const counts = candidates.map((c) => ({
    candidateId: c.id,
    name: c.name,
    count: countMap.get(c.id) ?? 0,
  }));

  counts.sort((a, b) => b.count - a.count);

  return {
    winner: counts[0].candidateId,
    tied: tiedAt(counts, 0, (c) => c.count, (c) => c.candidateId),
    counts,
  };
}

/**
 * Instant runoff voting: each round, count first-choice votes among remaining candidates.
 * If someone has a majority, they win. Otherwise eliminate the candidate with fewest votes.
 */
export function tallyIRV(votes: Vote[], candidates: Candidate[]): IRVResult {
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  let remaining = new Set(candidates.map((c) => c.id));
  const rounds: IRVRound[] = [];

  while (remaining.size > 1) {
    // Count first-choice votes among remaining candidates
    const countMap = new Map<string, number>();
    for (const id of remaining) {
      countMap.set(id, 0);
    }

    for (const vote of votes) {
      const firstChoice = vote.ranking.find((id) => remaining.has(id));
      if (firstChoice) {
        countMap.set(firstChoice, countMap.get(firstChoice)! + 1);
      }
    }

    const counts = Array.from(remaining).map((id) => ({
      candidateId: id,
      name: candidateMap.get(id)!.name,
      count: countMap.get(id) ?? 0,
    }));

    counts.sort((a, b) => b.count - a.count);

    // Check for majority
    const totalVotes = counts.reduce((sum, c) => sum + c.count, 0);
    if (counts[0].count > totalVotes / 2) {
      rounds.push({ counts, eliminated: null, tied: [] });
      return { winner: counts[0].candidateId, tied: [], rounds };
    }

    // Eliminate candidate with fewest votes
    const eliminated = counts[counts.length - 1].candidateId;
    const tied = tiedAt(counts, counts.length - 1, (c) => c.count, (c) => c.candidateId);

    rounds.push({ counts, eliminated, tied });
    remaining = new Set([...remaining].filter((id) => id !== eliminated));
  }

  // One candidate remaining. If the last round was a tie between everyone
  // still in it (the final two), the winner came down to the tie-break.
  const winnerId = [...remaining][0];
  const lastRound = rounds[rounds.length - 1];
  const finalTie =
    lastRound && lastRound.tied.length === lastRound.counts.length ? lastRound.tied : [];
  return { winner: winnerId, tied: finalTie, rounds };
}

/**
 * Borda count: for each vote's ranking, award (n-1) points for 1st, (n-2) for 2nd, etc.
 */
export function tallyBorda(votes: Vote[], candidates: Candidate[]): BordaResult {
  const n = candidates.length;
  const scoreMap = new Map<string, number>();

  for (const c of candidates) {
    scoreMap.set(c.id, 0);
  }

  for (const vote of votes) {
    for (let i = 0; i < vote.ranking.length; i++) {
      const candidateId = vote.ranking[i];
      if (scoreMap.has(candidateId)) {
        scoreMap.set(candidateId, scoreMap.get(candidateId)! + (n - 1 - i));
      }
    }
  }

  const scores = candidates.map((c) => ({
    candidateId: c.id,
    name: c.name,
    score: scoreMap.get(c.id) ?? 0,
  }));

  scores.sort((a, b) => b.score - a.score);

  return {
    winner: scores[0].candidateId,
    tied: tiedAt(scores, 0, (c) => c.score, (c) => c.candidateId),
    scores,
  };
}

/**
 * Condorcet method: build pairwise matrix and find a candidate who beats all others head-to-head.
 * Returns null winner if no Condorcet winner exists (cycle).
 */
export function tallyCondorcet(votes: Vote[], candidates: Candidate[]): CondorcetResult {
  const ids = candidates.map((c) => c.id);

  // Build pairwise matrix: matrix[a][b] = number of voters who rank a above b
  // (unranked candidates count as lowest preference).
  const matrix = buildPairwiseMatrix(votes, ids);

  // Find Condorcet winner: beats all others pairwise
  let winner: string | null = null;
  for (const a of ids) {
    let beatsAll = true;
    for (const b of ids) {
      if (a === b) continue;
      if (matrix[a][b] <= matrix[b][a]) {
        beatsAll = false;
        break;
      }
    }
    if (beatsAll) {
      winner = a;
      break;
    }
  }

  return { winner, matrix };
}

export interface RRVRound {
  winnerId: string;
  winnerName: string;
  /** Candidates tied for this round's seat. */
  tied: string[];
  weightedScores: Array<{ candidateId: string; name: string; score: number }>;
}

export interface RRVResult {
  winners: Array<{ candidateId: string; name: string; round: number }>;
  rounds: RRVRound[];
}

/**
 * Reweighted Range Voting: multi-winner proportional method.
 * Voters score each candidate 0-10. After each winner is selected,
 * ballots are reweighted: weight = weight / (1 + score_given_to_winner / maxScore)
 */
export function tallyRRV(
  votes: Vote[],
  candidates: Candidate[],
  numWinners: number,
  maxScore: number = 10
): RRVResult {
  const remaining = new Set(candidates.map(c => c.id));
  const weights = votes.map(() => 1.0);
  const rounds: RRVRound[] = [];
  const winners: Array<{ candidateId: string; name: string; round: number }> = [];

  const actualNumWinners = Math.min(numWinners, candidates.length);

  for (let round = 0; round < actualNumWinners; round++) {
    // Compute weighted scores for remaining candidates
    const weightedScores: Array<{ candidateId: string; name: string; score: number }> = [];

    for (const candidateId of remaining) {
      let totalWeightedScore = 0;
      for (let i = 0; i < votes.length; i++) {
        const voterScore = votes[i].scores?.[candidateId] ?? 0;
        totalWeightedScore += weights[i] * voterScore;
      }
      const candidate = candidates.find(c => c.id === candidateId)!;
      weightedScores.push({
        candidateId,
        name: candidate.name,
        score: totalWeightedScore,
      });
    }

    weightedScores.sort((a, b) => b.score - a.score);

    const winner = weightedScores[0];
    winners.push({ candidateId: winner.candidateId, name: winner.name, round: round + 1 });
    rounds.push({
      winnerId: winner.candidateId,
      winnerName: winner.name,
      tied: tiedAt(weightedScores, 0, (c) => c.score, (c) => c.candidateId),
      weightedScores,
    });

    // Reweight ballots
    for (let i = 0; i < votes.length; i++) {
      const voterScoreForWinner = votes[i].scores?.[winner.candidateId] ?? 0;
      weights[i] = weights[i] / (1 + voterScoreForWinner / maxScore);
    }

    remaining.delete(winner.candidateId);
  }

  return { winners, rounds };
}

// --- Score Voting ---

export interface ScoreResult {
  winner: string;
  tied: string[];
  scores: Array<{ candidateId: string; name: string; score: number }>;
}

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
  return {
    winner: scores[0].candidateId,
    tied: tiedAt(scores, 0, (c) => c.score, (c) => c.candidateId),
    scores,
  };
}

// --- STAR Voting ---

export interface STARResult {
  winner: string;
  /** The two finalists, when both the runoff and their total scores were tied. */
  tied: string[];
  /** Candidates tied for a finalist spot when not all of them could advance. */
  finalistTie: string[];
  scoringRound: Array<{ candidateId: string; name: string; score: number }>;
  finalists: Array<{ candidateId: string; name: string; score: number; runoffVotes: number }>;
}

export function tallyStar(votes: Vote[], candidates: Candidate[]): STARResult {
  const scoreResult = tallyScore(votes, candidates);
  const scoringRound = scoreResult.scores;
  const finalist1 = scoringRound[0];
  const finalist2 = scoringRound[1];
  const sameScore = (a: { score: number }, b: { score: number }) =>
    Math.abs(a.score - b.score) < 1e-9;
  const finalistTie =
    scoringRound.length > 2 && sameScore(scoringRound[1], scoringRound[2])
      ? tiedAt(scoringRound, 1, (c) => c.score, (c) => c.candidateId)
      : [];

  // With a single candidate there is no runoff: the scoring leader wins outright.
  if (!finalist2) {
    return {
      winner: finalist1.candidateId,
      tied: [],
      finalistTie,
      scoringRound,
      finalists: [{ ...finalist1, runoffVotes: votes.length }],
    };
  }

  let votes1 = 0;
  let votes2 = 0;
  for (const vote of votes) {
    const s1 = vote.scores?.[finalist1.candidateId] ?? 0;
    const s2 = vote.scores?.[finalist2.candidateId] ?? 0;
    if (s1 > s2) votes1++;
    else if (s2 > s1) votes2++;
  }

  const finalists = [
    { ...finalist1, runoffVotes: votes1 },
    { ...finalist2, runoffVotes: votes2 },
  ];

  // A runoff tie goes to the finalist with the higher total score (finalist1,
  // since the scoring round is sorted); only an equal score is a true tie.
  let winner: string;
  let tied: string[] = [];
  if (votes1 > votes2) {
    winner = finalist1.candidateId;
  } else if (votes2 > votes1) {
    winner = finalist2.candidateId;
    finalists.reverse();
  } else {
    winner = finalist1.candidateId;
    if (sameScore(finalist1, finalist2)) {
      tied = [finalist1.candidateId, finalist2.candidateId];
    }
  }

  return { winner, tied, finalistTie, scoringRound, finalists };
}

// --- Ranked Pairs ---

export interface RankedPairsResult {
  winner: string;
  /** Candidates left unbeaten in the locked graph, when there is more than one. */
  tied: string[];
  matrix: Record<string, Record<string, number>>;
  lockedPairs: Array<{ winner: string; loser: string; margin: number }>;
  /** Equal-margin victories whose lock order changes which pairs survive. */
  lockingTies: Array<{
    margin: number;
    pairs: Array<{ winner: string; loser: string }>;
  }>;
}

export function tallyRankedPairs(votes: Vote[], candidates: Candidate[]): RankedPairsResult {
  const ids = candidates.map((c) => c.id);
  // Unranked candidates count as lowest preference (see buildPairwiseMatrix).
  const matrix = buildPairwiseMatrix(votes, ids);

  const pairs: Array<{ winner: string; loser: string; margin: number }> = [];
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      if (matrix[a][b] > matrix[b][a]) {
        pairs.push({ winner: a, loser: b, margin: matrix[a][b] - matrix[b][a] });
      }
    }
  }
  pairs.sort((a, b) => b.margin - a.margin);

  const locked: Array<{ winner: string; loser: string; margin: number }> = [];
  const graph = new Map<string, Set<string>>();
  for (const id of ids) {
    graph.set(id, new Set());
  }

  const wouldCreateCycle = (
    from: string,
    to: string,
    edges = graph
  ): boolean => {
    const visited = new Set<string>();
    const queue = [to];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (current === from) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of edges.get(current) ?? []) {
        queue.push(next);
      }
    }
    return false;
  };

  const lockingTies: RankedPairsResult['lockingTies'] = [];
  for (let start = 0; start < pairs.length;) {
    let end = start + 1;
    while (end < pairs.length && pairs[end].margin === pairs[start].margin) end++;
    const group = pairs.slice(start, end);
    // Edges already blocked by stronger victories cannot participate in an
    // equal-margin ordering tie. Add all other edges provisionally: any cycle
    // now depends on at least two edges in this group, so lock order matters.
    const eligible = group.filter((pair) => !wouldCreateCycle(pair.winner, pair.loser));
    if (eligible.length > 1) {
      const combined = new Map([...graph].map(([id, edges]) => [id, new Set(edges)]));
      for (const pair of eligible) combined.get(pair.winner)!.add(pair.loser);
      const cyclic = eligible.filter((pair) =>
        wouldCreateCycle(pair.winner, pair.loser, combined)
      );
      if (cyclic.length > 0) {
        lockingTies.push({
          margin: group[0].margin,
          pairs: cyclic.map(({ winner, loser }) => ({ winner, loser })),
        });
      }
    }
    // Preserve the existing deterministic result, but disclose ambiguous locks.
    for (const pair of group) {
      if (!wouldCreateCycle(pair.winner, pair.loser)) {
        graph.get(pair.winner)!.add(pair.loser);
        locked.push(pair);
      }
    }
    start = end;
  }

  const hasIncoming = new Set<string>();
  for (const [, targets] of graph) {
    for (const t of targets) {
      hasIncoming.add(t);
    }
  }
  const unbeaten = ids.filter((id) => !hasIncoming.has(id));
  const winner = unbeaten[0] ?? ids[0];

  return {
    winner,
    tied: unbeaten.length > 1 ? unbeaten : [],
    matrix,
    lockedPairs: locked,
    lockingTies,
  };
}

// --- STV (Single Transferable Vote) ---

export interface STVRound {
  counts: Array<{ candidateId: string; name: string; count: number }>;
  elected: string | null;
  eliminated: string | null;
  /** Candidates tied for last place when `eliminated` was chosen among them. */
  tied: string[];
  quota: number;
}

export interface STVResult {
  winners: Array<{ candidateId: string; name: string; round: number }>;
  rounds: STVRound[];
  quota: number;
}

export function tallySTV(votes: Vote[], candidates: Candidate[], seats: number): STVResult {
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  const remaining = new Set(candidates.map((c) => c.id));
  const winners: Array<{ candidateId: string; name: string; round: number }> = [];
  const rounds: STVRound[] = [];
  const quota = Math.floor(votes.length / (seats + 1)) + 1;

  const ballots = votes.map((v) => ({ ranking: [...v.ranking], weight: 1.0 }));

  let roundNum = 0;
  while (winners.length < seats && remaining.size > 0) {
    roundNum++;
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

    const meetingQuota = counts.find((c) => c.count >= quota);
    if (meetingQuota) {
      winners.push({ candidateId: meetingQuota.candidateId, name: meetingQuota.name, round: roundNum });
      rounds.push({ counts, elected: meetingQuota.candidateId, eliminated: null, tied: [], quota });

      // Transfer the surplus: every ballot currently counting for the winner
      // continues at weight * (surplus / count). When the winner hits the quota
      // exactly the surplus is zero and those ballots are fully consumed; they
      // must not carry on at full weight to the voter's next preference.
      const surplus = meetingQuota.count - quota;
      const transferFraction = surplus / meetingQuota.count;
      for (const ballot of ballots) {
        const firstChoice = ballot.ranking.find((id) => remaining.has(id));
        if (firstChoice === meetingQuota.candidateId) {
          ballot.weight *= transferFraction;
        }
      }
      remaining.delete(meetingQuota.candidateId);
    } else {
      const lowest = counts[counts.length - 1];
      rounds.push({
        counts,
        elected: null,
        eliminated: lowest.candidateId,
        tied: tiedAt(counts, counts.length - 1, (c) => c.count, (c) => c.candidateId),
        quota,
      });
      remaining.delete(lowest.candidateId);
    }

    if (remaining.size <= seats - winners.length) {
      for (const id of remaining) {
        winners.push({ candidateId: id, name: candidateMap.get(id)!.name, round: roundNum });
      }
      remaining.clear();
    }
  }

  return { winners, rounds, quota };
}

// --- Majority Judgment ---

export const MJ_GRADES = ['Reject', 'Poor', 'Acceptable', 'Good', 'Very Good', 'Excellent'] as const;

export interface MajorityJudgmentResult {
  winner: string;
  tied: string[];
  medianGrades: Array<{
    candidateId: string;
    name: string;
    medianGrade: number;
    gradeCounts: number[];
  }>;
}

export function tallyMajorityJudgment(votes: Vote[], candidates: Candidate[]): MajorityJudgmentResult {
  const gradesMap = new Map<string, number[]>();
  for (const c of candidates) {
    gradesMap.set(c.id, []);
  }
  // Each voter contributes a grade for every candidate. A candidate the voter
  // did not grade is treated as the lowest grade (Reject = 0) so that medians
  // are computed over the full electorate and a candidate rated by only a small
  // minority cannot get an inflated median.
  for (const vote of votes) {
    const scores = vote.scores ?? {};
    for (const c of candidates) {
      const grade = scores[c.id];
      const clamped =
        grade === undefined ? 0 : Math.max(0, Math.min(5, Math.round(grade)));
      gradesMap.get(c.id)!.push(clamped);
    }
  }

  for (const [, grades] of gradesMap) {
    grades.sort((a, b) => a - b);
  }

  // Lower median: for an even number of grades, Majority Judgment uses the
  // lower of the two middle values (and the tie-break below assumes the same).
  const lowerMedianIndex = (length: number): number =>
    Math.floor((length - 1) / 2);

  const getMedian = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    return arr[lowerMedianIndex(arr.length)];
  };

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

  // Majority Judgment tie-break: repeatedly remove the median grade from both
  // candidates until their medians differ. Returns 0 only for identical grades.
  const compareCandidates = (aId: string, bId: string): number => {
    const aCopy = [...(gradesMap.get(aId) ?? [])];
    const bCopy = [...(gradesMap.get(bId) ?? [])];
    while (aCopy.length > 0 && bCopy.length > 0) {
      const aIdx = lowerMedianIndex(aCopy.length);
      const bIdx = lowerMedianIndex(bCopy.length);
      const aMedian = aCopy[aIdx];
      const bMedian = bCopy[bIdx];
      if (aMedian !== bMedian) return bMedian - aMedian;
      aCopy.splice(aIdx, 1);
      bCopy.splice(bIdx, 1);
    }
    return 0;
  };

  const ranking = candidates.map((c) => c.id).sort(compareCandidates);
  medianGrades.sort((a, b) => ranking.indexOf(a.candidateId) - ranking.indexOf(b.candidateId));

  const tiedWithWinner = ranking.filter((id) => compareCandidates(ranking[0], id) === 0);

  return {
    winner: ranking[0],
    tied: tiedWithWinner.length > 1 ? tiedWithWinner : [],
    medianGrades,
  };
}

// --- Cumulative Voting ---

export interface CumulativeResult {
  winners: Array<{ candidateId: string; name: string; points: number }>;
  /** Candidates tied for the last seat, when not all of them could win one. */
  tied: string[];
  totals: Array<{ candidateId: string; name: string; points: number }>;
}

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
  const seatsFilled = Math.min(seats, totals.length);
  const winners = totals.slice(0, seatsFilled);
  const lastWinner = totals[seatsFilled - 1];
  const firstLoser = totals[seatsFilled];
  const tied =
    lastWinner && firstLoser && lastWinner.points === firstLoser.points
      ? tiedAt(totals, seatsFilled - 1, (c) => c.points, (c) => c.candidateId)
      : [];
  return { winners, tied, totals };
}
