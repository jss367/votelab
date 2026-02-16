import { Candidate, Election, PairwiseResult, Victory, Vote } from './types.js';

export interface Metrics {
  approval: number;
  headToHead: number;
  margin: number;
}

export interface CandidateScore {
  name: string;
  approvalScore: number;
  netVictories: number;
  wins: number;
  losses: number;
  avgMargin: number;
  rank: number;
  isTied: boolean;
  description: string;
  metrics: Metrics;
}

export const getPairwiseResults = (election: Election): PairwiseResult[] => {
  const results: PairwiseResult[] = [];

  // For each pair of candidates
  for (let i = 0; i < election.candidates.length; i++) {
    for (let j = i + 1; j < election.candidates.length; j++) {
      const candidate1 = election.candidates[i];
      const candidate2 = election.candidates[j];

      let candidate1Votes = 0;
      let candidate2Votes = 0;

      // Count each vote where both candidates are ranked
      election.votes.forEach((vote: Vote) => {
        const pos1 = vote.ranking.indexOf(candidate1.id);
        const pos2 = vote.ranking.indexOf(candidate2.id);

        // Only count if at least one candidate is ranked
        // Unranked candidates are considered lower preference
        if (pos1 === -1 && pos2 === -1) {
          return; // Skip if neither is ranked
        }
        if (pos1 === -1) {
          candidate2Votes++;
        } else if (pos2 === -1) {
          candidate1Votes++;
        } else if (pos1 < pos2) {
          candidate1Votes++;
        } else {
          candidate2Votes++;
        }
      });

      results.push({
        candidate1: candidate1.name,
        candidate2: candidate2.name,
        candidate1Votes,
        candidate2Votes,
      });
    }
  }

  return results;
};

export const getHeadToHeadVictories = (
  pairwiseResults: PairwiseResult[]
): Victory[] => {
  const victories: Victory[] = [];

  pairwiseResults.forEach((result) => {
    if (result.candidate1Votes > result.candidate2Votes) {
      victories.push({
        winner: result.candidate1,
        loser: result.candidate2,
        margin: result.candidate1Votes - result.candidate2Votes,
      });
    } else if (result.candidate2Votes > result.candidate1Votes) {
      victories.push({
        winner: result.candidate2,
        loser: result.candidate1,
        margin: result.candidate2Votes - result.candidate1Votes,
      });
    }
  });

  return victories.sort((a, b) => a.winner.localeCompare(b.winner));
};

export const calculateSmithSet = (
  victories: Victory[],
  election: Election
): string[] => {
  // Get all candidates from the election data
  const candidates = election.candidates.map((c: Candidate) => c.name);

  // Create defeat graph
  const defeats = new Map<string, Set<string>>();
  candidates.forEach((c: string) => defeats.set(c, new Set()));

  // Fill in victories
  victories.forEach((v) => {
    defeats.get(v.winner)?.add(v.loser);
  });

  // Helper function: can candidate A reach candidate B through victories?
  const canReach = (
    start: string,
    target: string,
    visited = new Set<string>()
  ): boolean => {
    if (start === target) return true;
    if (visited.has(start)) return false;

    visited.add(start);
    const beatenCandidates = defeats.get(start) || new Set();
    return Array.from(beatenCandidates).some((c: string) =>
      canReach(c, target, visited)
    );
  };

  // A candidate is in the Smith set if they can reach all others OR
  // have a winning or tied record against everyone not in their reach
  const isInSmithSet = (candidate: string): boolean => {
    // If there are no victories, all candidates should be in the Smith set
    if (victories.length === 0) return true;

    const reachableCandidates = new Set(
      candidates.filter(
        (other: string) => candidate === other || canReach(candidate, other)
      )
    );

    const unreachableCandidates = candidates.filter(
      (c: string) => !reachableCandidates.has(c)
    );

    // Check if candidate has non-losing record against unreachable candidates
    const hasNonLosingRecord = unreachableCandidates.every((other: string) => {
      const losesToOther = victories.some(
        (v) => v.winner === other && v.loser === candidate
      );
      return !losesToOther;
    });

    return reachableCandidates.size === candidates.length || hasNonLosingRecord;
  };

  // Calculate Smith set
  return candidates.filter(isInSmithSet).sort();
};

export const selectWinner = (
  smithSet: string[],
  victories: Victory[],
  election: Election,
  returnAllScores: boolean = false
): CandidateScore[] => {
  // First calculate all metrics for each candidate
  const scores: CandidateScore[] = smithSet.map((candidate) => {
    const wins = victories.filter((v) => v.winner === candidate).length;
    const losses = victories.filter((v) => v.loser === candidate).length;
    const netVictories = wins - losses;

    const victoryMargins = victories
      .filter((v) => v.winner === candidate)
      .map((v) => v.margin);
    const avgMargin =
      victoryMargins.length > 0
        ? victoryMargins.reduce((sum, m) => sum + m, 0) / victoryMargins.length
        : 0;

    const candidateId =
      election.candidates.find((c) => c.name === candidate)?.id || '';
    const approvalScore = election.votes.filter((vote) =>
      vote.approved.includes(candidateId)
    ).length;

    return {
      name: candidate,
      approvalScore,
      netVictories,
      wins,
      losses,
      avgMargin,
      rank: 0,
      isTied: false,
      description: '',
      metrics: {
        approval: approvalScore,
        headToHead: netVictories,
        margin: avgMargin,
      },
    };
  });

  // Sort using updated waterfall approach
  const sortedScores = scores.sort((a, b) => {
    // 1. First compare by approval votes
    if (a.metrics.approval !== b.metrics.approval) {
      return b.metrics.approval - a.metrics.approval;
    }

    // 2. If approval tied, check direct matchup
    const directMatchup = victories.find(
      (v) =>
        (v.winner === a.name && v.loser === b.name) ||
        (v.winner === b.name && v.loser === a.name)
    );

    if (directMatchup) {
      return directMatchup.winner === a.name ? -1 : 1;
    }

    // 3. If no direct matchup or tied, compare head-to-head record
    if (a.metrics.headToHead !== b.metrics.headToHead) {
      return b.metrics.headToHead - a.metrics.headToHead;
    }

    // 4. If head-to-head tied, compare average margin
    return b.metrics.margin - a.metrics.margin;
  });

  // Helper: check if two candidates are truly tied across all tiebreaker levels
  const areTied = (a: CandidateScore, b: CandidateScore): boolean => {
    if (a.metrics.approval !== b.metrics.approval) return false;
    const directMatchup = victories.some(
      (v) =>
        (v.winner === a.name && v.loser === b.name) ||
        (v.winner === b.name && v.loser === a.name)
    );
    if (directMatchup) return false;
    if (a.metrics.headToHead !== b.metrics.headToHead) return false;
    if (a.metrics.margin !== b.metrics.margin) return false;
    return true;
  };

  // Helper: determine the deciding factor between two candidates
  const getDecidingFactor = (
    current: CandidateScore,
    prev: CandidateScore
  ): string => {
    if (current.metrics.approval !== prev.metrics.approval) {
      return '\nRanked by approval votes';
    }
    const directMatchup = victories.find(
      (v) =>
        (v.winner === current.name && v.loser === prev.name) ||
        (v.winner === prev.name && v.loser === current.name)
    );
    if (directMatchup) {
      return '\nRanked by direct head-to-head matchup';
    }
    if (current.metrics.headToHead !== prev.metrics.headToHead) {
      return '\nRanked by head-to-head record';
    }
    if (current.metrics.margin !== prev.metrics.margin) {
      return '\nRanked by average victory margin';
    }
    return '';
  };

  let currentRank = 1;

  sortedScores.forEach((score, index) => {
    const nextCand = sortedScores[index + 1];
    const prevCand = sortedScores[index - 1];

    // Determine if current rank should increment
    if (index > 0 && prevCand && !areTied(score, prevCand)) {
      currentRank = index + 1;
    }

    score.rank = currentRank;

    // Check for ties with adjacent candidates
    score.isTied =
      (!!nextCand && areTied(score, nextCand)) ||
      (!!prevCand && areTied(score, prevCand));

    // Create detailed description showing which metric determined the ranking
    const rankText = score.isTied
      ? `Tied for ${score.rank}${getOrdinalSuffix(score.rank)} place`
      : `${score.rank}${getOrdinalSuffix(score.rank)} place`;

    const decidingFactor =
      index > 0 && prevCand ? getDecidingFactor(score, prevCand) : '';

    score.description = [
      rankText,
      `Approval Votes: ${score.approvalScore}`,
      `Head-to-Head Record: ${score.netVictories > 0 ? '+' : ''}${score.netVictories} (${score.wins} wins, ${score.losses} losses)`,
      `Average Victory Margin: ${score.avgMargin.toFixed(2)}`,
      decidingFactor,
      score.isTied ? '\nNo head-to-head victory between tied candidates' : '',
    ]
      .join('\n')
      .trim();
  });

  return sortedScores;
};

// Helper function for ordinal suffixes
export const getOrdinalSuffix = (n: number): string => {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
};
