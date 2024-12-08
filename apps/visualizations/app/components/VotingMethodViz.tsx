import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_APPROVAL_THRESHOLD,
  distance,
  SpatialCandidate,
  spatialVoteCalculators,
} from '../../lib/spatialVoting';
import type { VotingMethod } from '../../lib/votingMethods';
import { methodDescriptions, methods } from '../../lib/votingMethods';

interface Voter {
  id: string;
  x: number;
  y: number;
}

type VoterDistribution = 'uniform' | 'normal' | 'clustered';

// Box-Muller transform for normal distribution
const randn_bm = (): number => {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

const VotingMethodViz: React.FC = () => {
  // Move color array to useMemo to fix build warning
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [candidates, setCandidates] = useState<SpatialCandidate[]>([
    { id: '1', x: 0.3, y: 0.7, color: availableColors[0], name: 'Candidate A' },
    { id: '2', x: 0.5, y: 0.5, color: availableColors[1], name: 'Candidate B' },
    { id: '3', x: 0.7, y: 0.3, color: availableColors[2], name: 'Candidate C' },
  ]);
  const [selectedMethod, setSelectedMethod] =
    useState<VotingMethod>('plurality');
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [approvalThreshold, setApprovalThreshold] = useState(
    DEFAULT_APPROVAL_THRESHOLD
  );
  const [showSettings, setShowSettings] = useState(false);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [voterCount, setVoterCount] = useState(10000);
  const [voterDistribution, setVoterDistribution] =
    useState<VoterDistribution>('uniform');
  const [hasGeneratedVoters, setHasGeneratedVoters] = useState(false);

  const generateVoters = useCallback(
    (count: number, distribution: VoterDistribution): Voter[] => {
      const newVoters: Voter[] = [];

      for (let i = 0; i < count; i++) {
        let x: number, y: number;

        switch (distribution) {
          case 'normal': {
            const standardDev = 0.15;
            do {
              x = 0.5 + randn_bm() * standardDev;
              y = 0.5 + randn_bm() * standardDev;
            } while (x < 0 || x > 1 || y < 0 || y > 1);
            break;
          }
          case 'clustered': {
            const clusters = [
              [0.3, 0.3],
              [0.7, 0.7],
              [0.5, 0.5],
            ] as const;
            const cluster =
              clusters[Math.floor(Math.random() * clusters.length)];
            x = Math.min(1, Math.max(0, cluster[0] + randn_bm() * 0.2));
            y = Math.min(1, Math.max(0, cluster[1] + randn_bm() * 0.2));
            break;
          }
          default: {
            x = Math.random();
            y = Math.random();
          }
        }

        newVoters.push({ id: `voter-${i}`, x, y });
      }

      return newVoters;
    },
    []
  );

  const addCandidate = useCallback(() => {
    if (candidates.length >= availableColors.length) return;

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
        name: `Candidate ${letter}`,
      },
    ]);
  }, [candidates, availableColors]);

  const removeCandidate = useCallback(
    (id: string) => {
      if (candidates.length <= 2) return;
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    },
    [candidates]
  );

  const updateCandidateName = (id: string, name: string): void => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c))
    );
  };

  const updateCandidatePosition = useCallback(
    (id: string, newX: number, newY: number): void => {
      const x = Math.max(0, Math.min(1, newX));
      const y = Math.max(0, Math.min(1, newY));
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, x, y } : c))
      );
    },
    []
  );

  const handleCoordinateInput = (
    id: string,
    coord: 'x' | 'y',
    value: string
  ): void => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) return;

    updateCandidatePosition(
      id,
      coord === 'x' ? numValue : candidate.x,
      coord === 'y' ? numValue : candidate.y
    );
  };

  const drawVisualization = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Draw the voting map
    const imageData = ctx.createImageData(width, height);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const voterX = x / width;
        const voterY = 1 - y / height;

        // Use spatialVoteCalculators for all methods
        const winnerIds = spatialVoteCalculators[selectedMethod](
          voterX,
          voterY,
          candidates,
          selectedMethod === 'approval' ? approvalThreshold : 0
        );
        const winnerId = winnerIds[0]; // Take first winner

        const winnerColor =
          candidates.find((c) => c.id === winnerId)?.color ?? '#000000';
        const rgb = parseInt(winnerColor.slice(1), 16);

        const idx = (y * width + x) * 4;
        imageData.data[idx] = (rgb >> 16) & 255; // R
        imageData.data[idx + 1] = (rgb >> 8) & 255; // G
        imageData.data[idx + 2] = rgb & 255; // B
        imageData.data[idx + 3] = 255; // A
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Draw voters
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    voters.forEach((voter) => {
      ctx.beginPath();
      ctx.arc(voter.x * width, (1 - voter.y) * height, 2, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Draw candidates
    candidates.forEach((candidate) => {
      ctx.beginPath();
      ctx.arc(
        candidate.x * width,
        (1 - candidate.y) * height,
        8,
        0,
        2 * Math.PI
      );
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = candidate.color;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = 'black';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        candidate.name,
        candidate.x * width,
        (1 - candidate.y) * height + 20
      );
    });

    if (selectedMethod === 'approval') {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 1;
      candidates.forEach((candidate) => {
        ctx.beginPath();
        ctx.arc(
          candidate.x * width,
          (1 - candidate.y) * height,
          approvalThreshold * width,
          0,
          2 * Math.PI
        );
        ctx.stroke();
      });
    }
  }, [candidates, selectedMethod, approvalThreshold, voters]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Account for any scaling between canvas internal size and displayed size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = ((e.clientX - rect.left) * scaleX) / canvas.width;
    const y = 1 - ((e.clientY - rect.top) * scaleY) / canvas.height;

    const clickedCandidate = candidates.find(
      (candidate) => distance(x, y, candidate.x, candidate.y) < 0.1 // Increased click detection area
    );

    if (clickedCandidate) {
      setIsDragging(clickedCandidate.id);
      e.preventDefault(); // Prevent text selection while dragging
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging !== null) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = ((e.clientX - rect.left) * scaleX) / canvas.width;
      const y = 1 - ((e.clientY - rect.top) * scaleY) / canvas.height;

      // Clamp the values between 0 and 1
      const clampedX = Math.max(0, Math.min(1, x));
      const clampedY = Math.max(0, Math.min(1, y));

      setCandidates(
        candidates.map((candidate) =>
          candidate.id === isDragging
            ? { ...candidate, x: clampedX, y: clampedY }
            : candidate
        )
      );

      e.preventDefault(); // Prevent text selection while dragging
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(null);
  };

  const calculateWinningAreas = useCallback(
    (method: VotingMethod) => {
      const samplePoints = 50;
      const votes = new Map<string, number>();
      candidates.forEach((c) => votes.set(c.id, 0));

      // For IRV, we need to collect all votes first
      const allVotes: string[][] = [];

      for (let x = 0; x < samplePoints; x++) {
        for (let y = 0; y < samplePoints; y++) {
          const voterX = x / (samplePoints - 1);
          const voterY = y / (samplePoints - 1);
          const voteResult = spatialVoteCalculators[method](
            voterX,
            voterY,
            candidates,
            method === 'approval' ? approvalThreshold : 0
          );

          if (method === 'approval') {
            voteResult.forEach((id) => votes.set(id, votes.get(id)! + 1));
          } else if (method === 'borda') {
            voteResult.forEach((id, index) => {
              votes.set(id, votes.get(id)! + (candidates.length - 1 - index));
            });
          } else if (method === 'irv') {
            allVotes.push(voteResult);
          } else {
            votes.set(voteResult[0], votes.get(voteResult[0])! + 1);
          }
        }
      }

      // Special handling for IRV
      if (method === 'irv') {
        const remainingCandidates = new Set(candidates.map((c) => c.id));

        while (remainingCandidates.size > 1) {
          const roundVotes = new Map<string, number>();
          remainingCandidates.forEach((id) => roundVotes.set(id, 0));

          // Count first preferences among remaining candidates
          allVotes.forEach((prefs) => {
            const firstChoice = prefs.find((id) => remainingCandidates.has(id));
            if (firstChoice) {
              roundVotes.set(firstChoice, roundVotes.get(firstChoice)! + 1);
            }
          });

          const totalVotes = [...roundVotes.values()].reduce(
            (a, b) => a + b,
            0
          );
          const majorityThreshold = totalVotes / 2;

          // Check if any candidate has a majority
          const [winner] = [...roundVotes.entries()].reduce((a, b) =>
            b[1] > a[1] ? b : a
          );
          if (roundVotes.get(winner)! > majorityThreshold) {
            votes.clear();
            candidates.forEach((c) => votes.set(c.id, 0));
            votes.set(winner, totalVotes);
            break;
          }

          // Eliminate candidate with fewest votes
          const [loser] = [...roundVotes.entries()].reduce((a, b) =>
            a[1] < b[1] ? a : b
          );
          remainingCandidates.delete(loser);
        }

        if (remainingCandidates.size === 1) {
          const [winner] = Array.from(remainingCandidates);
          votes.clear();
          candidates.forEach((c) => votes.set(c.id, 0));
          votes.set(winner, samplePoints * samplePoints);
        }
      }

      const totalPoints =
        method === 'approval'
          ? [...votes.values()].reduce((a, b) => a + b, 0)
          : method === 'borda'
            ? samplePoints *
              samplePoints *
              ((candidates.length * (candidates.length - 1)) / 2)
            : samplePoints * samplePoints;

      const results: Record<string, number> = {};
      for (const [id, voteCount] of votes.entries()) {
        results[id] = (voteCount / totalPoints) * 100;
      }

      return {
        votes: Object.fromEntries(votes),
        percentages: results,
      };
    },
    [candidates, approvalThreshold]
  );

  const calculateActualVotes = useCallback(
    (method: VotingMethod) => {
      if (!hasGeneratedVoters || voters.length === 0) return null;

      const votes = new Map<string, number>();
      candidates.forEach((c) => votes.set(c.id, 0));

      if (method === 'irv') {
        let remainingCandidates = [...candidates];
        const allVotes = voters.map((voter) =>
          spatialVoteCalculators[method](voter.x, voter.y, candidates)
        );

        while (remainingCandidates.length > 1) {
          const roundVotes = new Map<string, number>();
          remainingCandidates.forEach((c) => roundVotes.set(c.id, 0));

          allVotes.forEach((prefs) => {
            const firstChoice = prefs.find((id) =>
              remainingCandidates.some((c) => c.id === id)
            );
            if (firstChoice) {
              roundVotes.set(firstChoice, roundVotes.get(firstChoice)! + 1);
            }
          });

          const majorityNeeded = voters.length / 2;
          const leader = [...roundVotes.entries()].reduce((a, b) =>
            a[1] > b[1] ? a : b
          );

          if (leader[1] > majorityNeeded) {
            votes.set(leader[0], leader[1]);
            break;
          }

          const loser = [...roundVotes.entries()].reduce((a, b) =>
            a[1] < b[1] ? a : b
          )[0];
          remainingCandidates = remainingCandidates.filter(
            (c) => c.id !== loser
          );
        }

        if (remainingCandidates.length === 1) {
          votes.set(remainingCandidates[0].id, voters.length);
        }
      } else {
        voters.forEach((voter) => {
          const voteResult = spatialVoteCalculators[method](
            voter.x,
            voter.y,
            candidates,
            method === 'approval' ? approvalThreshold : 0
          );
          if (method === 'approval') {
            voteResult.forEach((id) => votes.set(id, votes.get(id)! + 1));
          } else if (method === 'borda') {
            voteResult.forEach((id, index) => {
              votes.set(id, votes.get(id)! + (candidates.length - 1 - index));
            });
          } else {
            votes.set(voteResult[0], votes.get(voteResult[0])! + 1);
          }
        });
      }

      const totalVotes =
        method === 'approval'
          ? [...votes.values()].reduce((a, b) => a + b, 0)
          : method === 'borda'
            ? voters.length *
              ((candidates.length * (candidates.length - 1)) / 2)
            : voters.length;

      const results: Record<string, number> = {};
      for (const [id, voteCount] of votes.entries()) {
        results[id] = (voteCount / totalVotes) * 100;
      }

      return {
        votes: Object.fromEntries(votes),
        percentages: results,
      };
    },
    [candidates, voters, hasGeneratedVoters, approvalThreshold]
  );

  useEffect(() => {
    drawVisualization();
  }, [drawVisualization]);

  const handleGenerateVoters = useCallback(() => {
    const newVoters = generateVoters(voterCount, voterDistribution);
    setVoters(newVoters);
    setHasGeneratedVoters(true);
  }, [generateVoters, voterCount, voterDistribution]);

  const getMethodEntries = () => {
    return Object.entries(methods) as Array<[VotingMethod, string]>;
  };

  return (
    <div className="w-full max-w-6xl p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
            Voting Method Comparison
          </h2>
          <div className="flex gap-4 items-center">
            <select
              value={selectedMethod}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setSelectedMethod(e.target.value as VotingMethod)
              }
              className="block w-40 px-4 py-2 border rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
            >
              {getMethodEntries().map(([value, label]) => (
                <option key={value} value={value as VotingMethod}>
                  {label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-md transition-colors"
            >
              {showSettings ? 'Hide Settings' : 'Show Settings'}
            </button>
          </div>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            {methodDescriptions[selectedMethod as keyof typeof methods]}
          </p>
        </div>
      </div>

      {hasGeneratedVoters ? (
        <div className="mt-4 space-y-4">
          {/* Theoretical Area Coverage */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">Theoretical Area Coverage</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {getMethodEntries().map(([method, label]) => {
                const areaResults = calculateWinningAreas(method);
                const winner = candidates.find(
                  (c) =>
                    c.id ===
                    Object.entries(areaResults.percentages).reduce((a, b) =>
                      a[1] > b[1] ? a : b
                    )[0]
                );

                return (
                  <div
                    key={`area-${method}`}
                    className={`p-3 rounded-lg border ${method === selectedMethod ? 'bg-white border-blue-500' : 'bg-white'}`}
                  >
                    <div className="font-medium">{label}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: winner?.color }}
                      />
                      <span>{winner?.name}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {areaResults.percentages[winner?.id ?? ''].toFixed(1)}% of
                      map area area
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actual Voter Results */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">
              Actual Voter Results ({voters.length} voters)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {getMethodEntries().map(([method, label]) => {
                const voterResults = calculateActualVotes(method);
                if (!voterResults) return null;

                const winner = candidates.find(
                  (c) =>
                    c.id ===
                    Object.entries(voterResults.percentages).reduce((a, b) =>
                      a[1] > b[1] ? a : b
                    )[0]
                );
                if (!winner) return null;

                return (
                  <div
                    key={`votes-${method}`}
                    className={`p-3 rounded-lg border ${method === selectedMethod ? 'bg-white border-blue-500' : 'bg-white'}`}
                  >
                    <div className="font-medium">{label}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: winner?.color }}
                      />
                      <span>{winner?.name}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {voterResults.votes[winner.id]} votes (
                      {voterResults.percentages[winner.id].toFixed(1)}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 p-4 bg-gray-100 rounded-lg text-center">
          <p className="text-gray-600 mb-2">
            Generate voters to see election results
          </p>
          <button
            onClick={handleGenerateVoters}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          >
            Generate {voterCount} Voters
          </button>
        </div>
      )}

      {showSettings && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">
                Candidates
              </h3>
              <div className="space-y-2">
                {candidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="flex flex-wrap items-center gap-2 p-2 border rounded bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: candidate.color }}
                    ></div>
                    <input
                      type="text"
                      value={candidate.name}
                      onChange={(e) =>
                        updateCandidateName(candidate.id, e.target.value)
                      }
                      className="px-2 py-1 border rounded w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-sm">X:</label>
                      <input
                        type="number"
                        value={candidate.x.toFixed(2)}
                        onChange={(e) =>
                          handleCoordinateInput(
                            candidate.id,
                            'x',
                            e.target.value
                          )
                        }
                        step="0.05"
                        min="0"
                        max="1"
                        className="px-2 py-1 border rounded w-20"
                      />
                      <label className="text-sm">Y:</label>
                      <input
                        type="number"
                        value={candidate.y.toFixed(2)}
                        onChange={(e) =>
                          handleCoordinateInput(
                            candidate.id,
                            'y',
                            e.target.value
                          )
                        }
                        step="0.05"
                        min="0"
                        max="1"
                        className="px-2 py-1 border rounded w-20"
                      />
                    </div>
                    <button
                      onClick={() => removeCandidate(candidate.id)}
                      className="px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded ml-auto"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  onClick={addCandidate}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-600"
                  disabled={candidates.length >= availableColors.length}
                >
                  Add Candidate
                </button>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                <p>Tip: You can adjust positions by either:</p>
                <ul className="list-disc ml-4">
                  <li>Dragging the circles on the visualization</li>
                  <li>Entering coordinates (0-1 range for both X and Y)</li>
                </ul>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Voter Settings</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label>Number of Voters:</label>
                  <input
                    type="number"
                    value={voterCount}
                    onChange={(e) =>
                      setVoterCount(Math.max(1, parseInt(e.target.value) || 0))
                    }
                    className="px-2 py-1 border rounded w-24"
                  />
                  <button
                    onClick={() =>
                      setVoters(generateVoters(voterCount, voterDistribution))
                    }
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Generate Voters
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label>Distribution:</label>
                  <select
                    value={voterDistribution}
                    onChange={(e) =>
                      setVoterDistribution(
                        e.target.value as typeof voterDistribution
                      )
                    }
                    className="px-2 py-1 border rounded"
                  >
                    <option value="uniform">Uniform</option>
                    <option value="normal">Normal</option>
                    <option value="clustered">Clustered</option>
                  </select>
                </div>
              </div>
            </div>

            {selectedMethod === 'approval' && (
              <div>
                <h3 className="font-semibold mb-2">Approval Voting Settings</h3>
                <div className="flex items-center gap-2">
                  <label>Approval Threshold:</label>
                  <input
                    type="range"
                    min="0.1"
                    max="0.5"
                    step="0.05"
                    value={approvalThreshold}
                    onChange={(e) =>
                      setApprovalThreshold(parseFloat(e.target.value))
                    }
                    className="w-40"
                  />
                  <span>{(approvalThreshold * 100).toFixed(0)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border dark:border-gray-700 rounded-lg p-4">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="w-full border dark:border-gray-700 rounded cursor-move"
          style={{ touchAction: 'none' }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        />
      </div>
    </div>
  );
};

export { VotingMethodViz };
