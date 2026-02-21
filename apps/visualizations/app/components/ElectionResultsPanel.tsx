'use client';

import React, { useMemo } from 'react';
import {
  Voter,
  SpatialCandidate,
  VotingMethod,
  getVoterPreferences,
  computePluralityWinner,
  computeApprovalWinner,
  computeBordaWinner,
  computeIRVWinner,
  computeCondorcetWinner,
  computeSmithApprovalWinner,
} from '@votelab/shared-utils';

interface ElectionResultsPanelProps {
  voters: Voter[];
  candidates: SpatialCandidate[];
  method: VotingMethod;
  approvalThreshold: number;
}

const METHOD_NAMES: Record<VotingMethod, string> = {
  plurality: 'Plurality',
  approval: 'Approval',
  irv: 'Instant Runoff (IRV)',
  borda: 'Borda Count',
  condorcet: 'Condorcet',
  smithApproval: 'Smith Set + Approval',
  star: 'STAR',
  rrv: 'Reweighted Range (RRV)',
  score: 'Score',
  stv: 'STV',
  rankedPairs: 'Ranked Pairs',
  majorityJudgment: 'Majority Judgment',
  cumulative: 'Cumulative',
};

export const ElectionResultsPanel: React.FC<ElectionResultsPanelProps> = ({
  voters,
  candidates,
  method,
  approvalThreshold,
}) => {
  // Generate all ballots
  const ballots = useMemo(() => {
    return voters.map((voter) => {
      const prefs = getVoterPreferences(voter, candidates);
      if (prefs.length === 0) {
        return { ranking: [], approved: [] };
      }

      // Always approve closest candidate, plus others within threshold of closest
      // But never approve ALL candidates
      const closestDistance = prefs[0].distance;
      const maxToApprove = prefs.length - 1;
      const approved: string[] = [prefs[0].candidateId];

      for (let i = 1; i < prefs.length && approved.length < maxToApprove; i++) {
        if (prefs[i].distance <= closestDistance + approvalThreshold) {
          approved.push(prefs[i].candidateId);
        }
      }

      return {
        ranking: prefs.map((p) => p.candidateId),
        approved,
      };
    });
  }, [voters, candidates, approvalThreshold]);

  // Compute tallies
  const tallies = useMemo(() => {
    const firstChoice: Record<string, number> = {};
    const approvals: Record<string, number> = {};
    const bordaScores: Record<string, number> = {};

    candidates.forEach((c) => {
      firstChoice[c.id] = 0;
      approvals[c.id] = 0;
      bordaScores[c.id] = 0;
    });

    const n = candidates.length;
    ballots.forEach((ballot) => {
      // First choice
      if (ballot.ranking.length > 0) {
        firstChoice[ballot.ranking[0]]++;
      }
      // Approvals
      ballot.approved.forEach((id) => {
        approvals[id]++;
      });
      // Borda
      ballot.ranking.forEach((id, idx) => {
        bordaScores[id] += n - 1 - idx;
      });
    });

    return { firstChoice, approvals, bordaScores };
  }, [ballots, candidates]);

  // Compute pairwise matrix for Condorcet
  const pairwiseMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    candidates.forEach((c1) => {
      matrix[c1.id] = {};
      candidates.forEach((c2) => {
        matrix[c1.id][c2.id] = 0;
      });
    });

    ballots.forEach((ballot) => {
      for (let i = 0; i < ballot.ranking.length; i++) {
        for (let j = i + 1; j < ballot.ranking.length; j++) {
          matrix[ballot.ranking[i]][ballot.ranking[j]]++;
        }
      }
    });

    return matrix;
  }, [ballots, candidates]);

  // Compute winners for all methods
  const results = useMemo(() => {
    if (voters.length === 0) return null;

    return {
      plurality: computePluralityWinner(voters, candidates),
      approval: computeApprovalWinner(voters, candidates, approvalThreshold),
      irv: computeIRVWinner(voters, candidates),
      borda: computeBordaWinner(voters, candidates),
      condorcet: computeCondorcetWinner(voters, candidates),
      smithApproval: computeSmithApprovalWinner(voters, candidates, approvalThreshold),
    };
  }, [voters, candidates, approvalThreshold]);

  // Create candidate lookups
  const candidateNames = useMemo(() => {
    const map: Record<string, string> = {};
    candidates.forEach((c) => (map[c.id] = c.name));
    return map;
  }, [candidates]);

  const candidateColors = useMemo(() => {
    const map: Record<string, string> = {};
    candidates.forEach((c) => (map[c.id] = c.color));
    return map;
  }, [candidates]);

  // Sort candidates by first choice votes for display
  const sortedByFirstChoice = useMemo(() => {
    return [...candidates].sort(
      (a, b) => tallies.firstChoice[b.id] - tallies.firstChoice[a.id]
    );
  }, [candidates, tallies]);

  if (voters.length === 0) {
    return (
      <div className="border rounded p-3 bg-gray-50">
        <h3 className="font-semibold mb-2">Election Results</h3>
        <p className="text-sm text-gray-500">No voters to tally.</p>
      </div>
    );
  }

  return (
    <div className="border rounded p-3 bg-gray-50 space-y-4">
      <div>
        <h3 className="font-semibold mb-1">Election Results</h3>
        <p className="text-xs text-gray-500">{voters.length} voters</p>
      </div>

      {/* Winner by Method */}
      {results && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Winners</h4>
          <div className="space-y-1">
            {(Object.keys(METHOD_NAMES) as VotingMethod[]).map((m) => {
              const winnerId = results[m];
              const isCurrentMethod = m === method;
              return (
                <div
                  key={m}
                  className={`text-sm flex justify-between items-center px-2 py-1 rounded ${
                    isCurrentMethod ? 'bg-blue-100 border border-blue-300' : ''
                  }`}
                >
                  <span className="text-gray-600">{METHOD_NAMES[m]}</span>
                  <span
                    style={{ color: candidateColors[winnerId] }}
                    className="font-semibold"
                  >
                    {candidateNames[winnerId]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* First Choice Votes */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">First Choice Votes</h4>
        <div className="space-y-1">
          {sortedByFirstChoice.map((c) => {
            const count = tallies.firstChoice[c.id];
            const pct = ((count / voters.length) * 100).toFixed(1);
            return (
              <div key={c.id} className="text-sm">
                <div className="flex justify-between">
                  <span style={{ color: c.color }} className="font-medium">
                    {c.name}
                  </span>
                  <span>
                    {count} ({pct}%)
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${(count / voters.length) * 100}%`,
                      backgroundColor: c.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Approval Votes */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Approval Votes</h4>
        <div className="space-y-1">
          {[...candidates]
            .sort((a, b) => tallies.approvals[b.id] - tallies.approvals[a.id])
            .map((c) => {
              const count = tallies.approvals[c.id];
              const pct = ((count / voters.length) * 100).toFixed(1);
              return (
                <div key={c.id} className="text-sm flex justify-between">
                  <span style={{ color: c.color }} className="font-medium">
                    {c.name}
                  </span>
                  <span>
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Borda Scores */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Borda Scores</h4>
        <div className="space-y-1">
          {[...candidates]
            .sort((a, b) => tallies.bordaScores[b.id] - tallies.bordaScores[a.id])
            .map((c) => (
              <div key={c.id} className="text-sm flex justify-between">
                <span style={{ color: c.color }} className="font-medium">
                  {c.name}
                </span>
                <span>{tallies.bordaScores[c.id]}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Pairwise Matrix */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Pairwise Matchups</h4>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr>
                <th className="text-left p-1"></th>
                {candidates.map((c) => (
                  <th
                    key={c.id}
                    className="p-1 text-center"
                    style={{ color: c.color }}
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candidates.map((c1) => (
                <tr key={c1.id}>
                  <td className="p-1 font-medium" style={{ color: c1.color }}>
                    {c1.name}
                  </td>
                  {candidates.map((c2) => {
                    if (c1.id === c2.id) {
                      return (
                        <td key={c2.id} className="p-1 text-center text-gray-300">
                          -
                        </td>
                      );
                    }
                    const wins = pairwiseMatrix[c1.id][c2.id];
                    const losses = pairwiseMatrix[c2.id][c1.id];
                    const isWinner = wins > losses;
                    return (
                      <td
                        key={c2.id}
                        className={`p-1 text-center ${
                          isWinner ? 'font-bold text-green-600' : 'text-gray-500'
                        }`}
                      >
                        {wins}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Cell shows votes preferring row over column
        </p>
      </div>
    </div>
  );
};
