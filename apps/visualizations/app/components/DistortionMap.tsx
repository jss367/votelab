'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_APPROVAL_THRESHOLD,
  distance,
  SpatialCandidate,
  spatialVoteCalculators,
} from '../../lib/spatialVoting';

const CANVAS_SIZE = 300;
const SAMPLE_STEP = 3;

type MethodKey = 'plurality' | 'approval' | 'irv';

/**
 * Compute the ideal (Voronoi) winner: the candidate closest to the point.
 * This is the "correct" answer — the candidate nearest to the median voter always wins.
 */
function getIdealWinner(
  px: number,
  py: number,
  candidates: SpatialCandidate[]
): string {
  let minDist = Infinity;
  let winnerId = candidates[0].id;
  for (const c of candidates) {
    const d = distance(px, py, c.x, c.y);
    if (d < minDist) {
      minDist = d;
      winnerId = c.id;
    }
  }
  return winnerId;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const rgb = parseInt(hex.slice(1), 16);
  return {
    r: (rgb >> 16) & 255,
    g: (rgb >> 8) & 255,
    b: rgb & 255,
  };
}

const DistortionMap: React.FC = () => {
  const [candidates, setCandidates] = useState<SpatialCandidate[]>([
    { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'A' },
    { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'B' },
    { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'C' },
  ]);

  const methods: MethodKey[] = useMemo(() => ['plurality', 'approval', 'irv'], []);

  // Canvas refs: one ideal + one per method + one distortion overlay per method
  const idealCanvasRef = useRef<HTMLCanvasElement>(null);
  const methodCanvasRefs = useRef<Record<MethodKey, HTMLCanvasElement | null>>({
    plurality: null,
    approval: null,
    irv: null,
  });
  const distortionCanvasRefs = useRef<Record<MethodKey, HTMLCanvasElement | null>>({
    plurality: null,
    approval: null,
    irv: null,
  });

  const [isComputing, setIsComputing] = useState(false);
  const [computeProgress, setComputeProgress] = useState(0);
  const [distortionScores, setDistortionScores] = useState<Record<MethodKey, number>>({
    plurality: 0,
    approval: 0,
    irv: 0,
  });
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [hasComputed, setHasComputed] = useState(false);

  const availableColors = useMemo(
    () => [
      '#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6',
      '#ec4899', '#10b981', '#6366f1', '#f97316', '#06b6d4',
    ],
    []
  );

  const drawCandidates = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      candidates.forEach((candidate) => {
        ctx.beginPath();
        ctx.arc(
          candidate.x * CANVAS_SIZE,
          (1 - candidate.y) * CANVAS_SIZE,
          6,
          0,
          2 * Math.PI
        );
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = candidate.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'black';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          candidate.name,
          candidate.x * CANVAS_SIZE,
          (1 - candidate.y) * CANVAS_SIZE + 20
        );
      });
    },
    [candidates]
  );

  const initializeCanvases = useCallback(() => {
    const allRefs = [
      idealCanvasRef.current,
      ...Object.values(methodCanvasRefs.current),
      ...Object.values(distortionCanvasRefs.current),
    ];
    allRefs.forEach((canvas) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (!hasComputed) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      }
      drawCandidates(ctx);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasComputed, drawCandidates]);

  useEffect(() => {
    initializeCanvases();
  }, [initializeCanvases]);

  const handleCompute = async () => {
    setIsComputing(true);
    setComputeProgress(0);

    const candidateColors = candidates.reduce(
      (acc, c) => {
        acc[c.id] = hexToRgb(c.color);
        return acc;
      },
      {} as Record<string, { r: number; g: number; b: number }>
    );

    // Step 1: Compute the ideal (Voronoi) map
    const idealCanvas = idealCanvasRef.current;
    if (!idealCanvas) return;
    const idealCtx = idealCanvas.getContext('2d');
    if (!idealCtx) return;

    const idealImageData = idealCtx.createImageData(CANVAS_SIZE, CANVAS_SIZE);

    // Store ideal winners for comparison
    const idealWinners: string[][] = [];

    for (let y = 0; y < CANVAS_SIZE; y += SAMPLE_STEP) {
      const row: string[] = [];
      for (let x = 0; x < CANVAS_SIZE; x += SAMPLE_STEP) {
        const px = x / CANVAS_SIZE;
        const py = 1 - y / CANVAS_SIZE;
        const winnerId = getIdealWinner(px, py, candidates);
        row.push(winnerId);
        const color = candidateColors[winnerId];

        for (let dy = 0; dy < SAMPLE_STEP && y + dy < CANVAS_SIZE; dy++) {
          for (let dx = 0; dx < SAMPLE_STEP && x + dx < CANVAS_SIZE; dx++) {
            const idx = ((y + dy) * CANVAS_SIZE + (x + dx)) * 4;
            idealImageData.data[idx] = color.r;
            idealImageData.data[idx + 1] = color.g;
            idealImageData.data[idx + 2] = color.b;
            idealImageData.data[idx + 3] = 255;
          }
        }
      }
      idealWinners.push(row);
    }

    idealCtx.putImageData(idealImageData, 0, 0);
    drawCandidates(idealCtx);

    // Step 2: Compute each method and the distortion overlay
    const totalPixels = Math.ceil(CANVAS_SIZE / SAMPLE_STEP) * Math.ceil(CANVAS_SIZE / SAMPLE_STEP);
    const scores: Record<MethodKey, number> = { plurality: 0, approval: 0, irv: 0 };

    for (const method of methods) {
      const methodCanvas = methodCanvasRefs.current[method];
      const distortionCanvas = distortionCanvasRefs.current[method];
      if (!methodCanvas || !distortionCanvas) continue;

      const methodCtx = methodCanvas.getContext('2d');
      const distortionCtx = distortionCanvas.getContext('2d');
      if (!methodCtx || !distortionCtx) continue;

      const methodImageData = methodCtx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
      const distortionImageData = distortionCtx.createImageData(CANVAS_SIZE, CANVAS_SIZE);

      let disagreeCount = 0;
      let rowIdx = 0;

      for (let y = 0; y < CANVAS_SIZE; y += SAMPLE_STEP) {
        setComputeProgress(
          Math.round(
            ((methods.indexOf(method) * CANVAS_SIZE + y) /
              (methods.length * CANVAS_SIZE)) *
              100
          )
        );

        let colIdx = 0;
        for (let x = 0; x < CANVAS_SIZE; x += SAMPLE_STEP) {
          const px = x / CANVAS_SIZE;
          const py = 1 - y / CANVAS_SIZE;

          const winnerIds = method === 'approval'
            ? spatialVoteCalculators.approval(px, py, candidates, DEFAULT_APPROVAL_THRESHOLD)
            : spatialVoteCalculators[method](px, py, candidates);
          const methodWinner = winnerIds[0];

          const idealWinner = idealWinners[rowIdx]?.[colIdx] ?? candidates[0].id;
          const isDistorted = methodWinner !== idealWinner;

          if (isDistorted) disagreeCount++;

          const methodColor = candidateColors[methodWinner];

          // Distortion overlay: green = agree, red = disagree
          // When distorted, show the method's wrong color dimmed + red tint
          const distR = isDistorted ? 220 : 60;
          const distG = isDistorted ? 60 : 180;
          const distB = isDistorted ? 60 : 60;
          const distA = isDistorted ? 220 : 120;

          for (let dy = 0; dy < SAMPLE_STEP && y + dy < CANVAS_SIZE; dy++) {
            for (let dx = 0; dx < SAMPLE_STEP && x + dx < CANVAS_SIZE; dx++) {
              const idx = ((y + dy) * CANVAS_SIZE + (x + dx)) * 4;

              // Method canvas: normal candidate color
              methodImageData.data[idx] = methodColor.r;
              methodImageData.data[idx + 1] = methodColor.g;
              methodImageData.data[idx + 2] = methodColor.b;
              methodImageData.data[idx + 3] = 255;

              // Distortion canvas: red/green overlay
              distortionImageData.data[idx] = distR;
              distortionImageData.data[idx + 1] = distG;
              distortionImageData.data[idx + 2] = distB;
              distortionImageData.data[idx + 3] = distA;
            }
          }
          colIdx++;
        }
        rowIdx++;

        // Periodic UI update
        if (y % (SAMPLE_STEP * 4) === 0) {
          methodCtx.putImageData(methodImageData, 0, 0);
          distortionCtx.putImageData(distortionImageData, 0, 0);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      methodCtx.putImageData(methodImageData, 0, 0);
      distortionCtx.putImageData(distortionImageData, 0, 0);
      drawCandidates(methodCtx);
      drawCandidates(distortionCtx);

      scores[method] = Math.round((disagreeCount / totalPixels) * 100);
    }

    setDistortionScores(scores);
    setHasComputed(true);
    setIsComputing(false);
    setComputeProgress(100);
  };

  // -- Drag handling (on the ideal canvas) --
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isComputing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    const clicked = candidates.find((c) => distance(x, y, c.x, c.y) < 0.05);
    if (clicked) {
      setIsDragging(clicked.id);
      e.preventDefault();
    }
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || isComputing) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      setCandidates((prev) =>
        prev.map((c) => (c.id === isDragging ? { ...c, x, y } : c))
      );
    },
    [isDragging, isComputing]
  );

  const handleMouseUp = () => setIsDragging(null);

  const addCandidate = useCallback(() => {
    if (candidates.length >= availableColors.length) return;
    const newId = (Math.max(0, ...candidates.map((c) => parseInt(c.id))) + 1).toString();
    const letter = String.fromCharCode(65 + candidates.length);
    setCandidates((prev) => [
      ...prev,
      { id: newId, x: 0.5, y: 0.5, color: availableColors[candidates.length], name: letter },
    ]);
  }, [candidates, availableColors]);

  const removeCandidate = useCallback(
    (id: string) => {
      if (candidates.length <= 2) return;
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    },
    [candidates]
  );

  const methodLabels: Record<MethodKey, string> = {
    plurality: 'Plurality',
    approval: 'Approval',
    irv: 'Instant Runoff (IRV)',
  };

  return (
    <div className="w-full max-w-7xl p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:text-white">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 text-black dark:text-white">
          Distortion Map: How Wrong Is Each Method?
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          The <strong>Ideal</strong> map shows the Voronoi diagram — each point colored by the
          nearest candidate. This is the &ldquo;correct&rdquo; result where the candidate closest to the
          center of voter opinion always wins. The <strong>Distortion</strong> column highlights
          where each method disagrees with the ideal:{' '}
          <span className="text-red-600 font-semibold">red = wrong winner</span>,{' '}
          <span className="text-green-700 font-semibold">green = correct winner</span>.
        </p>

        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={handleCompute}
            disabled={isComputing}
            className={`px-4 py-2 rounded-lg ${
              isComputing
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isComputing ? `Computing (${computeProgress}%)` : 'Compute Results'}
          </button>
          <button
            onClick={addCandidate}
            disabled={candidates.length >= availableColors.length || isComputing}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Add Candidate
          </button>
        </div>
      </div>

      {/* Candidate chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {candidates.map((c) => (
          <div key={c.id} className="flex items-center gap-2 p-2 border rounded">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: c.color }} />
            <span>{c.name}</span>
            <span className="text-xs text-gray-400">
              ({c.x.toFixed(2)}, {c.y.toFixed(2)})
            </span>
            {candidates.length > 2 && (
              <button
                onClick={() => removeCandidate(c.id)}
                className="ml-1 text-red-500 hover:text-red-700"
                disabled={isComputing}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Grid: Ideal | Method | Distortion for each method */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-center pb-2 text-sm font-semibold">Ideal (Voronoi)</th>
              {methods.map((m) => (
                <React.Fragment key={m}>
                  <th className="text-center pb-2 text-sm font-semibold">{methodLabels[m]}</th>
                  <th className="text-center pb-2 text-sm font-semibold">
                    Distortion
                    {hasComputed && (
                      <span
                        className={`ml-1 text-xs font-bold ${
                          distortionScores[m] > 15
                            ? 'text-red-600'
                            : distortionScores[m] > 5
                              ? 'text-yellow-600'
                              : 'text-green-600'
                        }`}
                      >
                        ({distortionScores[m]}%)
                      </span>
                    )}
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {/* Ideal canvas (spans all rows visually, but in one cell) */}
              <td className="align-top p-1">
                <canvas
                  ref={idealCanvasRef}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  className="border rounded w-full cursor-crosshair touch-none"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
                <p className="text-xs text-center text-gray-500 mt-1">
                  Drag candidates here
                </p>
              </td>

              {methods.map((m) => (
                <React.Fragment key={m}>
                  <td className="align-top p-1">
                    <canvas
                      ref={(el) => { methodCanvasRefs.current[m] = el; }}
                      width={CANVAS_SIZE}
                      height={CANVAS_SIZE}
                      className="border rounded w-full"
                    />
                  </td>
                  <td className="align-top p-1">
                    <canvas
                      ref={(el) => { distortionCanvasRefs.current[m] = el; }}
                      width={CANVAS_SIZE}
                      height={CANVAS_SIZE}
                      className="border rounded w-full"
                    />
                  </td>
                </React.Fragment>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Score summary */}
      {hasComputed && (
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">Distortion Summary</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            Percentage of the space where the voting method picks a different winner than the ideal
            (nearest candidate). Lower is better.
          </p>
          <div className="flex gap-4">
            {methods.map((m) => (
              <div key={m} className="flex-1 text-center p-3 rounded-lg bg-white dark:bg-gray-600 shadow-sm">
                <div className="text-sm font-medium mb-1">{methodLabels[m]}</div>
                <div
                  className={`text-2xl font-bold ${
                    distortionScores[m] > 15
                      ? 'text-red-600'
                      : distortionScores[m] > 5
                        ? 'text-yellow-600'
                        : 'text-green-600'
                  }`}
                >
                  {distortionScores[m]}%
                </div>
                <div className="mt-2 w-full bg-gray-200 dark:bg-gray-500 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${
                      distortionScores[m] > 15
                        ? 'bg-red-500'
                        : distortionScores[m] > 5
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(distortionScores[m], 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DistortionMap;
