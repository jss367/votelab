'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_APPROVAL_THRESHOLD,
  SpatialCandidate,
  spatialVoteCalculators,
} from '../../lib/spatialVoting';

const CANVAS_SIZE = 280;
const SAMPLE_STEP = 3;

// ----- Paradox definitions -----

interface ParadoxScenario {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  explanation: string;
  before: {
    label: string;
    candidates: SpatialCandidate[];
    method: keyof typeof spatialVoteCalculators;
  };
  after: {
    label: string;
    candidates: SpatialCandidate[];
    method: keyof typeof spatialVoteCalculators;
  };
  idealMethod?: keyof typeof spatialVoteCalculators;
}

const paradoxes: ParadoxScenario[] = [
  {
    id: 'spoiler',
    title: 'Spoiler Effect',
    subtitle: 'Plurality Voting',
    description:
      'In plurality voting, adding a third candidate who is similar to an existing candidate can split their shared voter base, causing BOTH to lose to a less-preferred opponent.',
    explanation:
      'Notice how the green region shrinks dramatically when Progressive B enters the race. Even though Progressive B can\'t win, their presence steals votes from Progressive A, handing victory to Conservative. This is why third-party candidates are called "spoilers" under plurality voting.',
    before: {
      label: 'Two-candidate race: Progressive A wins their share easily',
      candidates: [
        { id: '1', x: 0.35, y: 0.5, color: '#22c55e', name: 'Progressive A' },
        { id: '2', x: 0.7, y: 0.5, color: '#3b82f6', name: 'Conservative' },
      ],
      method: 'plurality',
    },
    after: {
      label: 'Add a similar candidate: Progressive B splits the vote',
      candidates: [
        { id: '1', x: 0.35, y: 0.5, color: '#22c55e', name: 'Progressive A' },
        { id: '2', x: 0.7, y: 0.5, color: '#3b82f6', name: 'Conservative' },
        { id: '3', x: 0.4, y: 0.55, color: '#ef4444', name: 'Progressive B' },
      ],
      method: 'plurality',
    },
  },
  {
    id: 'center-squeeze',
    title: 'Center Squeeze',
    subtitle: 'Instant Runoff Voting (IRV)',
    description:
      'Under IRV, a centrist candidate who would beat every other candidate one-on-one can be eliminated in early rounds because they don\'t get enough first-choice votes. The extremes survive while the best compromise is eliminated.',
    explanation:
      'Compare the ideal Voronoi map (top) with the IRV result (bottom). The centrist Moderate B has the largest ideal territory — they\'re the closest candidate to the most voters. But under IRV, voters at the extremes list their own extreme candidate first. Moderate B gets squeezed out in early elimination rounds despite being the best overall compromise.',
    before: {
      label: 'Ideal: Nearest candidate wins (Voronoi). Moderate B has the most territory.',
      candidates: [
        { id: '1', x: 0.2, y: 0.5, color: '#22c55e', name: 'Left A' },
        { id: '2', x: 0.5, y: 0.5, color: '#f59e0b', name: 'Moderate B' },
        { id: '3', x: 0.8, y: 0.5, color: '#3b82f6', name: 'Right C' },
      ],
      method: 'condorcet', // Use condorcet as the "ideal-ish" comparison
    },
    after: {
      label: 'IRV: Moderate B gets squeezed out despite being the best compromise',
      candidates: [
        { id: '1', x: 0.2, y: 0.5, color: '#22c55e', name: 'Left A' },
        { id: '2', x: 0.5, y: 0.5, color: '#f59e0b', name: 'Moderate B' },
        { id: '3', x: 0.8, y: 0.5, color: '#3b82f6', name: 'Right C' },
      ],
      method: 'irv',
    },
  },
  {
    id: 'irv-vs-plurality',
    title: 'IRV Fixes the Spoiler (Sometimes)',
    subtitle: 'Same setup, different method',
    description:
      'The same spoiler scenario that breaks plurality voting is handled better by IRV. When Progressive B is eliminated, their votes transfer to Progressive A instead of being wasted.',
    explanation:
      'Under plurality (top), Progressive B splits the progressive vote. Under IRV (bottom), when Progressive B is eliminated in the first round, those ballots transfer to Progressive A as a second choice, and Progressive A survives. IRV isn\'t perfect (see Center Squeeze), but it handles simple spoiler scenarios well.',
    before: {
      label: 'Plurality: Progressive B spoils the election',
      candidates: [
        { id: '1', x: 0.35, y: 0.5, color: '#22c55e', name: 'Progressive A' },
        { id: '2', x: 0.7, y: 0.5, color: '#3b82f6', name: 'Conservative' },
        { id: '3', x: 0.4, y: 0.55, color: '#ef4444', name: 'Progressive B' },
      ],
      method: 'plurality',
    },
    after: {
      label: 'IRV: Eliminated candidate\'s votes transfer, fixing the spoiler',
      candidates: [
        { id: '1', x: 0.35, y: 0.5, color: '#22c55e', name: 'Progressive A' },
        { id: '2', x: 0.7, y: 0.5, color: '#3b82f6', name: 'Conservative' },
        { id: '3', x: 0.4, y: 0.55, color: '#ef4444', name: 'Progressive B' },
      ],
      method: 'irv',
    },
  },
  {
    id: 'approval-vs-plurality',
    title: 'Approval Voting Finds the Compromise',
    subtitle: 'Approval vs Plurality',
    description:
      'Approval voting allows voters to support multiple candidates. This naturally favors broadly acceptable candidates over polarizing ones, avoiding both the spoiler effect and center squeeze.',
    explanation:
      'Under plurality (top), the space is carved into sharp, unforgiving regions — one bad candidate placement can flip the whole election. Under approval voting (bottom), the regions are smoother and more closely match the ideal Voronoi diagram. Candidates who are broadly liked (close to many voters) do better.',
    before: {
      label: 'Plurality: Hard boundaries, spoiler-prone',
      candidates: [
        { id: '1', x: 0.2, y: 0.5, color: '#22c55e', name: 'Left A' },
        { id: '2', x: 0.5, y: 0.5, color: '#f59e0b', name: 'Moderate B' },
        { id: '3', x: 0.8, y: 0.5, color: '#3b82f6', name: 'Right C' },
      ],
      method: 'plurality',
    },
    after: {
      label: 'Approval: Smoother regions, compromise candidate thrives',
      candidates: [
        { id: '1', x: 0.2, y: 0.5, color: '#22c55e', name: 'Left A' },
        { id: '2', x: 0.5, y: 0.5, color: '#f59e0b', name: 'Moderate B' },
        { id: '3', x: 0.8, y: 0.5, color: '#3b82f6', name: 'Right C' },
      ],
      method: 'approval',
    },
  },
];

// ----- Canvas rendering -----

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const rgb = parseInt(hex.slice(1), 16);
  return {
    r: (rgb >> 16) & 255,
    g: (rgb >> 8) & 255,
    b: rgb & 255,
  };
}

interface ScenarioCanvasProps {
  candidates: SpatialCandidate[];
  method: keyof typeof spatialVoteCalculators;
  label: string;
  autoCompute: boolean;
}

const ScenarioCanvas: React.FC<ScenarioCanvasProps> = ({
  candidates,
  method,
  label,
  autoCompute,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [hasComputed, setHasComputed] = useState(false);

  const drawCandidates = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      candidates.forEach((c) => {
        ctx.beginPath();
        ctx.arc(c.x * CANVAS_SIZE, (1 - c.y) * CANVAS_SIZE, 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'black';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.name, c.x * CANVAS_SIZE, (1 - c.y) * CANVAS_SIZE + 18);
      });
    },
    [candidates]
  );

  const compute = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsComputing(true);

    const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
    const { data } = imageData;

    const colors = candidates.reduce(
      (acc, c) => {
        acc[c.id] = hexToRgb(c.color);
        return acc;
      },
      {} as Record<string, { r: number; g: number; b: number }>
    );

    for (let y = 0; y < CANVAS_SIZE; y += SAMPLE_STEP) {
      for (let x = 0; x < CANVAS_SIZE; x += SAMPLE_STEP) {
        const px = x / CANVAS_SIZE;
        const py = 1 - y / CANVAS_SIZE;

        const winnerIds =
          method === 'approval'
            ? spatialVoteCalculators.approval(px, py, candidates, DEFAULT_APPROVAL_THRESHOLD)
            : spatialVoteCalculators[method](px, py, candidates);
        const winnerId = winnerIds[0];
        const color = colors[winnerId];

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

      if (y % (SAMPLE_STEP * 4) === 0) {
        ctx.putImageData(imageData, 0, 0);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    ctx.putImageData(imageData, 0, 0);
    drawCandidates(ctx);
    setIsComputing(false);
    setHasComputed(true);
  }, [candidates, method, drawCandidates]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawCandidates(ctx);
  }, [drawCandidates]);

  // Auto-compute when requested
  useEffect(() => {
    if (autoCompute && !hasComputed && !isComputing) {
      compute();
    }
  }, [autoCompute, hasComputed, isComputing, compute]);

  return (
    <div className="flex flex-col items-center">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="border rounded"
      />
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center max-w-[280px]">
        {label}
      </p>
      {isComputing && (
        <p className="text-xs text-blue-500 mt-1 animate-pulse">Computing...</p>
      )}
    </div>
  );
};

// ----- Paradox Card -----

interface ParadoxCardProps {
  paradox: ParadoxScenario;
  index: number;
}

const ParadoxCard: React.FC<ParadoxCardProps> = ({ paradox, index }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldCompute, setShouldCompute] = useState(false);

  return (
    <div className="border rounded-xl p-6 bg-white dark:bg-gray-700 shadow-md">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs font-mono px-2 py-1 bg-gray-100 dark:bg-gray-600 rounded">
            #{index + 1}
          </span>
          <h3 className="text-xl font-bold text-black dark:text-white">
            {paradox.title}
          </h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-300 italic mb-2">
          {paradox.subtitle}
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-200">
          {paradox.description}
        </p>
      </div>

      {/* Compute button */}
      {!shouldCompute && (
        <button
          onClick={() => setShouldCompute(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg mb-4"
        >
          Show Visualization
        </button>
      )}

      {/* Before / After canvases */}
      {shouldCompute && (
        <>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-start mb-4">
            <div>
              <div className="text-sm font-semibold mb-2 text-center">Before</div>
              <ScenarioCanvas
                candidates={paradox.before.candidates}
                method={paradox.before.method}
                label={paradox.before.label}
                autoCompute={shouldCompute}
              />
            </div>
            <div className="hidden sm:flex items-center self-center text-3xl text-gray-400">
              &rarr;
            </div>
            <div className="sm:hidden flex justify-center w-full text-3xl text-gray-400">
              &darr;
            </div>
            <div>
              <div className="text-sm font-semibold mb-2 text-center">After</div>
              <ScenarioCanvas
                candidates={paradox.after.candidates}
                method={paradox.after.method}
                label={paradox.after.label}
                autoCompute={shouldCompute}
              />
            </div>
          </div>

          {/* Explanation toggle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {isExpanded ? 'Hide explanation' : 'What am I looking at?'}
          </button>

          {isExpanded && (
            <div className="mt-3 p-4 bg-blue-50 dark:bg-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200">
              {paradox.explanation}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ----- Main component -----

const ParadoxSpotlight: React.FC = () => {
  return (
    <div className="w-full max-w-5xl p-4">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2 text-black dark:text-white">
          Voting Paradoxes: See the Flaws
        </h2>
        <p className="text-gray-600 dark:text-gray-300 max-w-3xl">
          Every voting system has failure modes — situations where it picks a winner that doesn&apos;t
          reflect voters&apos; actual preferences. These before/after visualizations show exactly how
          and when each paradox occurs. Each pixel represents an election with voters centered at
          that point; the color shows which candidate wins.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {paradoxes.map((p, i) => (
          <ParadoxCard key={p.id} paradox={p} index={i} />
        ))}
      </div>
    </div>
  );
};

export default ParadoxSpotlight;
