'use client';

import React, { useMemo } from 'react';
import {
  Voter,
  SpatialCandidate,
  VotingMethod,
  getVoterPreferences,

  computePluralityWinner,
  computeApprovalWinner,
  computeBordaWinner,
  computeIRVWinner,
  computeCondorcetWinner,
  computeSmithApprovalWinner,
} from '@votelab/shared-utils';

interface Ballot {
  ranking: string[];
  approved: string[];
  voterId: number;
}

interface BallotInspectorProps {
  point: { x: number; y: number };
  voters: Voter[];
  candidates: SpatialCandidate[];
  method: VotingMethod;
  approvalThreshold: number;
  onClose: () => void;
}

const METHOD_NAMES: Record<VotingMethod, string> = {
  plurality: 'Plurality',
  approval: 'Approval',
  irv: 'Instant Runoff (IRV)',
  borda: 'Borda Count',
  condorcet: 'Condorcet',
  smithApproval: 'Smith Set + Approval',
  star: 'STAR',
  rrv: 'Reweighted Range (RRV)',
  score: 'Score',
  stv: 'STV',
  rankedPairs: 'Ranked Pairs',
  majorityJudgment: 'Majority Judgment',
  cumulative: 'Cumulative',
};

export const BallotInspector: React.FC<BallotInspectorProps> = ({
  point,
  voters,
  candidates,
  method,
  approvalThreshold,
  onClose,
}) => {
  // Find voters near the clicked point
  const nearbyVoters = useMemo(() => {
    const radius = 0.08; // How close voters need to be to the click point
    return voters.filter(voter => {
      const dx = voter.position.x - point.x;
      const dy = voter.position.y - point.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
  }, [voters, point]);

  // Generate ballots for each nearby voter
  const ballots: Ballot[] = useMemo(() => {
    return nearbyVoters.map((voter, idx) => {
      const prefs = getVoterPreferences(voter, candidates);
      if (prefs.length === 0) {
        return { voterId: idx + 1, ranking: [], approved: [] };
      }

      // Always approve closest candidate, plus others within threshold of closest
      // But never approve ALL candidates
      const closestDistance = prefs[0].distance;
      const maxToApprove = prefs.length - 1;
      const approved: string[] = [prefs[0].candidateId];

      for (let i = 1; i < prefs.length && approved.length < maxToApprove; i++) {
        if (prefs[i].distance <= closestDistance + approvalThreshold) {
          approved.push(prefs[i].candidateId);
        }
      }

      return {
        voterId: idx + 1,
        ranking: prefs.map(p => p.candidateId),
        approved,
      };
    });
  }, [nearbyVoters, candidates, approvalThreshold]);

  // Create candidate name lookup
  const candidateNames = useMemo(() => {
    const map: Record<string, string> = {};
    candidates.forEach(c => (map[c.id] = c.name));
    return map;
  }, [candidates]);

  // Create candidate color lookup
  const candidateColors = useMemo(() => {
    const map: Record<string, string> = {};
    candidates.forEach(c => (map[c.id] = c.color));
    return map;
  }, [candidates]);

  // Compute winners for all methods using nearby voters
  const results = useMemo(() => {
    if (nearbyVoters.length === 0) return null;

    const r: Partial<Record<VotingMethod, string>> = {
      plurality: computePluralityWinner(nearbyVoters, candidates),
      approval: computeApprovalWinner(nearbyVoters, candidates, approvalThreshold),
      irv: computeIRVWinner(nearbyVoters, candidates),
      borda: computeBordaWinner(nearbyVoters, candidates),
      condorcet: computeCondorcetWinner(nearbyVoters, candidates),
      smithApproval: computeSmithApprovalWinner(nearbyVoters, candidates, approvalThreshold),
    };

    // Debug logging
    console.log('[BallotInspector] ===== CLICK DEBUG =====');
    console.log('[BallotInspector] Clicked point (normalized):', { x: point.x.toFixed(3), y: point.y.toFixed(3) });
    console.log('[BallotInspector] If resolution=50, this would be grid cell:', {
      row: Math.floor(point.y * 50),
      col: Math.floor(point.x * 50)
    });
    console.log('[BallotInspector] Nearby voters:', nearbyVoters.length);
    console.log('[BallotInspector] Candidates:', candidates.map(c => ({ id: c.id, name: c.name, color: c.color, x: c.x.toFixed(2), y: c.y.toFixed(2) })));
    console.log('[BallotInspector] Winner by each method:', r);
    console.log('[BallotInspector] Current method:', method, '-> winner:', r[method]);
    console.log('[BallotInspector] ===== END CLICK DEBUG =====');

    return r;
  }, [nearbyVoters, candidates, approvalThreshold, point, method]);

  // Compute vote tallies
  const tallies = useMemo(() => {
    const firstChoice: Record<string, number> = {};
    const approvals: Record<string, number> = {};
    const bordaScores: Record<string, number> = {};

    candidates.forEach(c => {
      firstChoice[c.id] = 0;
      approvals[c.id] = 0;
      bordaScores[c.id] = 0;
    });

    const n = candidates.length;
    ballots.forEach(ballot => {
      // First choice
      if (ballot.ranking.length > 0) {
        firstChoice[ballot.ranking[0]]++;
      }
      // Approvals
      ballot.approved.forEach(id => {
        approvals[id]++;
      });
      // Borda
      ballot.ranking.forEach((id, idx) => {
        bordaScores[id] += (n - 1 - idx);
      });
    });

    return { firstChoice, approvals, bordaScores };
  }, [ballots, candidates]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-lg font-bold">Ballot Inspector</h2>
            <p className="text-sm text-gray-600">
              Point ({point.x.toFixed(2)}, {point.y.toFixed(2)}) - {nearbyVoters.length} voters nearby
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)]">
          {nearbyVoters.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No voters found near this point. Try clicking closer to a voter cluster.
            </p>
          ) : (
            <>
              {/* Ballots */}
              <div className="mb-6">
                <h3 className="font-semibold mb-2">Individual Ballots</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2 bg-gray-50">
                  {ballots.map((ballot, idx) => (
                    <div key={idx} className="text-sm font-mono bg-white p-2 rounded border">
                      <span className="text-gray-400">#{ballot.voterId}: </span>
                      <span>
                        {ballot.ranking.map((id, i) => (
                          <span key={id}>
                            {i > 0 && ' > '}
                            <span
                              style={{ color: candidateColors[id] }}
                              className="font-semibold"
                            >
                              {candidateNames[id]}
                            </span>
                          </span>
                        ))}
                      </span>
                      {ballot.approved.length > 0 && (
                        <span className="text-gray-500 ml-2">
                          [approved:{' '}
                          {ballot.approved.map((id, i) => (
                            <span key={id}>
                              {i > 0 && ', '}
                              <span style={{ color: candidateColors[id] }}>
                                {candidateNames[id]}
                              </span>
                            </span>
                          ))}
                          ]
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Vote Tallies */}
              <div className="mb-6">
                <h3 className="font-semibold mb-2">Vote Tallies</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="border rounded p-3">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">First Choice</h4>
                    {candidates.map(c => (
                      <div key={c.id} className="flex justify-between text-sm">
                        <span style={{ color: c.color }} className="font-medium">{c.name}</span>
                        <span>{tallies.firstChoice[c.id]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border rounded p-3">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Approvals</h4>
                    {candidates.map(c => (
                      <div key={c.id} className="flex justify-between text-sm">
                        <span style={{ color: c.color }} className="font-medium">{c.name}</span>
                        <span>{tallies.approvals[c.id]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border rounded p-3">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Borda Points</h4>
                    {candidates.map(c => (
                      <div key={c.id} className="flex justify-between text-sm">
                        <span style={{ color: c.color }} className="font-medium">{c.name}</span>
                        <span>{tallies.bordaScores[c.id]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Winners by Method */}
              {results && (
                <div>
                  <h3 className="font-semibold mb-2">Winner by Method</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(METHOD_NAMES) as VotingMethod[]).map(m => {
                      const winnerId = results[m];
                      if (!winnerId) return null;
                      const isCurrentMethod = m === method;
                      return (
                        <div
                          key={m}
                          className={`border rounded p-2 text-sm ${
                            isCurrentMethod ? 'border-blue-500 bg-blue-50' : ''
                          }`}
                        >
                          <span className="text-gray-600">{METHOD_NAMES[m]}: </span>
                          <span
                            style={{ color: candidateColors[winnerId] }}
                            className="font-semibold"
                          >
                            {candidateNames[winnerId]}
                          </span>
                          {isCurrentMethod && (
                            <span className="text-blue-600 text-xs ml-1">(current)</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-2 bg-gray-200 hover:bg-gray-300 rounded font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
