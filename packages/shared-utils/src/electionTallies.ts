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
