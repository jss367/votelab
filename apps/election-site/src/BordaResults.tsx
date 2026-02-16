import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyBorda } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React from 'react';
import type { Election } from './types';

const BordaResults: React.FC<{ election: Election }> = ({ election }) => {
  const result = tallyBorda(election.votes, election.candidates);
  const maxScore = result.scores[0]?.score || 1;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Borda Count</p>
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
                  <div className="text-right">
                    <span className="text-2xl font-bold text-slate-900">{entry.score}</span>
                    <span className="text-sm text-slate-500 ml-2">points</span>
                  </div>
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
            Voters rank all candidates. Each ranking position awards points: {election.candidates.length - 1} points for 1st place, {election.candidates.length - 2} for 2nd, down to 0 for last. Highest total wins.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default BordaResults;
