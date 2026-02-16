import type { Candidate, Vote } from './types.js';

export interface PluralityResult {
  winner: string;
  counts: Array<{ candidateId: string; name: string; count: number }>;
}

export interface ApprovalResult {
  winner: string;
  counts: Array<{ candidateId: string; name: string; count: number }>;
}

export interface IRVRound {
  counts: Array<{ candidateId: string; name: string; count: number }>;
  eliminated: string | null;
}

export interface IRVResult {
  winner: string;
  rounds: IRVRound[];
}

export interface BordaResult {
  winner: string;
  scores: Array<{ candidateId: string; name: string; score: number }>;
}

export interface CondorcetResult {
  winner: string | null;
  matrix: Record<string, Record<string, number>>;
}

/**
 * Count first-choice votes. Winner = candidate with most first-choice votes.
 */
export function tallyPlurality(votes: Vote[], candidates: Candidate[]): PluralityResult {
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
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
      rounds.push({ counts, eliminated: null });
      return { winner: counts[0].candidateId, rounds };
    }

    // Eliminate candidate with fewest votes
    const minCount = counts[counts.length - 1].count;
    const eliminated = counts[counts.length - 1].candidateId;

    rounds.push({ counts, eliminated });
    remaining = new Set([...remaining].filter((id) => id !== eliminated));
  }

  // One candidate remaining
  const winnerId = [...remaining][0];
  return { winner: winnerId, rounds };
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
  const matrix: Record<string, Record<string, number>> = {};
  for (const a of ids) {
    matrix[a] = {};
    for (const b of ids) {
      matrix[a][b] = 0;
    }
  }

  for (const vote of votes) {
    // For each pair, the one appearing earlier in the ranking is preferred
    for (let i = 0; i < vote.ranking.length; i++) {
      for (let j = i + 1; j < vote.ranking.length; j++) {
        const higher = vote.ranking[i];
        const lower = vote.ranking[j];
        if (matrix[higher] && matrix[higher][lower] !== undefined) {
          matrix[higher][lower]++;
        }
      }
    }
  }

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
    rounds.push({ winnerId: winner.candidateId, winnerName: winner.name, weightedScores });

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
  return { winner: scores[0].candidateId, scores };
}

// --- STAR Voting ---

export interface STARResult {
  winner: string;
  scoringRound: Array<{ candidateId: string; name: string; score: number }>;
  finalists: Array<{ candidateId: string; name: string; score: number; runoffVotes: number }>;
}

export function tallyStar(votes: Vote[], candidates: Candidate[]): STARResult {
  const scoreResult = tallyScore(votes, candidates);
  const scoringRound = scoreResult.scores;
  const finalist1 = scoringRound[0];
  const finalist2 = scoringRound[1];

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

  let winner: string;
  if (votes1 > votes2) {
    winner = finalist1.candidateId;
  } else if (votes2 > votes1) {
    winner = finalist2.candidateId;
    finalists.reverse();
  } else {
    winner = finalist1.candidateId;
  }

  return { winner, scoringRound, finalists };
}

// --- Ranked Pairs ---

export interface RankedPairsResult {
  winner: string;
  matrix: Record<string, Record<string, number>>;
  lockedPairs: Array<{ winner: string; loser: string; margin: number }>;
}

export function tallyRankedPairs(votes: Vote[], candidates: Candidate[]): RankedPairsResult {
  const ids = candidates.map((c) => c.id);
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

  const wouldCreateCycle = (from: string, to: string): boolean => {
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

  const hasIncoming = new Set<string>();
  for (const [, targets] of graph) {
    for (const t of targets) {
      hasIncoming.add(t);
    }
  }
  const winner = ids.find((id) => !hasIncoming.has(id)) ?? ids[0];

  return { winner, matrix, lockedPairs: locked };
}

// --- STV (Single Transferable Vote) ---

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
      rounds.push({ counts, elected: meetingQuota.candidateId, eliminated: null, quota });

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
      const lowest = counts[counts.length - 1];
      rounds.push({ counts, elected: null, eliminated: lowest.candidateId, quota });
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
  for (const vote of votes) {
    if (!vote.scores) continue;
    for (const [candidateId, grade] of Object.entries(vote.scores)) {
      gradesMap.get(candidateId)?.push(Math.max(0, Math.min(5, Math.round(grade))));
    }
  }

  for (const [, grades] of gradesMap) {
    grades.sort((a, b) => a - b);
  }

  const getMedian = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    return arr[Math.floor(arr.length / 2)];
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

  const getRanking = (): string[] => {
    const entries = candidates.map((c) => ({
      id: c.id,
      grades: [...(gradesMap.get(c.id) ?? [])],
    }));

    entries.sort((a, b) => {
      const aCopy = [...a.grades];
      const bCopy = [...b.grades];
      while (aCopy.length > 0 && bCopy.length > 0) {
        const aMedian = aCopy[Math.floor(aCopy.length / 2)];
        const bMedian = bCopy[Math.floor(bCopy.length / 2)];
        if (aMedian !== bMedian) return bMedian - aMedian;
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

// --- Cumulative Voting ---

export interface CumulativeResult {
  winners: Array<{ candidateId: string; name: string; points: number }>;
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
  const winners = totals.slice(0, Math.min(seats, totals.length));
  return { winners, totals };
}
