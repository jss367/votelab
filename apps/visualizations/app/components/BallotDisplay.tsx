import { type Ballot } from '../utils/ballotGeneration';

interface BallotDisplayProps {
  ballot: Ballot;
  candidates: Array<{ id: string; name: string }>;
}

export function BallotDisplay({ ballot, candidates }: BallotDisplayProps) {
  const getCandidateName = (id: string) => 
    candidates.find(c => c.id === id)?.name || id;

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-700 shadow dark:border-gray-600">
      <h4 className="font-bold mb-2 text-gray-900 dark:text-white">
        Voter at ({ballot.voterPosition.x.toFixed(2)}, {ballot.voterPosition.y.toFixed(2)})
      </h4>
      {ballot.type === 'ranked' ? (
        <div className="space-y-2">
          {ballot.rankings.map((candidateId, index) => (
            <div key={index} className="flex justify-between text-gray-700 dark:text-gray-200">
              <span>Rank {index + 1}:</span>
              <span>{getCandidateName(candidateId)}</span>
            </div>
          ))}
        </div>
      ) : ballot.type === 'star' ? (
        <div className="space-y-2">
          {Object.entries(ballot.ratings).map(([candidateId, rating]) => (
            <div key={candidateId} className="flex justify-between text-gray-700 dark:text-gray-200">
              <span>{getCandidateName(candidateId)}:</span>
              <span>{rating} stars</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-700 dark:text-gray-200">
          <span>Vote: {getCandidateName(ballot.choice)}</span>
        </div>
      )}
    </div>
  );
} 
