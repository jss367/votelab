import { Card, CardContent } from '@repo/ui';
import { Candidate, Election, Vote } from '@votelab/shared-utils';
import React from 'react';

interface ApprovalVotesProps {
  election: Election;
}

interface ApprovalCount {
  name: string;
  count: number;
  percentage: string;
}

const ApprovalVotes: React.FC<ApprovalVotesProps> = ({ election }) => {
  const approvalCounts: ApprovalCount[] = election.candidates
    .map((candidate: Candidate) => ({
      name: candidate.name,
      count: election.votes.filter((vote: Vote) =>
        vote.approved.includes(candidate.id)
      ).length,
      percentage: (
        (election.votes.filter((vote: Vote) =>
          vote.approved.includes(candidate.id)
        ).length /
          election.votes.length) *
        100
      ).toFixed(1),
    }))
    .sort((a: ApprovalCount, b: ApprovalCount) => b.count - a.count);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {approvalCounts.map((candidate: ApprovalCount) => (
        <Card
          key={candidate.name}
          className="hover:shadow-lg transition-shadow duration-200"
        >
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <p className="font-bold text-lg text-slate-900">
                {candidate.name}
              </p>
              <p className="text-3xl font-bold text-blue-600">
                {candidate.count}
              </p>
              <p className="text-sm text-slate-500">
                {candidate.percentage}% of voters approved
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ApprovalVotes;
