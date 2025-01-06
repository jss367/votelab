import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_APPROVAL_THRESHOLD,
  SpatialCandidate,
  spatialVoteCalculators,
} from '../../lib/spatialVoting';
import { VotingMethod } from '../../lib/votingMethods';
import {
  generateBallotsFromPosition,
  type Ballot,
} from '../utils/ballotGeneration';
import { ballotCache, visualizationCache } from '../utils/cache';
import { BallotDisplay } from './BallotDisplay';

const CANVAS_SIZE = 300;

interface CacheKey {
  candidates: Array<{ id: string; x: number; y: number; color: string }>;
  method: string;
}

interface ResultCache {
  imageData: ImageData;
  timestamp: number;
}

// Global cache for results
const resultCache = new Map<string, ResultCache>();

const distance = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

// Generate cache key from current configuration
const generateCacheKey = (
  candidates: CacheKey['candidates'],
  method: VotingMethod
): string => {
  const config = {
    candidates: candidates.map((c) => ({
      id: c.id,
      x: Math.round(c.x * 100) / 100, // Round to 2 decimal places for cache efficiency
      y: Math.round(c.y * 100) / 100,
      color: c.color,
    })),
    method,
  };
  return JSON.stringify(config);
};

const VotingMethodComparisonGrid = () => {
  const [candidates, setCandidates] = useState<SpatialCandidate[]>([
    { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'A' },
    { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'B' },
    { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'C' },
  ]);

  // Preset configurations
  const presets = useMemo(
    () => ({
      spoiler: [
        { id: '1', x: 0.3, y: 0.5, color: '#22c55e', name: 'Progressive A' },
        { id: '2', x: 0.7, y: 0.5, color: '#3b82f6', name: 'Conservative' },
        { id: '3', x: 0.4, y: 0.5, color: '#ef4444', name: 'Progressive B' },
      ],
      default: [
        { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'A' },
        { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'B' },
        { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'C' },
      ],
    }),
    []
  );

  const availableColors = useMemo(
    () => [
      '#22c55e',
      '#ef4444',
      '#3b82f6',
      '#f59e0b',
      '#8b5cf6',
      '#ec4899',
      '#10b981',
      '#6366f1',
      '#f97316',
      '#06b6d4',
    ],
    []
  );

  const isDarkMode = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  })[0];

  const canvasRefs = {
    plurality: useRef<HTMLCanvasElement>(null),
    approval: useRef<HTMLCanvasElement>(null),
    irv: useRef<HTMLCanvasElement>(null),
  };

  // Add effect to listen for changes
  useEffect(() => {
    const computeBackground = () => {
      const computedStyle = getComputedStyle(document.documentElement);
      return computedStyle.getPropertyValue('--background');
    };

    const backgroundColor = computeBackground();
    Object.values(canvasRefs).forEach((ref) => {
      const canvas = ref.current;
      if (!canvas) {
        return;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      }
    });
  }, []);

  const [isComputing, setIsComputing] = useState(false);
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [computeProgress, setComputeProgress] = useState(0);
  const [hasComputed, setHasComputed] = useState(false);
  const [inspectionPoint, setInspectionPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);

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
        ctx.fillStyle = isDarkMode ? '#1f2937' : 'white';
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
    [candidates, isDarkMode]
  );

  const drawMethodVisualization = useCallback(
    async (
      canvasRef: React.RefObject<HTMLCanvasElement>,
      method: VotingMethod
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

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

      const SAMPLE_STEP = 3; // Sample every 3 pixels
      const totalSteps = Math.ceil(CANVAS_SIZE / SAMPLE_STEP);

      // Draw with anti-aliasing and sampling
      for (let y = 0; y < CANVAS_SIZE; y += SAMPLE_STEP) {
        // Update progress every row
        setComputeProgress(Math.round((y / CANVAS_SIZE) * 100));

        for (let x = 0; x < CANVAS_SIZE; x += SAMPLE_STEP) {
          const px = x / CANVAS_SIZE;
          const py = 1 - y / CANVAS_SIZE;

          // Get winner at this point
          const winnerIds = spatialVoteCalculators[method](
            px,
            py,
            candidates,
            method === 'approval' ? DEFAULT_APPROVAL_THRESHOLD : 0
          );
          const winnerId = winnerIds[0];
          const color = candidateColors[winnerId];

          // Fill a block of pixels
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

        // Update display periodically
        if (y % (SAMPLE_STEP * 2) === 0) {
          ctx.putImageData(imageData, 0, 0);
          // Allow UI to update
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // Final update
      ctx.putImageData(imageData, 0, 0);
      drawCandidates(ctx);
      drawInspectionPoint(ctx);
    },
    [candidates, setComputeProgress, inspectionPoint]
  );

  const handleInspectionClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isComputing || isDragging) return;

    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;

    // Check if we clicked near a candidate
    const clickedCandidate = candidates.find(
      (candidate) => distance(x, y, candidate.x, candidate.y) < 0.05
    );

    // If we didn't click a candidate, set inspection point and generate election
    if (!clickedCandidate) {
      // First update the inspection point
      setInspectionPoint({ x, y });

      // Generate sample points from 2D normal distribution
      const NUM_VOTERS = 50; // Number of voters in this election
      const STD_DEV = 0.15; // Standard deviation for the normal distribution

      const voterPoints = Array.from({ length: NUM_VOTERS }, () => {
        // Box-Muller transform to generate normal distribution
        const u1 = Math.random();
        const u2 = Math.random();
        const radius = Math.sqrt(-2 * Math.log(u1)) * STD_DEV;
        const theta = 2 * Math.PI * u2;

        return {
          x: Math.max(0, Math.min(1, x + radius * Math.cos(theta))),
          y: Math.max(0, Math.min(1, y + radius * Math.sin(theta))),
        };
      });

      // Generate all ballots for this election
      const pluralityBallots = voterPoints.map((point) =>
        generateBallotsFromPosition(point.x, point.y, candidates, 'plurality')
      );
      const rankedBallots = voterPoints.map((point) =>
        generateBallotsFromPosition(point.x, point.y, candidates, 'ranked')
      );
      const starBallots = voterPoints.map((point) =>
        generateBallotsFromPosition(point.x, point.y, candidates, 'star')
      );

      // Combine all ballots
      const allBallots = [
        ...pluralityBallots,
        ...rankedBallots,
        ...starBallots,
      ];

      // Update the display ballots
      setDisplayBallots(allBallots);

      // Redraw all canvases to show inspection point
      Object.entries(canvasRefs).forEach(([method, ref]) => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Redraw the existing visualization
          const existingImageData = ctx.getImageData(
            0,
            0,
            CANVAS_SIZE,
            CANVAS_SIZE
          );
          ctx.putImageData(existingImageData, 0, 0);
          // Draw candidates and inspection point on top
          drawCandidates(ctx);
          drawInspectionPoint(ctx);
        }
      });
    }
  };

  const handleCompute = async () => {
    setIsComputing(true);
    setComputeProgress(0);

    const cacheKey = JSON.stringify(
      candidates.map((c) => ({ id: c.id, x: c.x, y: c.y }))
    );

    try {
      // Try to get cached results
      const cachedBallots = await ballotCache.get(cacheKey);
      if (cachedBallots) {
        setDisplayBallots(
          cachedBallots.ballots.flatMap((b) => [
            b.pluralityBallot,
            b.rankedBallot,
            b.starBallot,
          ])
        );
      }

      await Promise.all(
        Object.entries(canvasRefs).map(async ([method, ref]) => {
          const votingMethod = method as VotingMethod;
          if (!ref.current) return;

          const vizCacheKey = `${cacheKey}_${votingMethod}`;
          const cachedViz = await visualizationCache.get(vizCacheKey);

          if (cachedViz) {
            // Restore cached visualization
            const ctx = ref.current.getContext('2d');
            if (ctx) {
              const imageData = new ImageData(
                new Uint8ClampedArray(cachedViz.imageData),
                cachedViz.width,
                cachedViz.height
              );
              ctx.putImageData(imageData, 0, 0);
              drawCandidates(ctx);
            }
          } else {
            // Compute and cache new visualization...
            await drawMethodVisualization(ref, votingMethod);
            const ctx = ref.current.getContext('2d');
            if (ctx) {
              const imageData = ctx.getImageData(
                0,
                0,
                CANVAS_SIZE,
                CANVAS_SIZE
              );
              await visualizationCache.set(vizCacheKey, {
                imageData: Array.from(imageData.data),
                width: imageData.width,
                height: imageData.height,
              });
            }
          }
        })
      );

      // If we didn't have cached ballots, generate and cache them
      if (!cachedBallots) {
        const samplePoints = Array.from({ length: 6 }, () => ({
          x: Math.random(),
          y: Math.random(),
        }));

        const ballotResults = samplePoints.map((point) => ({
          voterPosition: point,
          pluralityBallot: generateBallotsFromPosition(
            point.x,
            point.y,
            candidates,
            'plurality'
          ),
          rankedBallot: generateBallotsFromPosition(
            point.x,
            point.y,
            candidates,
            'ranked'
          ),
          starBallot: generateBallotsFromPosition(
            point.x,
            point.y,
            candidates,
            'star'
          ),
        }));

        await ballotCache.set(cacheKey, { ballots: ballotResults });

        setDisplayBallots(
          ballotResults.flatMap((b) => [
            b.pluralityBallot,
            b.rankedBallot,
            b.starBallot,
          ])
        );
      }

      setHasComputed(true);
    } finally {
      setIsComputing(false);
      setComputeProgress(100);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isComputing) {
      return;
    }

    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;

    const clickedCandidate = candidates.find(
      (candidate) => distance(x, y, candidate.x, candidate.y) < 0.05
    );

    if (clickedCandidate) {
      setIsDragging(clickedCandidate.id);
      e.preventDefault();
    }
  };

  const initializeCanvases = useCallback(() => {
    Object.values(canvasRefs).forEach((ref) => {
      const canvas = ref.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Only clear if we haven't computed results yet
      if (!hasComputed) {
        ctx.fillStyle = isDarkMode ? '#1f2937' : 'white';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      }

      // Always draw candidates on top
      drawCandidates(ctx);
    });
  }, [candidates, isDarkMode, hasComputed, drawCandidates]);

  // Call initializeCanvases when component mounts and when candidates change
  useEffect(() => {
    initializeCanvases();
  }, [initializeCanvases]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || isComputing) return;

      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(
        0,
        Math.min(1, 1 - (e.clientY - rect.top) / rect.height)
      );

      setCandidates((prev) =>
        prev.map((c) => (c.id === isDragging ? { ...c, x, y } : c))
      );

      // Only redraw candidates, don't clear
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Clear only the area around the moving candidate
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        drawCandidates(ctx);
        ctx.restore();
      }
    },
    [isDragging, isComputing, drawCandidates]
  );

  const handleMouseUp = () => {
    setIsDragging(null);
  };

  const addCandidate = useCallback(() => {
    if (candidates.length >= availableColors.length) {
      return;
    }

    const newId = (
      Math.max(0, ...candidates.map((c) => parseInt(c.id))) + 1
    ).toString();
    const newColor = availableColors[candidates.length];
    const letter = String.fromCharCode(65 + candidates.length);

    setCandidates((prev) => [
      ...prev,
      {
        id: newId,
        x: 0.5,
        y: 0.5,
        color: newColor,
        name: letter,
      },
    ]);
  }, [candidates, availableColors]);

  const removeCandidate = useCallback(
    (id: string) => {
      if (candidates.length <= 2) {
        return;
      }
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    },
    [candidates]
  );

  const loadPreset = (presetName: keyof typeof presets) => {
    setCandidates(presets[presetName]);
    setIsComputing(false);
    setComputeProgress(0);
    setHasComputed(false);

    // Clear caches when loading a new preset
    visualizationCache.clear();
    ballotCache.clear();

    // Clear all canvases
    Object.values(canvasRefs).forEach((ref) => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = isDarkMode ? '#1f2937' : 'white';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        drawCandidates(ctx);
      }
    });
  };

  const PresetControls = () => (
    <div className="flex items-center gap-4 mb-4">
      <button
        onClick={() => loadPreset('spoiler')}
        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
        title="Demonstrates how similar candidates can split the vote"
      >
        Demo Spoiler Effect
      </button>
      <button
        onClick={() => loadPreset('default')}
        className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
      >
        Reset to Default
      </button>
    </div>
  );

  const [displayBallots, setDisplayBallots] = useState<Ballot[]>([]);

  const drawInspectionPoint = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!inspectionPoint) return;

      ctx.beginPath();
      ctx.arc(
        inspectionPoint.x * CANVAS_SIZE,
        (1 - inspectionPoint.y) * CANVAS_SIZE,
        4,
        0,
        2 * Math.PI
      );
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    [inspectionPoint]
  );

  return (
    <div className="w-full max-w-6xl p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:text-white">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 text-black dark:text-white">
          Voting Method Comparison
        </h2>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleCompute}
              disabled={isComputing}
              className={`px-4 py-2 rounded-lg ${
                isComputing
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {isComputing
                ? `Computing (${computeProgress}%)`
                : 'Compute Results'}
            </button>
            <button
              onClick={addCandidate}
              disabled={
                candidates.length >= availableColors.length || isComputing
              }
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Add Candidate
            </button>
          </div>
          <PresetControls />
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Drag candidates to reposition them, then click "Compute Results" to
          see the outcomes. Hold Shift and click anywhere to inspect ballots for
          that location. Each point represents an election with voter opinions
          normally distributed around that point.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(canvasRefs).map(([method, ref]) => (
          <div key={method}>
            <h3 className="text-lg font-semibold mb-2 capitalize">{method}</h3>
            <canvas
              ref={ref}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="border rounded w-full cursor-crosshair touch-none"
              onMouseDown={(e) => {
                if (e.shiftKey) {
                  handleInspectionClick(e);
                } else {
                  handleMouseDown(e);
                }
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {candidates.map((candidate) => (
          <div
            key={candidate.id}
            className="flex items-center gap-2 p-2 border rounded"
          >
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: candidate.color }}
            ></div>
            <span>{candidate.name}</span>
            {candidates.length > 2 && (
              <button
                onClick={() => removeCandidate(candidate.id)}
                className="ml-auto text-red-500 hover:text-red-700"
                disabled={isComputing}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-12 border-t pt-8">
        <h2 className="text-2xl font-bold mb-6">
          {inspectionPoint
            ? `Sample Ballots at (${inspectionPoint.x.toFixed(2)}, ${inspectionPoint.y.toFixed(2)})`
            : 'Sample Ballots'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Plurality Section */}
          <div>
            <h3 className="text-xl font-semibold mb-4 text-center">
              Plurality Voting
            </h3>
            <BallotDisplay
              ballots={displayBallots.filter((b) => b.type === 'plurality')}
              candidates={candidates}
            />
          </div>

          {/* Ranked Choice Section */}
          <div>
            <h3 className="text-xl font-semibold mb-4 text-center">
              Ranked Choice
            </h3>
            <BallotDisplay
              ballots={displayBallots.filter((b) => b.type === 'ranked')}
              candidates={candidates}
            />
          </div>

          {/* STAR Voting Section */}
          <div>
            <h3 className="text-xl font-semibold mb-4 text-center">
              STAR Voting
            </h3>
            <BallotDisplay
              ballots={displayBallots.filter((b) => b.type === 'star')}
              candidates={candidates}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VotingMethodComparisonGrid;
