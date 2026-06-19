import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyCondorcet } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React from 'react';
import type { Election } from './types';

const CondorcetResults: React.FC<{ election: Election }> = ({ election }) => {
  const result = tallyCondorcet(election.votes, election.candidates);
  // Look up winner name from candidates
  const winnerName = result.winner
    ? (election.candidates.find(c => c.id === result.winner)?.name || result.winner)
    : null;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Condorcet Method</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{election.votes.length} total votes</span>
        </div>
      </div>

      <div className="text-center">
        {winnerName ? (
          <div className="inline-flex items-center gap-2 bg-green-50 border border-green-300 rounded-lg px-4 py-2">
            <Medal className="w-5 h-5 text-yellow-500" />
            <span className="font-bold text-green-900">Condorcet Winner: {winnerName}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-2">
            <span className="font-bold text-yellow-900">No Condorcet Winner (cycle detected)</span>
          </div>
        )}
      </div>

      {/* Pairwise matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Pairwise Matchups</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left"></th>
                  {election.candidates.map((c) => (
                    <th key={c.id} className="p-2 text-center font-medium text-slate-700">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {election.candidates.map((row) => (
                  <tr key={row.id}>
                    <td className="p-2 font-medium text-slate-700">{row.name}</td>
                    {election.candidates.map((col) => {
                      if (row.id === col.id) {
                        return <td key={col.id} className="p-2 text-center text-slate-300">—</td>;
                      }
                      const wins = result.matrix[row.id]?.[col.id] || 0;
                      const losses = result.matrix[col.id]?.[row.id] || 0;
                      const isWin = wins > losses;
                      return (
                        <td
                          key={col.id}
                          className={`p-2 text-center font-medium ${isWin ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}
                        >
                          {wins}–{losses}
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
            A Condorcet winner is a candidate who would beat every other candidate in a one-on-one matchup.
            The table above shows how each pair of candidates fared. If no single candidate beats all others, there is a cycle.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default CondorcetResults;
