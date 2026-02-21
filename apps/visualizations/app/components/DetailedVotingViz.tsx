import { Card } from '@repo/ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import VotingMethodComparisonGrid from './VotingMethodComparisonGrid';

interface Candidate {
  id: string;
  x: number;
  y: number;
  color: string;
  name: string;
}

interface Voter {
  x: number;
  y: number;
}

interface Ballot {
  voterX: number;
  voterY: number;
  ranking: string[];
}

interface ElectionResult {
  name: string;
  votes: number;
  status: string;
}

interface Point {
  x: number;
  y: number;
}

interface VoterBlocConfig {
  voterCount: number;
  variance: number;
}

interface AggregatedBallot {
  ranking: string[];
  count: number;
}

type ElectionRound = ElectionResult[];

type PlacementMode = 'none' | 'voter' | 'voterBloc' | 'candidate';

// Box-Muller transform for normal distribution
const generateNormalRandom = (): number => {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

const DetailedVotingViz = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([
    { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'Alice' },
    { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'Bob' },
    { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'Charlie' },
  ]);

  const [voters, setVoters] = useState<Voter[]>([]);
  const [electionResults, setElectionResults] = useState<
    ElectionRound[] | null
  >(null);
  const [placementMode, setPlacementMode] = useState<PlacementMode>('none');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState<string | null>(null);

  const CANVAS_SIZE = 400;

  const getCanvasPoint = (
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number
  ): Point => {
    const rect = canvas.getBoundingClientRect();

    // Calculate the scaling factors between displayed size and internal size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Convert click coordinates to canvas coordinates
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    // Convert to normalized coordinates (0-1)
    return {
      x: canvasX / canvas.width,
      y: 1 - canvasY / canvas.height, // Invert Y coordinate
    };
  };

  const [aggregatedBallots, setAggregatedBallots] = useState<
    AggregatedBallot[]
  >([]);
  const [voterBlocConfig, setVoterBlocConfig] = useState<VoterBlocConfig>({
    voterCount: 1000,
    variance: 0.1,
  });

  const createVoterBloc = (centerX: number, centerY: number): Voter[] => {
    const newVoters: Voter[] = [];
    const { voterCount, variance } = voterBlocConfig;

    for (let i = 0; i < voterCount; i++) {
      // Generate normally distributed coordinates around the center point
      let x: number, y: number;
      do {
        x = centerX + generateNormalRandom() * variance;
        y = centerY + generateNormalRandom() * variance;
      } while (x < 0 || x > 1 || y < 0 || y > 1); // Ensure voters are within bounds

      newVoters.push({ x, y });
    }

    return newVoters;
  };

  const distance = (x1: number, y1: number, x2: number, y2: number): number =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

  const getVoterPreferences = (
    voterX: number,
    voterY: number
  ): Array<{ id: string; name: string; dist: number }> => {
    return candidates
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        dist: distance(voterX, voterY, candidate.x, candidate.y),
      }))
      .sort((a, b) => a.dist - b.dist);
  };

  const generateBallots = (): Ballot[] => {
    const newBallots = voters.map((voter) => {
      const prefs = getVoterPreferences(voter.x, voter.y);
      return {
        voterX: voter.x,
        voterY: voter.y,
        ranking: prefs.map((p) => p.name),
      };
    });

    // Aggregate ballots
    const ballotCounts = new Map<string, number>();
    newBallots.forEach((ballot) => {
      const key = ballot.ranking.join(',');
      ballotCounts.set(key, (ballotCounts.get(key) || 0) + 1);
    });

    // Convert to array of AggregatedBallot objects, sorted by count
    const aggregated = Array.from(ballotCounts.entries())
      .map(([key, count]) => ({
        ranking: key.split(','),
        count,
      }))
      .sort((a, b) => b.count - a.count);

    setAggregatedBallots(aggregated);
    return newBallots;
  };

  const runElection = (ballots: Ballot[]): void => {
    const rounds: ElectionRound[] = [];
    const currentBallots = [...ballots]; // Fixed: Define currentBallots
    let remainingCandidates = [...candidates];

    if (currentBallots.length === 0) {
      setElectionResults([]);
      return;
    }

    while (remainingCandidates.length > 1) {
      const voteCounts: { [key: string]: number } = {};
      remainingCandidates.forEach((c) => (voteCounts[c.name] = 0));

      // Count first preferences among remaining candidates
      currentBallots.forEach((ballot) => {
        const firstChoice = ballot.ranking.find((name) =>
          remainingCandidates.some((c) => c.name === name)
        );
        if (firstChoice) {
          voteCounts[firstChoice]++;
        }
      });

      const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);

      // Handle case where no valid votes were cast
      if (totalVotes === 0) {
        setElectionResults([]);
        return;
      }

      const roundResults: ElectionResult[] = remainingCandidates.map(
        (candidate) => ({
          name: candidate.name,
          votes: voteCounts[candidate.name],
          status: 'Active',
        })
      );

      const leader = Object.entries(voteCounts).reduce((a, b) =>
        a[1] > b[1] ? a : b
      );

      // Check if we have a majority winner
      if (leader[1] > totalVotes / 2) {
        roundResults.find((r) => r.name === leader[0])!.status = 'Elected';
        roundResults.forEach((r) => {
          if (r.status === 'Active') {
            r.status = 'Rejected';
          }
        });
        rounds.push(roundResults);
        break;
      }

      // Eliminate candidate with fewest votes
      const loser = Object.entries(voteCounts).reduce((a, b) =>
        a[1] < b[1] ? a : b
      );

      roundResults.find((r) => r.name === loser[0])!.status = 'Rejected';
      rounds.push(roundResults);

      // Create new array instead of mutating
      remainingCandidates = remainingCandidates.filter(
        (c) => c.name !== loser[0]
      );
    }

    // Handle final remaining candidate if we didn't find a majority winner
    if (remainingCandidates.length === 1) {
      rounds.push([
        {
          name: remainingCandidates[0].name,
          votes: currentBallots.length,
          status: 'Elected',
        },
      ]);
    }

    setElectionResults(rounds);
  };

  const drawVoterPlacementCanvas = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    for (let i = 0; i <= 10; i++) {
      const pos = (i / 10) * CANVAS_SIZE;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, CANVAS_SIZE);
      ctx.moveTo(0, pos);
      ctx.lineTo(CANVAS_SIZE, pos);
      ctx.stroke();
    }

    // Draw voters with smaller points for blocs
    voters.forEach((voter) => {
      ctx.beginPath();
      ctx.arc(
        voter.x * CANVAS_SIZE,
        (1 - voter.y) * CANVAS_SIZE,
        2, // Smaller radius for better visualization of density
        0,
        2 * Math.PI
      );
      ctx.fillStyle = 'rgba(75, 85, 99, 0.3)'; // Semi-transparent for better overlap visibility
      ctx.fill();
    });

    // Draw candidates
    candidates.forEach((candidate) => {
      ctx.beginPath();
      ctx.arc(
        candidate.x * CANVAS_SIZE,
        (1 - candidate.y) * CANVAS_SIZE,
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
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        candidate.name,
        candidate.x * CANVAS_SIZE,
        (1 - candidate.y) * CANVAS_SIZE + 20
      );
    });
  }, [candidates, voters]);

  useEffect(() => {
    drawVoterPlacementCanvas();
  }, [drawVoterPlacementCanvas]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (placementMode === 'none' || !canvasRef.current) return;

    const point = getCanvasPoint(canvasRef.current, e.clientX, e.clientY);

    if (placementMode === 'voter') {
      setVoters([...voters, { x: point.x, y: point.y }]);
    } else if (placementMode === 'voterBloc') {
      const newVoters = createVoterBloc(point.x, point.y);
      setVoters([...voters, ...newVoters]);
    }
  };

  const handleCanvasMouseDown = (
    e: React.MouseEvent<HTMLCanvasElement>
  ): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = getCanvasPoint(canvas, e.clientX, e.clientY);

    // Find clicked candidate using normalized coordinates
    const clickedCandidate = candidates.find(
      (candidate) => distance(point.x, point.y, candidate.x, candidate.y) < 0.05
    );

    if (clickedCandidate) {
      setIsDragging(clickedCandidate.id);
      e.preventDefault();
    }
  };

  const handleCanvasMouseMove = (
    e: React.MouseEvent<HTMLCanvasElement>
  ): void => {
    if (!isDragging || !canvasRef.current) return;

    const point = getCanvasPoint(canvasRef.current, e.clientX, e.clientY);

    setCandidates(
      candidates.map((c) =>
        c.id === isDragging ? { ...c, x: point.x, y: point.y } : c
      )
    );
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(null);
  };

  return (
    <Card className="w-full max-w-6xl p-6 space-y-6">
      <div className="space-y-4">
        {/* Existing Controls */}
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <button
              onClick={() => setPlacementMode('voter')}
              className={`px-4 py-2 rounded-lg ${
                placementMode === 'voter'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Place Individual Voters
            </button>
            <button
              onClick={() => setPlacementMode('voterBloc')}
              className={`px-4 py-2 rounded-lg ${
                placementMode === 'voterBloc'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Place Voter Bloc
            </button>
            <button
              onClick={() => setPlacementMode('none')}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              Stop Placing
            </button>
          </div>

          {placementMode === 'voterBloc' && (
            <div className="flex gap-4 items-center bg-gray-50 p-4 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Voters per Bloc
                </label>
                <input
                  type="number"
                  value={voterBlocConfig.voterCount}
                  onChange={(e) =>
                    setVoterBlocConfig((prev) => ({
                      ...prev,
                      voterCount: Math.max(1, parseInt(e.target.value) || 0),
                    }))
                  }
                  className="mt-1 block w-32 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 shadow-sm"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Variance
                </label>
                <input
                  type="range"
                  min="0.01"
                  max="0.3"
                  step="0.01"
                  value={voterBlocConfig.variance}
                  onChange={(e) =>
                    setVoterBlocConfig((prev) => ({
                      ...prev,
                      variance: parseFloat(e.target.value),
                    }))
                  }
                  className="mt-1 block w-32"
                />

                <span className="text-sm text-gray-500 dark:text-gray-300">
                  {voterBlocConfig.variance.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}

          <div className="flex gap-4">
            <button
              onClick={() => {
                const newBallots = generateBallots();
                runElection(newBallots);
              }}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              disabled={voters.length === 0}
            >
              Generate & Run Election
            </button>
            <button
              onClick={() => setVoters([])}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              Clear Voters
            </button>
          </div>
        </div>

        {/* Main Canvas */}
        <div className="border rounded-lg p-4">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="w-full aspect-square border rounded cursor-move touch-none"
            onClick={handleCanvasClick}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          />
        </div>

        {/* Results Section */}
        <div className="space-y-8">
          {/* Ballot Distribution */}
          {aggregatedBallots.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Ballot Distribution</h3>
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <div className="grid grid-cols-[1fr,auto] gap-4 font-mono text-sm text-gray-900 dark:text-gray-100">
                  <div className="font-bold">Ranking</div>
                  <div className="font-bold text-right">Count</div>
                  {aggregatedBallots.map((ballot, i) => (
                    <React.Fragment key={i}>
                      <div>{ballot.ranking.join(' > ')}</div>
                      <div className="text-right">
                        {ballot.count.toLocaleString()}
                      </div>
                    </React.Fragment>
                  ))}
                  <div className="border-t border-gray-200 dark:border-gray-600 col-span-2 mt-2 pt-2">
                    <strong>Total Ballots: </strong>
                    {voters.length.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Election Results */}
          {electionResults && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Election Results</h3>
              {electionResults.map((round, roundIndex) => (
                <div
                  key={roundIndex}
                  className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg"
                >
                  <div className="font-semibold mb-2 text-gray-900 dark:text-gray-100">
                    {roundIndex === electionResults.length - 1
                      ? 'FINAL RESULT'
                      : `ROUND ${roundIndex + 1}`}
                  </div>
                  <div className="font-mono text-gray-900 dark:text-gray-100">
                    <div className="grid grid-cols-3 gap-4 font-bold mb-1">
                      <div>Candidate</div>
                      <div>Votes</div>
                      <div>Status</div>
                    </div>
                    {round.map((result, i) => (
                      <div key={i} className="grid grid-cols-3 gap-4">
                        <div>{result.name}</div>
                        <div>{result.votes}</div>
                        <div>{result.status}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Method Comparison Visualizations */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Method Comparison</h3>
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                These visualizations show how different voting methods would
                determine the winner based on where voters are centered. Each
                point&apos;s color represents which candidate would win if voters
                were concentrated around that location.
              </p>
              <VotingMethodComparisonGrid />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default DetailedVotingViz;
