'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import {
  Voter,
  SpatialCandidate,
  VotingMethod,
} from '@votelab/shared-utils';
import { useYeeDiagram } from '../../lib/useYeeDiagram';

interface SingleYeeDiagramProps {
  voters: Voter[];
  candidates: SpatialCandidate[];
  method: VotingMethod;
  label: string;
  resolution: number;
  approvalThreshold: number;
  onCandidateDrag: (id: string, x: number, y: number) => void;
  onPointClick: (point: { x: number; y: number }, method: VotingMethod) => void;
}

export const SingleYeeDiagram: React.FC<SingleYeeDiagramProps> = ({
  voters,
  candidates,
  method,
  label,
  resolution,
  approvalThreshold,
  onCandidateDrag,
  onPointClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<string | null>(null);

  const { result, isComputing } = useYeeDiagram({
    voters,
    candidates,
    method,
    resolution,
    approvalThreshold,
  });

  // Render the diagram
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { grid, candidates: candList } = result;
    if (!grid.length || !grid[0]?.length) return;

    const cellWidth = canvas.width / grid[0].length;
    const cellHeight = canvas.height / grid.length;

    const colorMap: Record<string, string> = {};
    candList.forEach(c => (colorMap[c.id] = c.color));

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

    // Draw candidates at their CURRENT positions (not from result)
    candidates.forEach(c => {
      const x = c.x * canvas.width;
      const y = c.y * canvas.height;

      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();

      ctx.fillStyle = 'black';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.name, x, y - 14);
    });
  }, [result, candidates]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Check if clicking on a candidate
    for (const c of candidates) {
      const dx = x - c.x;
      const dy = y - c.y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.05) {
        draggingRef.current = c.id;
        return;
      }
    }

    // Otherwise, open inspector
    onPointClick({ x, y }, method);
  }, [candidates, method, onPointClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    onCandidateDrag(draggingRef.current, x, y);
  }, [onCandidateDrag]);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  return (
    <div className="flex flex-col items-center">
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={200}
          height={200}
          className="border border-gray-300 cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        {isComputing && (
          <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
            <span className="text-xs text-gray-500">...</span>
          </div>
        )}
      </div>
    </div>
  );
};
