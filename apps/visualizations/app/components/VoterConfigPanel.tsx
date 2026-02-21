'use client';

import React, { useState, useCallback } from 'react';
import {
  VoterBloc,
  VoterPreset,
  createPresetPopulation,
} from '@votelab/shared-utils';

interface VoterConfigPanelProps {
  blocs: VoterBloc[];
  onBlocsChange: (blocs: VoterBloc[]) => void;
  onAddBloc: (position: { x: number; y: number }) => void;
}

const PRESETS: { value: VoterPreset; label: string }[] = [
  { value: 'uniform', label: 'Uniform Grid' },
  { value: 'centered', label: 'Centered' },
  { value: 'polarized', label: 'Polarized (2 blocs)' },
  { value: 'triangle', label: 'Triangle (3 blocs)' },
  { value: 'custom', label: 'Custom' },
];

export const VoterConfigPanel: React.FC<VoterConfigPanelProps> = ({
  blocs,
  onBlocsChange,
  onAddBloc: _onAddBloc,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<VoterPreset>('uniform');
  const [totalVoters, setTotalVoters] = useState(1000);
  const [isExpanded, setIsExpanded] = useState(false);

  const handlePresetChange = useCallback((preset: VoterPreset) => {
    setSelectedPreset(preset);
    if (preset !== 'custom') {
      const { blocs: newBlocs } = createPresetPopulation(preset, totalVoters);
      onBlocsChange(newBlocs);
    }
  }, [totalVoters, onBlocsChange]);

  const handleTotalVotersChange = useCallback((count: number) => {
    setTotalVoters(count);
    if (selectedPreset !== 'custom') {
      const { blocs: newBlocs } = createPresetPopulation(selectedPreset, count);
      onBlocsChange(newBlocs);
    }
  }, [selectedPreset, onBlocsChange]);

  const handleRemoveBloc = useCallback((blocId: string) => {
    onBlocsChange(blocs.filter(b => b.id !== blocId));
    setSelectedPreset('custom');
  }, [blocs, onBlocsChange]);

  const handleBlocCountChange = useCallback((blocId: string, count: number) => {
    onBlocsChange(blocs.map(b =>
      b.id === blocId ? { ...b, count } : b
    ));
    setSelectedPreset('custom');
  }, [blocs, onBlocsChange]);

  const handleBlocSpreadChange = useCallback((blocId: string, spread: number) => {
    onBlocsChange(blocs.map(b =>
      b.id === blocId ? { ...b, spread } : b
    ));
    setSelectedPreset('custom');
  }, [blocs, onBlocsChange]);

  const actualTotal = blocs.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="border rounded bg-gray-50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex justify-between items-center hover:bg-gray-100"
      >
        <span className="font-semibold">Voter Distribution</span>
        <span className="text-sm text-gray-500">
          {actualTotal} voters {isExpanded ? '▲' : '▼'}
        </span>
      </button>

      {isExpanded && (
        <div className="p-3 border-t space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Preset</label>
            <select
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value as VoterPreset)}
              className="w-full p-2 border rounded"
            >
              {PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Total Voters: {actualTotal}
            </label>
            <input
              type="range"
              min="100"
              max="5000"
              step="100"
              value={totalVoters}
              onChange={(e) => handleTotalVotersChange(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Voter Blocs ({blocs.length})</label>
              <span className="text-xs text-gray-500">Shift+click diagram to add</span>
            </div>

            {blocs.map((bloc, index) => (
              <div key={bloc.id} className="p-2 bg-white rounded border text-sm">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium">Bloc {index + 1}</span>
                  <button
                    onClick={() => handleRemoveBloc(bloc.id)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Remove
                  </button>
                </div>
                <div className="text-xs text-gray-500 mb-2">
                  Position: ({bloc.position.x.toFixed(2)}, {bloc.position.y.toFixed(2)})
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs">Count: {bloc.count}</label>
                    <input
                      type="range"
                      min="50"
                      max="2000"
                      step="50"
                      value={bloc.count}
                      onChange={(e) => handleBlocCountChange(bloc.id, Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs">Spread: {bloc.spread.toFixed(2)}</label>
                    <input
                      type="range"
                      min="0.02"
                      max="0.3"
                      step="0.02"
                      value={bloc.spread}
                      onChange={(e) => handleBlocSpreadChange(bloc.id, Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
