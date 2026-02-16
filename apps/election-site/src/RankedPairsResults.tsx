import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyRankedPairs } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React from 'react';
import type { Election } from './types';

const RankedPairsResults: React.FC<{ election: Election }> = ({ election }) => {
  const result = tallyRankedPairs(election.votes, election.candidates);
  const candidateMap = new Map(election.candidates.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Ranked Pairs (Tideman)</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{election.votes.length} total votes</span>
        </div>
      </div>

      <Card className="border-green-300 bg-green-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2">
            <Medal className="w-5 h-5 text-yellow-500" />
            <span className="font-bold text-slate-900 text-lg">{candidateMap.get(result.winner)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Locked Pairs (by margin)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {result.lockedPairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-green-700">{candidateMap.get(pair.winner)}</span>
                <span className="text-slate-400">beats</span>
                <span className="font-medium text-slate-700">{candidateMap.get(pair.loser)}</span>
                <span className="text-slate-500 ml-auto">margin: {pair.margin}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pairwise Matrix</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr>
                  <th className="p-2"></th>
                  {election.candidates.map((c) => (
                    <th key={c.id} className="p-2 text-slate-700 font-medium">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {election.candidates.map((row) => (
                  <tr key={row.id}>
                    <td className="p-2 font-medium text-slate-700">{row.name}</td>
                    {election.candidates.map((col) => {
                      const rowColVal = result.matrix[row.id]?.[col.id] ?? 0;
                      const colRowVal = result.matrix[col.id]?.[row.id] ?? 0;
                      return (
                        <td key={col.id} className={`p-2 text-center ${
                          row.id === col.id ? 'bg-slate-100 text-slate-400' :
                          rowColVal > colRowVal ? 'text-green-700 font-bold' : 'text-slate-600'
                        }`}>
                          {row.id === col.id ? '-' : rowColVal}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle className="text-blue-900">How It Works</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800">
            Voters rank candidates. All pairwise matchups are computed. Pairs are locked in order of
            victory margin (largest first), skipping any that would create a cycle. The candidate who
            is never defeated in locked pairs wins.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default RankedPairsResults;
