import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyCumulative } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React, { useState } from 'react';
import type { Election } from './types';

const CumulativeResults: React.FC<{ election: Election }> = ({ election }) => {
  const maxWinners = election.candidates.length;
  const [numWinners, setNumWinners] = useState(Math.min(3, maxWinners));
  const result = tallyCumulative(election.votes, election.candidates, numWinners);
  const maxPoints = result.totals[0]?.points || 1;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Cumulative Voting</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{election.votes.length} total votes</span>
        </div>
      </div>

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

      <div className="space-y-3">
        {result.totals.map((entry, index) => {
          const isWinner = index < numWinners;
          const percentage = maxPoints > 0 ? ((entry.points / maxPoints) * 100).toFixed(1) : '0';
          return (
            <Card key={entry.candidateId} className={isWinner ? 'border-green-300 bg-green-50' : ''}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {index === 0 && <Medal className="w-5 h-5 text-yellow-500" />}
                    <span className="font-bold text-slate-900">{entry.name}</span>
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{entry.points} pts</span>
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
            Each voter receives a fixed number of points to distribute among candidates however they like —
            all on one candidate or spread across many. The candidates with the most total points win.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default CumulativeResults;
