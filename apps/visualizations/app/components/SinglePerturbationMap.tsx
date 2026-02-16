// apps/visualizations/app/components/SinglePerturbationMap.tsx
'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Voter,
  SpatialCandidate,
  VotingMethod,
  getPerturbationCellInfo,
} from '@votelab/shared-utils';
import { usePerturbationMap } from '../../lib/usePerturbationMap';

interface SinglePerturbationMapProps {
  voters: Voter[];
  candidates: SpatialCandidate[];
  targetCandidate: SpatialCandidate;
  method: VotingMethod;
  resolution: number;
  maxVoterPercent: number;
  approvalThreshold: number;
  onCellClick: (row: number, col: number, targetCandidate: SpatialCandidate) => void;
}

interface TooltipData {
  x: number;
  y: number;
  voterPercent: number;
  shiftMagnitude: number;
  winner: string;
  votersShifted: number;
}

export const SinglePerturbationMap: React.FC<SinglePerturbationMapProps> = ({
  voters,
  candidates,
  targetCandidate,
  method,
  resolution,
  maxVoterPercent,
  approvalThreshold,
  onCellClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const { result, isComputing } = usePerturbationMap({
    voters,
    candidates,
    targetCandidate,
    method,
    resolution,
    maxVoterPercent,
    approvalThreshold,
  });

  // Render the perturbation map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { grid } = result;
    if (!grid.length || !grid[0]?.length) return;

    const cellWidth = canvas.width / grid[0].length;
    const cellHeight = canvas.height / grid.length;

    const colorMap: Record<string, string> = {};
    candidates.forEach((c) => (colorMap[c.id] = c.color));

    // Draw grid
    grid.forEach((row, rowIdx) => {
      row.forEach((winnerId, colIdx) => {
        ctx.fillStyle = colorMap[winnerId] || '#cccccc';
        ctx.fillRect(
          colIdx * cellWidth,
          rowIdx * cellHeight,
          cellWidth + 1,
          cellHeight + 1
        );
      });
    });

    // Draw axis labels
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('voters %', canvas.width / 2, canvas.height - 2);

    ctx.save();
    ctx.translate(10, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('shift %', 0, 0);
    ctx.restore();
  }, [result, candidates]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !result) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const col = Math.floor((x / rect.width) * resolution);
      const row = Math.floor((y / rect.height) * resolution);

      if (col < 0 || col >= resolution || row < 0 || row >= resolution) {
        setTooltip(null);
        return;
      }

      const info = getPerturbationCellInfo(
        {
          candidates,
          voters,
          targetCandidate,
          method,
          resolution,
          maxVoterPercent,
          approvalThreshold,
        },
        row,
        col
      );

      setTooltip({
        x: e.clientX,
        y: e.clientY,
        ...info,
      });
    },
    [
      result,
      candidates,
      voters,
      targetCandidate,
      method,
      resolution,
      maxVoterPercent,
      approvalThreshold,
    ]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const col = Math.floor(((e.clientX - rect.left) / rect.width) * resolution);
      const row = Math.floor(((e.clientY - rect.top) / rect.height) * resolution);

      if (col >= 0 && col < resolution && row >= 0 && row < resolution) {
        onCellClick(row, col, targetCandidate);
      }
    },
    [resolution, targetCandidate, onCellClick]
  );

  const winnerName =
    tooltip && candidates.find((c) => c.id === tooltip.winner)?.name;

  return (
    <div className="flex flex-col items-center">
      <div className="text-sm font-medium mb-1 flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: targetCandidate.color }}
        />
        Shift toward {targetCandidate.name}
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={200}
          height={200}
          className="border border-gray-300 cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        />
        {isComputing && (
          <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
            <span className="text-xs text-gray-500">Computing...</span>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y + 10,
          }}
        >
          <div>
            {(tooltip.voterPercent * 100).toFixed(0)}% voters shifted{' '}
            {(tooltip.shiftMagnitude * 100).toFixed(0)}%
          </div>
          <div>
            Winner: <strong>{winnerName}</strong> ({tooltip.votersShifted} voters
            moved)
          </div>
        </div>
      )}
    </div>
  );
};
