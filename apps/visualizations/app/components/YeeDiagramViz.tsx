'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  VoterBloc,
  SpatialCandidate,
  VotingMethod,
  createVoterBloc,
  createPresetPopulation,
  generatePopulation,
} from '@votelab/shared-utils';
import { SingleYeeDiagram } from './SingleYeeDiagram';
import { VoterConfigPanel } from './VoterConfigPanel';
import { BallotInspector } from './BallotInspector';
import { ElectionResultsPanel } from './ElectionResultsPanel';
import { YEE_PRESETS, YeePreset } from './yeeDiagramPresets';

const DEFAULT_CANDIDATES: SpatialCandidate[] = [
  { id: 'a', name: 'A', x: 0.25, y: 0.25, color: '#ef4444' },
  { id: 'b', name: 'B', x: 0.75, y: 0.25, color: '#3b82f6' },
  { id: 'c', name: 'C', x: 0.5, y: 0.75, color: '#22c55e' },
];

const CANDIDATE_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
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

export const YeeDiagramViz: React.FC = () => {
  const [candidates, setCandidates] = useState<SpatialCandidate[]>(DEFAULT_CANDIDATES);
  const [blocs, setBlocs] = useState<VoterBloc[]>(() =>
    createPresetPopulation('uniform', 1000).blocs
  );
  const [approvalThreshold, setApprovalThreshold] = useState(0.3);
  const [resolution, setResolution] = useState(40);
  const [inspectedPoint, setInspectedPoint] = useState<{ x: number; y: number; method: VotingMethod } | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Generate voters only on client to avoid hydration mismatch
  useEffect(() => {
    setIsClient(true);
  }, []);

  const voters = React.useMemo(
    () => (isClient ? generatePopulation(blocs) : []),
    [blocs, isClient]
  );

  const handleCandidateDrag = useCallback((id: string, x: number, y: number) => {
    setCandidates(prev => prev.map(c =>
      c.id === id ? { ...c, x, y } : c
    ));
  }, []);

  const handlePointClick = useCallback((point: { x: number; y: number }, method: VotingMethod) => {
    setInspectedPoint({ ...point, method });
  }, []);

  const handleAddBloc = useCallback((position: { x: number; y: number }) => {
    const newBloc = createVoterBloc(position, 200, 0.1);
    setBlocs(prev => [...prev, newBloc]);
  }, []);

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
    setCandidates(prev => [...prev, newCandidate]);
  }, [candidates.length]);

  const handleRemoveCandidate = useCallback((id: string) => {
    if (candidates.length <= 2) return;
    setCandidates(prev => prev.filter(c => c.id !== id));
  }, [candidates.length]);

  const handleLoadPreset = useCallback((preset: YeePreset) => {
    setCandidates(preset.candidates);
    if (preset.blocs) {
      setBlocs(preset.blocs);
    }
    if (preset.approvalThreshold !== undefined) {
      setApprovalThreshold(preset.approvalThreshold);
    }
  }, []);

  return (
    <div className="p-4">
      {/* Presets */}
      {YEE_PRESETS.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-amber-800">Example Scenarios:</span>
            {YEE_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => handleLoadPreset(preset)}
                className="px-3 py-1 text-sm bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded"
                title={preset.description}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="mb-4 flex gap-4 items-center flex-wrap">
        {/* Candidates */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Candidates:</span>
          {candidates.map(c => (
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

        <div className="border-l pl-4 flex items-center gap-2">
          <label className="text-sm">Approval Threshold: {approvalThreshold.toFixed(2)}</label>
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

        <div className="flex items-center gap-2">
          <label className="text-sm">Resolution: {resolution}</label>
          <input
            type="range"
            min="20"
            max="80"
            step="10"
            value={resolution}
            onChange={(e) => setResolution(Number(e.target.value))}
            className="w-24"
          />
        </div>
      </div>

      <div className="flex gap-4">
        {/* Main grid of diagrams */}
        <div className="flex-1">
          <div className="grid grid-cols-3 gap-4">
            {METHODS.map(m => (
              <SingleYeeDiagram
                key={m.value}
                voters={voters}
                candidates={candidates}
                method={m.value}
                label={m.label}
                resolution={resolution}
                approvalThreshold={approvalThreshold}
                onCandidateDrag={handleCandidateDrag}
                onPointClick={handlePointClick}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center gap-4">
            <p className="text-sm text-gray-500">
              Drag candidates to move them. Click to inspect ballots.
            </p>
            <button
              onClick={() => setShowHelp(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              How to read these diagrams?
            </button>
          </div>
        </div>

        {/* Side panel */}
        <div className="w-80 space-y-4">
          {/* Candidate Positions */}
          <div className="border rounded p-3 bg-gray-50">
            <h3 className="font-semibold mb-2">Candidate Positions</h3>
            <div className="space-y-2">
              {candidates.map(c => (
                <div key={c.id} className="flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="w-6 font-medium">{c.name}</span>
                  <label className="text-xs text-gray-500">x:</label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={c.x.toFixed(2)}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      setCandidates(prev => prev.map(cand =>
                        cand.id === c.id ? { ...cand, x: val } : cand
                      ));
                    }}
                    className="w-16 px-1 py-0.5 text-sm border rounded"
                  />
                  <label className="text-xs text-gray-500">y:</label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={c.y.toFixed(2)}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      setCandidates(prev => prev.map(cand =>
                        cand.id === c.id ? { ...cand, y: val } : cand
                      ));
                    }}
                    className="w-16 px-1 py-0.5 text-sm border rounded"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Coordinates range from 0 to 1. You can also drag candidates on the diagrams.
            </p>
          </div>

          <VoterConfigPanel
            blocs={blocs}
            onBlocsChange={setBlocs}
            onAddBloc={handleAddBloc}
          />
          <ElectionResultsPanel
            voters={voters}
            candidates={candidates}
            method="plurality"
            approvalThreshold={approvalThreshold}
          />
        </div>
      </div>

      {/* Ballot Inspector Modal */}
      {inspectedPoint && (
        <BallotInspector
          point={inspectedPoint}
          voters={voters}
          candidates={candidates}
          method={inspectedPoint.method}
          approvalThreshold={approvalThreshold}
          onClose={() => setInspectedPoint(null)}
        />
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold">How to Read Yee Diagrams</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)] space-y-4">
              <section>
                <h3 className="font-semibold text-blue-800">What Each Pixel Color Means</h3>
                <p className="text-sm text-gray-700 mt-1">
                  For each point in the diagram, the color indicates <strong>which candidate would win</strong> an
                  election among the voters near that point. We sample voters within a radius of 0.12 around
                  each point and run the voting method on their preferences.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">How Voters Vote</h3>
                <p className="text-sm text-gray-700 mt-1">
                  Each voter ranks candidates by distance—closer candidates are preferred. For approval voting,
                  voters approve all candidates within the threshold distance (adjustable in controls).
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">Voting Methods</h3>
                <ul className="text-sm text-gray-700 mt-1 space-y-1">
                  <li><strong>Plurality:</strong> Most first-choice votes wins</li>
                  <li><strong>Approval:</strong> Most approvals wins (voters always approve their closest candidate, plus others within threshold distance of that candidate)</li>
                  <li><strong>IRV:</strong> Eliminate lowest candidate, transfer votes; repeat until majority</li>
                  <li><strong>Borda:</strong> Points by rank position (N-1 for 1st, N-2 for 2nd, etc.)</li>
                  <li><strong>Condorcet:</strong> Beats all others head-to-head (falls back to IRV if no winner)</li>
                  <li><strong>Smith + Approval:</strong> Approval winner among Smith Set candidates</li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">What to Look For</h3>
                <ul className="text-sm text-gray-700 mt-1 space-y-1">
                  <li><strong>Agreement:</strong> Areas where all methods show same color = clear winner</li>
                  <li><strong>Disagreement:</strong> Different colors = methods produce different outcomes</li>
                  <li><strong>Center squeeze:</strong> Centrist loses despite broad support (Plurality/IRV)</li>
                  <li><strong>Spoiler effect:</strong> Adding candidate changes winner among others (Plurality)</li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-blue-800">Controls</h3>
                <ul className="text-sm text-gray-700 mt-1 space-y-1">
                  <li><strong>Drag candidates:</strong> Reposition on any diagram</li>
                  <li><strong>Click anywhere:</strong> Open Ballot Inspector to see exact votes</li>
                  <li><strong>Approval Threshold:</strong> Distance for approval (affects Approval & Smith+Approval)</li>
                  <li><strong>Resolution:</strong> Detail level (higher = slower but more precise)</li>
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
