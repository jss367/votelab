import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SpatialCandidate,
  spatialVoteCalculators,
} from '../../lib/spatialVoting';
import { methods } from '../../lib/votingMethods';

const CANVAS_SIZE = 400;
const DEFAULT_CANDIDATES: SpatialCandidate[] = [
  { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'A' },
  { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'B' },
  { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'C' },
];

const ElectionViz = () => {
  const [candidates] = useState(DEFAULT_CANDIDATES);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [isComputing, setIsComputing] = useState(false);

  const drawVisualization = useCallback(
    async (method: keyof typeof methods, canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
      const { data } = imageData;

      // Pre-calculate candidate colors
      const candidateColors = candidates.reduce(
        (acc, candidate) => {
          const rgb = parseInt(candidate.color.slice(1), 16);
          acc[candidate.id] = {
            r: (rgb >> 16) & 255,
            g: (rgb >> 8) & 255,
            b: rgb & 255,
          };
          return acc;
        },
        {} as Record<string, { r: number; g: number; b: number }>
      );

      // Sample points to create visualization
      const SAMPLE_STEP = 4;
      for (let y = 0; y < CANVAS_SIZE; y += SAMPLE_STEP) {
        for (let x = 0; x < CANVAS_SIZE; x += SAMPLE_STEP) {
          const px = x / CANVAS_SIZE;
          const py = 1 - y / CANVAS_SIZE;

          // Get winner at this point
          const calculator = spatialVoteCalculators[method];
          const winners = calculator(px, py, candidates);
          const winnerId = winners[0];
          const color = candidateColors[winnerId];

          // Fill block of pixels
          for (let dy = 0; dy < SAMPLE_STEP && y + dy < CANVAS_SIZE; dy++) {
            for (let dx = 0; dx < SAMPLE_STEP && x + dx < CANVAS_SIZE; dx++) {
              const idx = ((y + dy) * CANVAS_SIZE + (x + dx)) * 4;
              data[idx] = color.r;
              data[idx + 1] = color.g;
              data[idx + 2] = color.b;
              data[idx + 3] = 255;
            }
          }
        }

        // Update periodically
        if (y % (SAMPLE_STEP * 4) === 0) {
          ctx.putImageData(imageData, 0, 0);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // Final update
      ctx.putImageData(imageData, 0, 0);

      // Draw candidates
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

  const handleCompute = async () => {
    setIsComputing(true);
    try {
      await Promise.all(
        Object.entries(methods).map(([method]) => {
          const canvas = canvasRefs.current[method];
          if (canvas) {
            return drawVisualization(method as keyof typeof methods, canvas);
          }
        })
      );
    } finally {
      setIsComputing(false);
    }
  };

  useEffect(() => {
    // Initialize canvas references
    Object.keys(methods).forEach((method) => {
      const canvas = document.getElementById(
        `canvas-${method}`
      ) as HTMLCanvasElement;
      if (canvas) {
        canvasRefs.current[method] = canvas;
      }
    });
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-4">Voting Method Comparison</h2>
          <button
            onClick={handleCompute}
            disabled={isComputing}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
          >
            {isComputing ? 'Computing...' : 'Compute Results'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(methods).map(([method, label]) => (
            <div key={method} className="space-y-2">
              <h3 className="text-lg font-semibold">{label}</h3>
              <canvas
                id={`canvas-${method}`}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                className="border rounded w-full"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ElectionViz;
