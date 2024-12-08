import { Card } from '@repo/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

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

type ElectionRound = ElectionResult[];

type PlacementMode = 'none' | 'voter' | 'candidate';

const DetailedVotingViz = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([
    { id: '1', x: 0.3, y: 0.7, color: '#22c55e', name: 'Alice' },
    { id: '2', x: 0.5, y: 0.5, color: '#ef4444', name: 'Bob' },
    { id: '3', x: 0.7, y: 0.3, color: '#3b82f6', name: 'Charlie' },
  ]);

  const [voters, setVoters] = useState<Voter[]>([]);
  const [ballots, setBallots] = useState<Ballot[]>([]);
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
    setBallots(newBallots);
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
          if (r.status === 'Active') r.status = 'Rejected';
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

  const drawCanvas = useCallback((): void => {
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

    // Draw voters
    voters.forEach((voter, index) => {
      ctx.beginPath();
      ctx.arc(
        voter.x * CANVAS_SIZE,
        (1 - voter.y) * CANVAS_SIZE,
        4,
        0,
        2 * Math.PI
      );
      ctx.fillStyle = '#4b5563';
      ctx.fill();
      ctx.fillText(
        `V${index + 1}`,
        voter.x * CANVAS_SIZE + 8,
        (1 - voter.y) * CANVAS_SIZE + 4
      );
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
  }, [candidates, voters, placementMode]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (placementMode === 'none' || !canvasRef.current) return;

    const point = getCanvasPoint(canvasRef.current, e.clientX, e.clientY);

    if (placementMode === 'voter') {
      setVoters([...voters, { x: point.x, y: point.y }]);
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
        <div className="flex gap-4">
          <button
            onClick={() =>
              setPlacementMode((mode) => (mode === 'voter' ? 'none' : 'voter'))
            }
            className={`px-4 py-2 rounded-lg ${
              placementMode === 'voter'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {placementMode === 'voter'
              ? 'Finish Placing Voters'
              : 'Place Voters'}
          </button>
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

        {ballots.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Generated Ballots</h3>
            <div className="bg-gray-50 p-4 rounded-lg font-mono text-sm">
              {ballots.map((ballot, i) => (
                <div key={i}>Ranked ballot: {ballot.ranking.join(', ')}</div>
              ))}
            </div>
          </div>
        )}

        {electionResults && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Election Results</h3>
            {electionResults.map((round, roundIndex) => (
              <div key={roundIndex} className="bg-gray-50 p-4 rounded-lg">
                <div className="font-semibold mb-2">
                  {roundIndex === electionResults.length - 1
                    ? 'FINAL RESULT'
                    : `ROUND ${roundIndex + 1}`}
                </div>
                <div className="font-mono">
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
      </div>
    </Card>
  );
};

export default DetailedVotingViz;
