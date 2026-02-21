// apps/visualizations/app/components/PerturbationMapViz.tsx
'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  VoterBloc,
  SpatialCandidate,
  VotingMethod,
  Voter,
  createPresetPopulation,
  generatePopulation,
  getPerturbationCellInfo,
} from '@votelab/shared-utils';
import { SinglePerturbationMap } from './SinglePerturbationMap';
import { VoterConfigPanel } from './VoterConfigPanel';
import { BallotInspector } from './BallotInspector';
import { parseConfig, updateURL } from '../../lib/urlState';

const DEFAULT_CANDIDATES: SpatialCandidate[] = [
  { id: 'a', name: 'A', x: 0.25, y: 0.25, color: '#ef4444' },
  { id: 'b', name: 'B', x: 0.75, y: 0.25, color: '#3b82f6' },
  { id: 'c', name: 'C', x: 0.5, y: 0.75, color: '#22c55e' },
];

const CANDIDATE_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

const CANDIDATE_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const METHODS: { value: VotingMethod; label: string }[] = [
  { value: 'plurality', label: 'Plurality' },
  { value: 'approval', label: 'Approval' },
  { value: 'irv', label: 'Instant Runoff (IRV)' },
  { value: 'borda', label: 'Borda Count' },
  { value: 'condorcet', label: 'Condorcet' },
  { value: 'smithApproval', label: 'Smith + Approval' },
];

interface InspectedCell {
  row: number;
  col: number;
  targetCandidate: SpatialCandidate;
}

export const PerturbationMapViz: React.FC = () => {
  const [candidates, setCandidates] = useState<SpatialCandidate[]>(DEFAULT_CANDIDATES);
  const [blocs, setBlocs] = useState<VoterBloc[]>(() =>
    createPresetPopulation('uniform', 1000).blocs
  );
  const [method, setMethod] = useState<VotingMethod>('plurality');
  const [approvalThreshold, setApprovalThreshold] = useState(0.3);
  const [resolution] = useState(40);
  const [maxVoterPercent] = useState(0.5);
  const [isClient, setIsClient] = useState(false);
  const [inspectedCell, setInspectedCell] = useState<InspectedCell | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Parse URL on mount
  useEffect(() => {
    setIsClient(true);
    const params = new URLSearchParams(window.location.search);
    const config = parseConfig(params);
    if (config) {
      setCandidates(config.candidates);
      setBlocs(config.blocs);
      setMethod(config.method);
      setApprovalThreshold(config.approvalThreshold);
    }
  }, []);

  // Update URL when config changes
  useEffect(() => {
    if (!isClient) return;
    updateURL({ candidates, blocs, method, approvalThreshold });
  }, [candidates, blocs, method, approvalThreshold, isClient]);

  const voters = useMemo(
    () => (isClient ? generatePopulation(blocs) : []),
    [blocs, isClient]
  );

  const handleCellClick = useCallback(
    (row: number, col: number, targetCandidate: SpatialCandidate) => {
      setInspectedCell({ row, col, targetCandidate });
    },
    []
  );

  const handleAddCandidate = useCallback(() => {
    if (candidates.length >= 8) return;
    const idx = candidates.length;
    const newCandidate: SpatialCandidate = {
      id: CANDIDATE_NAMES[idx].toLowerCase(),
      name: CANDIDATE_NAMES[idx],
      x: 0.3 + Math.random() * 0.4,
      y: 0.3 + Math.random() * 0.4,
      color: CANDIDATE_COLORS[idx],
    };
    setCandidates((prev) => [...prev, newCandidate]);
  }, [candidates.length]);

  const handleRemoveCandidate = useCallback(
    (id: string) => {
      if (candidates.length <= 2) return;
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    },
    [candidates.length]
  );

  // Get perturbed voters for inspection
  const getPerturbedVotersForCell = useCallback(
    (cell: InspectedCell): Voter[] => {
      getPerturbationCellInfo(
        {
          candidates,
          voters,
          targetCandidate: cell.targetCandidate,
          method,
          resolution,
          maxVoterPercent,
          approvalThreshold,
        },
        cell.row,
        cell.col
      );

      // For now, return original voters - BallotInspector will show baseline
      // A more complete implementation would return the perturbed voters
      return voters;
    },
    [candidates, voters, method, resolution, maxVoterPercent, approvalThreshold]
  );

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Perturbation Maps</h1>
          <p className="text-sm text-gray-600">
            See how election results change as voters shift toward each candidate
          </p>
        </div>
        <a
          href="/yee"
          className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
        >
          ← Back to Yee Diagrams
        </a>
      </div>

      {/* Controls */}
      <div className="mb-4 flex gap-4 items-center flex-wrap">
        {/* Method selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Voting Method:</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as VotingMethod)}
            className="px-2 py-1 border rounded"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Candidates */}
        <div className="flex items-center gap-2 border-l pl-4">
          <span className="text-sm font-medium">Candidates:</span>
          {candidates.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-1 px-2 py-1 rounded border"
              style={{ borderColor: c.color }}
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="text-sm">{c.name}</span>
              {candidates.length > 2 && (
                <button
                  onClick={() => handleRemoveCandidate(c.id)}
                  className="text-gray-400 hover:text-red-500 ml-1"
                  title="Remove candidate"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {candidates.length < 8 && (
            <button
              onClick={handleAddCandidate}
              className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
              title="Add candidate"
            >
              + Add
            </button>
          )}
        </div>

        {(method === 'approval' || method === 'smithApproval') && (
          <div className="border-l pl-4 flex items-center gap-2">
            <label className="text-sm">
              Approval Threshold: {approvalThreshold.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.1"
              max="0.5"
              step="0.05"
              value={approvalThreshold}
              onChange={(e) => setApprovalThreshold(Number(e.target.value))}
              className="w-24"
            />
          </div>
        )}

        <button
          onClick={() => setShowHelp(true)}
          className="text-sm text-blue-600 hover:underline ml-auto"
        >
          How to read these maps?
        </button>
      </div>

      <div className="flex gap-4">
        {/* Grid of perturbation maps */}
        <div className="flex-1">
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${Math.min(candidates.length, 3)}, 1fr)`,
            }}
          >
            {candidates.map((candidate) => (
              <SinglePerturbationMap
                key={candidate.id}
                voters={voters}
                candidates={candidates}
                targetCandidate={candidate}
                method={method}
                resolution={resolution}
                maxVoterPercent={maxVoterPercent}
                approvalThreshold={approvalThreshold}
                onCellClick={handleCellClick}
              />
            ))}
          </div>

          <div className="mt-4 text-sm text-gray-500">
            <p>
              <strong>X-axis:</strong> % of persuadable voters who shift (0-50%)
            </p>
            <p>
              <strong>Y-axis:</strong> How far they shift toward the candidate (0-100%)
            </p>
            <p>
              <strong>Color:</strong> Who wins the election under that perturbation
            </p>
          </div>
        </div>

        {/* Side panel */}
        <div className="w-80">
          <VoterConfigPanel
            blocs={blocs}
            onBlocsChange={setBlocs}
            onAddBloc={(pos) => {
              const newBloc: VoterBloc = {
                id: `bloc-${Date.now()}`,
                position: pos,
                count: 200,
                spread: 0.1,
              };
              setBlocs((prev) => [...prev, newBloc]);
            }}
          />
        </div>
      </div>

      {/* Ballot Inspector Modal */}
      {inspectedCell && (
        <BallotInspector
          point={{
            x: inspectedCell.col / resolution,
            y: inspectedCell.row / resolution,
          }}
          voters={getPerturbedVotersForCell(inspectedCell)}
          candidates={candidates}
          method={method}
          approvalThreshold={approvalThreshold}
          onClose={() => setInspectedCell(null)}
        />
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold">How to Read Perturbation Maps</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)] space-y-4">
              <section>
                <h3 className="font-semibold text-blue-800">What This Shows</h3>
                <p className="text-sm text-gray-700 mt-1">
                  Each map shows what happens to the election when voters are
                  persuaded toward that candidate. Unlike Yee diagrams (which move
                  the electorate center), this shows &quot;what if some voters
                  changed their minds?&quot;
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">The Axes</h3>
                <ul className="text-sm text-gray-700 mt-1 space-y-1">
                  <li>
                    <strong>X-axis (horizontal):</strong> What percentage of
                    &quot;persuadable&quot; voters shift (0-50%)
                  </li>
                  <li>
                    <strong>Y-axis (vertical):</strong> How far those voters move
                    toward the candidate (0-100% of the distance)
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">
                  Who Are &quot;Persuadable&quot; Voters?
                </h3>
                <p className="text-sm text-gray-700 mt-1">
                  Voters who don&apos;t currently rank the target candidate first,
                  sorted by proximity to that candidate. These are the voters most
                  likely to be convinced by a campaign.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">What to Look For</h3>
                <ul className="text-sm text-gray-700 mt-1 space-y-1">
                  <li>
                    <strong>Smooth gradients:</strong> Stable methods where small
                    changes produce predictable outcomes
                  </li>
                  <li>
                    <strong>Fractured patterns:</strong> Chaotic methods where
                    tiny shifts can flip the winner
                  </li>
                  <li>
                    <strong>Large single-color regions:</strong> Robust results
                    that survive perturbation
                  </li>
                  <li>
                    <strong>Spoiler effects:</strong> Third-party colors appearing
                    when shifting toward one of the top two
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">Controls</h3>
                <ul className="text-sm text-gray-700 mt-1 space-y-1">
                  <li>
                    <strong>Hover:</strong> See exact perturbation parameters and
                    winner
                  </li>
                  <li>
                    <strong>Click:</strong> Open Ballot Inspector to see vote
                    breakdown
                  </li>
                  <li>
                    <strong>Voting Method:</strong> Compare stability across
                    methods
                  </li>
                </ul>
              </section>
            </div>
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowHelp(false)}
                className="w-full py-2 bg-gray-200 hover:bg-gray-300 rounded font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
