import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyRRV } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React, { useState } from 'react';
import type { Election } from './types';

const RRVResults: React.FC<{ election: Election }> = ({ election }) => {
  const maxWinners = election.candidates.length;
  const [numWinners, setNumWinners] = useState(Math.min(3, maxWinners));

  const result = tallyRRV(election.votes, election.candidates, numWinners);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Reweighted Range Voting</p>
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

      {/* Winners list */}
      <div className="space-y-3">
        {result.winners.map((winner, index) => (
          <Card key={winner.candidateId} className={index === 0 ? 'border-green-300 bg-green-50' : ''}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {index === 0 && <Medal className="w-5 h-5 text-yellow-500" />}
                  <span className="font-bold text-slate-900">{winner.name}</span>
                </div>
                <span className="text-sm text-slate-500">Round {winner.round}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Round details */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900">Round-by-Round Breakdown</h3>
        {result.rounds.map((round, roundIndex) => {
          const maxScore = round.weightedScores[0]?.score || 1;
          return (
            <Card key={roundIndex}>
              <CardHeader>
                <CardTitle className="text-lg">
                  Round {roundIndex + 1}
                  <span className="text-sm font-normal text-green-600 ml-2">
                    — {round.winnerName} wins
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {round.weightedScores.map((entry) => {
                    const percentage = maxScore > 0 ? ((entry.score / maxScore) * 100).toFixed(1) : '0';
                    const isWinner = entry.candidateId === round.winnerId;
                    return (
                      <div key={entry.candidateId} className="flex items-center gap-3">
                        <span className={`w-32 text-sm font-medium truncate ${isWinner ? 'text-green-700' : 'text-slate-700'}`}>
                          {entry.name}
                        </span>
                        <div className="flex-grow bg-slate-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${isWinner ? 'bg-green-500' : 'bg-blue-400'}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-sm text-slate-600 w-16 text-right">
                          {entry.score.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
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
            Each voter scores all candidates 0–10. The highest-scoring candidate wins the first slot.
            Then each voter's ballot is reweighted downward based on how much they supported the winner.
            Voters who gave the winner a high score lose influence, while voters who gave a low score keep
            their full weight. This ensures proportional representation across multiple winners.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default RRVResults;
