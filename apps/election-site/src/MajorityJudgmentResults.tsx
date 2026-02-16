import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { tallyMajorityJudgment, MJ_GRADES } from '@votelab/shared-utils';
import { Medal, Users } from 'lucide-react';
import React from 'react';
import type { Election } from './types';

const GRADE_COLORS = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#22c55e', '#10b981'];

const MajorityJudgmentResults: React.FC<{ election: Election }> = ({ election }) => {
  const result = tallyMajorityJudgment(election.votes, election.candidates);
  const totalVotes = election.votes.length;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{election.title}</h1>
        <p className="text-sm text-slate-500">Majority Judgment</p>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span>{totalVotes} total votes</span>
        </div>
      </div>

      <div className="space-y-3">
        {result.medianGrades.map((entry, index) => {
          const isWinner = index === 0;
          return (
            <Card key={entry.candidateId} className={isWinner ? 'border-green-300 bg-green-50' : ''}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isWinner && <Medal className="w-5 h-5 text-yellow-500" />}
                    <span className="font-bold text-slate-900">{entry.name}</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: GRADE_COLORS[entry.medianGrade] }}>
                    Median: {MJ_GRADES[entry.medianGrade]}
                  </span>
                </div>
                <div className="flex rounded-full h-4 overflow-hidden">
                  {entry.gradeCounts.map((count, gradeIndex) => {
                    const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={gradeIndex}
                        style={{ width: `${pct}%`, backgroundColor: GRADE_COLORS[gradeIndex] }}
                        title={`${MJ_GRADES[gradeIndex]}: ${count}`}
                        className="h-full"
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1 text-xs text-slate-500">
                  <span>Reject</span>
                  <span>Excellent</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {MJ_GRADES.map((label, i) => (
          <div key={i} className="flex items-center gap-1 text-xs">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: GRADE_COLORS[i] }} />
            <span className="text-slate-600">{label}</span>
          </div>
        ))}
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle className="text-blue-900">How It Works</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800">
            Each voter assigns a grade (Reject through Excellent) to each candidate. The candidate with the
            highest median grade wins. Ties are broken by iteratively removing one median-grade vote from
            tied candidates until their medians differ.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MajorityJudgmentResults;
