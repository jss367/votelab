import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyStar } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React from 'react';
import type { Election } from './types';

const STARResults: React.FC<{ election: Election }> = ({ election }) => {
  const result = tallyStar(election.votes, election.candidates);
  const maxScore = result.scoringRound[0]?.score || 1;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">STAR Voting (Score Then Automatic Runoff)</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{election.votes.length} total votes</span>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Scoring Round</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {result.scoringRound.map((entry, index) => {
              const percentage = maxScore > 0 ? ((entry.score / maxScore) * 100).toFixed(1) : '0';
              const isFinalist = index < 2;
              return (
                <div key={entry.candidateId} className="flex items-center gap-3">
                  <span className={`w-32 text-sm font-medium truncate ${isFinalist ? 'text-blue-700' : 'text-slate-700'}`}>
                    {entry.name}
                  </span>
                  <div className="flex-grow bg-slate-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${isFinalist ? 'bg-blue-500' : 'bg-slate-400'}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-600 w-12 text-right">{entry.score}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">Top 2 advance to the automatic runoff.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Automatic Runoff</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {result.finalists.map((f, index) => {
              const isWinner = index === 0;
              return (
                <div key={f.candidateId} className={`flex items-center justify-between p-3 rounded-lg ${isWinner ? 'bg-green-50 border border-green-300' : 'bg-slate-50 border border-slate-200'}`}>
                  <div className="flex items-center gap-2">
                    {isWinner && <Medal className="w-5 h-5 text-yellow-500" />}
                    <span className="font-bold text-slate-900">{f.name}</span>
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{f.runoffVotes} votes</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle className="text-blue-900">How It Works</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800">
            Voters score each candidate 0-5. The two highest-scoring candidates advance to an automatic runoff,
            where each ballot counts as one vote for whichever finalist the voter scored higher. The finalist
            preferred by more voters wins.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default STARResults;
