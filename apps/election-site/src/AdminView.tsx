import { Button, Card, CardContent, CardHeader } from '@repo/ui';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import type { Election } from './types';

const METHOD_NAMES: Record<string, string> = {
  plurality: 'Plurality',
  approval: 'Approval',
  irv: 'Instant Runoff (IRV)',
  borda: 'Borda Count',
  condorcet: 'Condorcet',
  smithApproval: 'Smith + Approval',
  rrv: 'Reweighted Range Voting (RRV)',
};

interface AdminViewProps {
  election: Election;
  electionId: string;
  onCloseSubmissions: () => void;
  onCloseVoting: () => void;
  onReopenVoting: () => void;
  onDelete: () => void;
}

const AdminView: React.FC<AdminViewProps> = ({
  election,
  electionId,
  onCloseSubmissions,
  onCloseVoting,
  onReopenVoting,
  onDelete,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const voteUrl = `${window.location.origin}${window.location.pathname}?id=${electionId}`;
  const resultsUrl = `${window.location.origin}${window.location.pathname}?id=${electionId}&view=results`;
  const method = election.votingMethod || 'smithApproval';

  const status = !election.submissionsClosed
    ? 'Accepting submissions'
    : election.votingOpen
      ? 'Voting open'
      : 'Voting closed';

  return (
    <div className="space-y-6">
      {/* Election info */}
      <div className="space-y-1">
        <p className="text-sm text-slate-500">
          {METHOD_NAMES[method] || method} &middot; Created by {election.createdBy} &middot;{' '}
          {new Date(election.createdAt).toLocaleDateString()}
        </p>
        <p className="text-sm font-medium">
          Status:{' '}
          <span
            className={
              status === 'Voting open'
                ? 'text-green-700'
                : status === 'Voting closed'
                  ? 'text-red-700'
                  : 'text-yellow-700'
            }
          >
            {status}
          </span>
        </p>
      </div>

      {/* Share links */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-bold text-slate-900">Share Links</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-slate-500">Voting link</label>
            <div className="flex gap-2">
              <input
                value={voteUrl}
                readOnly
                className="flex-1 p-2 rounded-md border border-slate-300 bg-slate-50 text-sm"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigator.clipboard.writeText(voteUrl)}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Results link</label>
            <div className="flex gap-2">
              <input
                value={resultsUrl}
                readOnly
                className="flex-1 p-2 rounded-md border border-slate-300 bg-slate-50 text-sm"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigator.clipboard.writeText(resultsUrl)}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-bold text-slate-900">Controls</h3>
        </CardHeader>
        <CardContent className="space-y-2">
          {!election.submissionsClosed && (
            <Button onClick={onCloseSubmissions} variant="secondary" className="w-full">
              Close Submissions & Start Voting
            </Button>
          )}
          {election.votingOpen && (
            <Button onClick={onCloseVoting} variant="secondary" className="w-full">
              Close Voting
            </Button>
          )}
          {election.submissionsClosed && !election.votingOpen && (
            <Button onClick={onReopenVoting} variant="secondary" className="w-full">
              Reopen Voting
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Candidates */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-bold text-slate-900">
            Candidates ({election.candidates.length})
          </h3>
        </CardHeader>
        <CardContent>
          {election.candidates.length === 0 ? (
            <p className="text-sm text-slate-500">No candidates yet.</p>
          ) : (
            <ul className="space-y-1">
              {election.candidates.map((c) => (
                <li key={c.id} className="text-sm p-2 bg-slate-50 rounded-md border border-slate-200">
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Voters */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-bold text-slate-900">
            Votes ({election.votes.length})
          </h3>
        </CardHeader>
        <CardContent>
          {election.votes.length === 0 ? (
            <p className="text-sm text-slate-500">No votes yet.</p>
          ) : (
            <ul className="space-y-1">
              {election.votes.map((v, i) => (
                <li
                  key={i}
                  className="text-sm p-2 bg-slate-50 rounded-md border border-slate-200 flex justify-between"
                >
                  <span>{v.voterName}</span>
                  <span className="text-slate-400">
                    {new Date(v.timestamp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader>
          <h3 className="text-sm font-bold text-red-700">Danger Zone</h3>
        </CardHeader>
        <CardContent>
          {!confirmDelete ? (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setConfirmDelete(true)}
            >
              Delete Election
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-red-700">
                This will permanently delete this election and all its votes. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={onDelete}
                >
                  Yes, Delete
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminView;
