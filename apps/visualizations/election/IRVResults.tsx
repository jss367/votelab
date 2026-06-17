import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyIRV } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React from 'react';
import type { Election } from './types';

const IRVResults: React.FC<{ election: Election }> = ({ election }) => {
  const result = tallyIRV(election.votes, election.candidates);
  const totalVotes = election.votes.length;
  // Look up winner name from candidates
  const winnerName = election.candidates.find(c => c.id === result.winner)?.name || result.winner;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Instant Runoff Voting</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{totalVotes} total votes</span>
        </div>
      </div>

      <div className="text-center">
        <div className="inline-flex items-center gap-2 bg-green-50 border border-green-300 rounded-lg px-4 py-2">
          <Medal className="w-5 h-5 text-yellow-500" />
          <span className="font-bold text-green-900">Winner: {winnerName}</span>
        </div>
      </div>

      <div className="space-y-4">
        {result.rounds.map((round, roundIndex) => {
          // Look up eliminated name
          const eliminatedName = round.eliminated
            ? (election.candidates.find(c => c.id === round.eliminated)?.name || round.eliminated)
            : null;

          return (
            <Card key={roundIndex}>
              <CardHeader>
                <CardTitle className="text-lg">
                  Round {roundIndex + 1}
                  {eliminatedName && (
                    <span className="text-sm font-normal text-red-600 ml-2">
                      — {eliminatedName} eliminated
                    </span>
                  )}
                  {!round.eliminated && roundIndex === result.rounds.length - 1 && (
                    <span className="text-sm font-normal text-green-600 ml-2">
                      — {winnerName} wins
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {round.counts.map((entry) => {
                    const percentage = totalVotes > 0 ? ((entry.count / totalVotes) * 100).toFixed(1) : '0';
                    const isEliminated = entry.candidateId === round.eliminated;

                    return (
                      <div key={entry.candidateId} className={`flex items-center gap-3 ${isEliminated ? 'opacity-50' : ''}`}>
                        <span className="w-32 text-sm font-medium text-slate-700 truncate">{entry.name}</span>
                        <div className="flex-grow bg-slate-200 rounded-full h-2">
                          <div className="h-2 rounded-full bg-blue-400" style={{ width: `${percentage}%` }} />
                        </div>
                        <span className="text-sm text-slate-600 w-20 text-right">{entry.count} ({percentage}%)</span>
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
            Voters rank candidates. Each round, the candidate with the fewest first-choice votes is eliminated and their votes transfer to the next choice. This continues until one candidate has a majority.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default IRVResults;
