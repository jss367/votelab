import { Card, CardContent, CardHeader, CardTitle, Tooltip } from '@repo/ui';
import type { CandidateScore } from '@votelab/shared-utils';
import {
  calculateSmithSet,
  getHeadToHeadVictories,
  getOrdinalSuffix,
  getPairwiseResults,
  selectWinner,
  type PairwiseResult,
} from '@votelab/shared-utils';
import {
  CheckCircle2,
  Medal,
  Star,
  Swords,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import React from 'react';
import ApprovalVotes from './ApprovalVotes';
import type { Election } from './types';

const formatDescription = (description: string) => {
  const parts = description.split(/\n|(?=Ranked by)/);
  return parts.filter((part) => part.trim()).map((part) => part.trim());
};

// Helper function to truncate filenames intelligently
const truncateFilename = (filename: string) => {
  // If it's a downloading file pattern, clean it up
  if (filename.startsWith('Downloading ')) {
    // Extract just the main filename without version and metadata
    const match = filename.match(/Downloading ([^-]+)-[\d.]+.*?(?:\s|$)/);
    if (match) {
      return `Downloading ${match[1]}`;
    }
  }

  // Truncate in middle
  if (filename.length > 60) {
    const start = filename.slice(0, 45);
    const end = filename.slice(-10);
    return `${start}...${end}`;
  }

  return filename;
};

interface CustomFieldDisplayProps {
  candidate: CandidateScore;
  election: Election;
}

const CustomFieldDisplay: React.FC<CustomFieldDisplayProps> = ({
  candidate,
  election,
}) => {
  const foundCandidate = election.candidates.find(
    (c) => c.name === candidate.name
  );
  if (!foundCandidate?.customFields?.length || !election.customFields?.length) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-2 mt-3 p-3 rounded-md bg-white/50">
      {foundCandidate.customFields.map((field) => {
        const fieldDef = election.customFields?.find(
          (f) => f.id === field.fieldId
        );
        if (!fieldDef) {
          return null;
        }
        return (
          <div key={field.fieldId} className="text-sm">
            <span className="font-medium text-slate-700">{fieldDef.name}:</span>{' '}
            <span className="text-slate-600">{field.value?.toString()}</span>
          </div>
        );
      })}
    </div>
  );
};

const ElectionResults: React.FC<{ election: Election }> = ({ election }) => {
  if (!election || !election.candidates || !election.votes) {
    return (
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>No election data available</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please check the URL and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (election.votes.length === 0) {
    return (
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle className="text-xl">
            Election Results: {election.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No votes have been cast yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pairwiseResults = getPairwiseResults(election);
  const victories = getHeadToHeadVictories(pairwiseResults);
  const smithSet = calculateSmithSet(victories, election);
  const rankedCandidates =
    smithSet.length > 0
      ? selectWinner(smithSet, victories, election, true)
      : [];

  return (
    <div className="space-y-8 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-slate-900 line-clamp-2">
          {election.title}
        </h1>
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Users className="w-5 h-5" />
          <span className="text-lg">{election.votes.length} total votes</span>
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid gap-6">
        {rankedCandidates.map((candidate: CandidateScore) => {
          const isFirstPlace = candidate.rank === 1;
          const hasTie = candidate.isTied;
          const descriptionParts = formatDescription(candidate.description);

          return (
            <div
              key={candidate.name}
              className={`transform transition-all duration-200 hover:scale-[1.02] ${
                isFirstPlace
                  ? hasTie
                    ? 'bg-gradient-to-br from-amber-50 to-yellow-50 shadow-yellow-100'
                    : 'bg-gradient-to-br from-emerald-50 to-green-50 shadow-emerald-100'
                  : 'bg-gradient-to-br from-slate-50 to-gray-50'
              } rounded-xl shadow-lg border border-slate-200 overflow-hidden`}
            >
              <div className="p-6">
                {/* Header with fixed height */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 min-h-[100px]">
                  <div className="space-y-1 flex-shrink">
                    <div className="flex items-start gap-2">
                      {isFirstPlace && (
                        <Medal className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                      )}
                      <h2 className="text-xl sm:text-2xl font-bold text-slate-900 line-clamp-2">
                        {candidate.name}
                      </h2>
                    </div>
                    <p
                      className={`text-sm font-medium ${
                        isFirstPlace
                          ? hasTie
                            ? 'text-yellow-700'
                            : 'text-green-700'
                          : 'text-slate-600'
                      }`}
                    >
                      {hasTie
                        ? `Tied for ${candidate.rank}${getOrdinalSuffix(candidate.rank)} place`
                        : `${candidate.rank}${getOrdinalSuffix(candidate.rank)} place`}
                    </p>
                  </div>

                  {/* Metrics Grid with fixed width */}
                  <div className="grid grid-cols-3 gap-4 flex-shrink-0 w-full sm:w-auto">
                    <MetricBox
                      icon={<CheckCircle2 className="w-5 h-5 text-blue-500" />}
                      value={candidate.metrics.approval}
                      label="Approval Votes"
                    />
                    <MetricBox
                      icon={
                        candidate.metrics.headToHead >= 0 ? (
                          <TrendingUp className="w-5 h-5 text-green-500" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-red-500" />
                        )
                      }
                      value={`${candidate.metrics.headToHead > 0 ? '+' : ''}${candidate.metrics.headToHead}`}
                      label="Net H2H"
                    />
                    <MetricBox
                      icon={<Users className="w-5 h-5 text-purple-500" />}
                      value={candidate.metrics.margin.toFixed(2)}
                      label="Avg Margin"
                    />
                  </div>
                </div>

                {/* Custom Fields Display */}
                <CustomFieldDisplay candidate={candidate} election={election} />

                {/* Description with consistent padding */}
                <div
                  className={`mt-6 p-4 font-mono rounded-lg ${
                    isFirstPlace
                      ? hasTie
                        ? 'bg-yellow-100/50 text-yellow-800'
                        : 'bg-green-100/50 text-green-800'
                      : 'bg-slate-100/50 text-slate-700'
                  }`}
                >
                  <p className="text-sm whitespace-pre-line">
                    {descriptionParts.join('\n')}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Methodology Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">
            How Rankings are Determined
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800 mb-4">
            After selecting the Smith set (candidates who collectively beat all
            others), candidates are ranked by:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-blue-800">
            <li className="flex items-start gap-2">
              <span className="mt-1">
                <CheckCircle2 className="w-4 h-4 text-blue-500" />
              </span>
              <span>Number of approval votes</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1">
                <Swords className="w-4 h-4 text-blue-500" />
              </span>
              <span>If tied, direct matchup result</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1">
                <TrendingUp className="w-4 h-4 text-blue-500" />
              </span>
              <span>
                If still tied, head-to-head record (net wins minus losses)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1">
                <Medal className="w-4 h-4 text-blue-500" />
              </span>
              <span>If still tied, average victory margin</span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Smith Set Section */}
      {smithSet.length > 0 && (
        <Card className="bg-gradient-to-br from-violet-50 to-purple-50 border-purple-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <Star className="w-5 h-5 text-purple-500" />
              Smith Set
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-purple-900 mb-4">
              The Smith set contains the smallest group of candidates who
              collectively beat all other candidates.{' '}
              {smithSet.length === 1
                ? 'This candidate was selected for final ranking:'
                : `These ${smithSet.length} candidates were selected for final ranking:`}
            </p>
            <div className="flex flex-wrap gap-2">
              {smithSet.map((candidate: string) => (
                <span
                  key={candidate}
                  className="inline-flex items-center px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-medium"
                >
                  {candidate}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval Votes Section */}
      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-slate-900 text-center">
          Approval Votes
        </h3>
        <ApprovalVotes election={election} />
      </div>

      {/* Head-to-head Results */}
      {pairwiseResults.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-slate-900 text-center">
            Head-to-head Matchups
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {pairwiseResults.map((result: PairwiseResult, index: number) => (
              <Card
                key={index}
                className="hover:shadow-lg transition-shadow duration-200"
              >
                <CardContent className="pt-6">
                  <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
                    <div className="text-center flex flex-col justify-between h-full">
                      <div className="min-h-[4.5rem] flex items-center justify-center">
                        <Tooltip content={result.candidate1}>
                          <p className="font-bold text-sm sm:text-base text-slate-900 line-clamp-3 px-1">
                            {truncateFilename(result.candidate1)}
                          </p>
                        </Tooltip>
                      </div>
                      <div className="mt-2">
                        <p className="text-2xl sm:text-3xl font-bold text-blue-600">
                          {result.candidate1Votes}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-500">
                          votes
                        </p>
                      </div>
                    </div>

                    <div className="text-xl font-bold text-slate-400 self-center">
                      VS
                    </div>

                    <div className="text-center flex flex-col justify-between h-full">
                      <div className="min-h-[4.5rem] flex items-center justify-center">
                        <Tooltip content={result.candidate2}>
                          <p className="font-bold text-sm sm:text-base text-slate-900 line-clamp-3 px-1">
                            {truncateFilename(result.candidate2)}
                          </p>
                        </Tooltip>
                      </div>
                      <div className="mt-2">
                        <p className="text-2xl sm:text-3xl font-bold text-blue-600">
                          {result.candidate2Votes}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-500">
                          votes
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-200">
                    <p className="text-center font-medium">
                      Winner:{' '}
                      {result.candidate1Votes > result.candidate2Votes
                        ? result.candidate1
                        : result.candidate2Votes > result.candidate1Votes
                          ? result.candidate2
                          : 'Tie'}
                      {result.candidate1Votes !== result.candidate2Votes &&
                        ` (by ${Math.abs(result.candidate1Votes - result.candidate2Votes)} votes)`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper component for metrics
const MetricBox: React.FC<{
  icon: React.ReactNode;
  value: string | number;
  label: string;
}> = ({ icon, value, label }) => (
  <div className="text-center space-y-1">
    <div className="flex items-center justify-center">{icon}</div>
    <p className="text-xl sm:text-2xl font-bold text-slate-900 line-clamp-1">
      {value}
    </p>
    <p className="text-xs text-slate-500 line-clamp-1">{label}</p>
  </div>
);

export default ElectionResults;
