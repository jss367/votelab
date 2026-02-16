import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallySTV } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React, { useState } from 'react';
import type { Election } from './types';

const STVResults: React.FC<{ election: Election }> = ({ election }) => {
  const maxWinners = election.candidates.length;
  const [numWinners, setNumWinners] = useState(Math.min(3, maxWinners));
  const result = tallySTV(election.votes, election.candidates, numWinners);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Single Transferable Vote (STV)</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{election.votes.length} total votes</span>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-slate-700">Number of seats:</label>
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
          <p className="text-xs text-slate-500 mt-1">Droop quota: {result.quota}</p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {result.winners.map((winner, index) => (
          <Card key={winner.candidateId} className={index === 0 ? 'border-green-300 bg-green-50' : ''}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {index === 0 && <Medal className="w-5 h-5 text-yellow-500" />}
                  <span className="font-bold text-slate-900">{winner.name}</span>
                </div>
                <span className="text-sm text-slate-500">Elected round {winner.round}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900">Round-by-Round</h3>
        {result.rounds.map((round, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-lg">
                Round {i + 1}
                {round.elected && <span className="text-sm font-normal text-green-600 ml-2">— {election.candidates.find(c => c.id === round.elected)?.name} elected</span>}
                {round.eliminated && <span className="text-sm font-normal text-red-600 ml-2">— {election.candidates.find(c => c.id === round.eliminated)?.name} eliminated</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {round.counts.map((entry) => (
                  <div key={entry.candidateId} className="flex items-center gap-3">
                    <span className={`w-32 text-sm font-medium truncate ${
                      entry.candidateId === round.elected ? 'text-green-700' :
                      entry.candidateId === round.eliminated ? 'text-red-600' : 'text-slate-700'
                    }`}>{entry.name}</span>
                    <div className="flex-grow bg-slate-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          entry.candidateId === round.elected ? 'bg-green-500' :
                          entry.candidateId === round.eliminated ? 'bg-red-400' : 'bg-blue-400'
                        }`}
                        style={{ width: `${round.quota > 0 ? Math.min(100, (entry.count / round.quota) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-sm text-slate-600 w-16 text-right">{entry.count.toFixed(1)}</span>
                  </div>
                ))}
                <div className="border-l-2 border-dashed border-blue-300 ml-32 pl-2 text-xs text-blue-600">
                  Quota: {round.quota}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle className="text-blue-900">How It Works</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800">
            Voters rank candidates. A quota is calculated (Droop quota). Candidates exceeding the quota are
            elected, and their surplus votes transfer proportionally to the next preference. If no one meets
            the quota, the lowest candidate is eliminated and their votes transfer. This continues until all
            seats are filled.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default STVResults;
