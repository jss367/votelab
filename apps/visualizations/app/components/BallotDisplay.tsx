import React from 'react';
import { type Ballot } from '../utils/ballotGeneration';

interface BallotDisplayProps {
  ballots: Ballot[];
  candidates: Array<{ id: string; name: string }>;
}

export function BallotDisplay({ ballots, candidates }: BallotDisplayProps) {
  if (!ballots.length) return null;

  const getCandidateName = (id: string) =>
    candidates.find((c) => c.id === id)?.name || id;

  if (ballots[0].type === 'ranked') {
    // Count frequency of each ranking
    const rankingCounts = ballots.reduce(
      (acc, ballot) => {
        const key = (ballot as { rankings: string[] }).rankings
          .map((id) => getCandidateName(id))
          .join(' > ');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Sort by count descending
    const sortedRankings = Object.entries(rankingCounts).sort(
      ([, a], [, b]) => b - a
    );

    const totalBallots = ballots.length;

    // Calculate election results
    const results = calculateIRVResults(ballots, candidates);

    return (
      <div className="space-y-6">
        <div className="bg-gray-800 text-white p-4 rounded-lg">
          <h4 className="text-lg font-bold mb-4">Ballot Distribution</h4>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            <div className="font-mono">Ranking</div>
            <div className="font-mono text-right">Count</div>
            {sortedRankings.map(([ranking, count], index) => (
              <div key={ranking + index} className="flex justify-between">
                <div className="font-mono">{ranking}</div>
                <div className="font-mono text-right">{count}</div>
              </div>
            ))}
            <div className="font-mono border-t mt-2 pt-2">Total Ballots:</div>
            <div className="font-mono text-right border-t mt-2 pt-2">
              {totalBallots}
            </div>
          </div>
        </div>

        <div className="bg-gray-800 text-white p-4 rounded-lg">
          <h4 className="text-lg font-bold mb-4">Election Results</h4>
          <h5 className="font-bold mb-2">FINAL RESULT</h5>
          <div className="grid grid-cols-3 gap-4">
            <div className="font-mono">Candidate</div>
            <div className="font-mono text-right">Votes</div>
            <div className="font-mono">Status</div>
            {results.map(({ candidate, votes, status }) => (
              <React.Fragment key={candidate}>
                <div className="font-mono">{getCandidateName(candidate)}</div>
                <div className="font-mono text-right">{votes}</div>
                <div className="font-mono">{status}</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ... handle other ballot types similarly ...
}

function calculateIRVResults(
  ballots: Ballot[],
  candidates: Array<{ id: string; name: string }>
) {
  // Implement IRV calculation logic here
  // This should return an array of { candidate: string, votes: number, status: string }
  // showing the final round results

  // For now, returning placeholder data
  return candidates.map((c) => ({
    candidate: c.id,
    votes: 0,
    status: 'Unknown',
  }));
}
