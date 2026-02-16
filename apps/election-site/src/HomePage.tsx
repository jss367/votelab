import { Button, Card, CardContent, CardHeader } from '@repo/ui';
import type { VotingMethod } from './types';

const VOTING_METHODS: Array<{
  id: VotingMethod;
  name: string;
  description: string;
  ballotType: string;
}> = [
  {
    id: 'plurality',
    name: 'Plurality',
    description: 'Each voter picks one candidate. Most votes wins.',
    ballotType: 'Pick one',
  },
  {
    id: 'approval',
    name: 'Approval',
    description: 'Voters approve as many candidates as they like. Most approvals wins.',
    ballotType: 'Check all you approve',
  },
  {
    id: 'irv',
    name: 'Instant Runoff (IRV)',
    description: 'Voters rank candidates. Lowest-vote candidate eliminated each round until one has a majority.',
    ballotType: 'Rank all candidates',
  },
  {
    id: 'borda',
    name: 'Borda Count',
    description: 'Voters rank candidates. Points awarded by position. Highest total wins.',
    ballotType: 'Rank all candidates',
  },
  {
    id: 'condorcet',
    name: 'Condorcet',
    description: 'Finds the candidate who would beat every other candidate in a head-to-head matchup.',
    ballotType: 'Rank all candidates',
  },
  {
    id: 'smithApproval',
    name: 'Smith + Approval',
    description: 'Finds the smallest set of candidates who beat all others, then picks the most approved.',
    ballotType: 'Rank and approve',
  },
  {
    id: 'rrv',
    name: 'Reweighted Range Voting (RRV)',
    description: 'Score all candidates. Picks multiple winners proportionally, ensuring diverse representation.',
    ballotType: 'Score all candidates 0–10',
  },
];

interface HomePageProps {
  onSelectMethod: (method: VotingMethod) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onSelectMethod }) => {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-slate-900">VoteLab</h1>
        <p className="text-lg text-slate-500">
          Explore different ways to vote. Create an election using any of these voting methods.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {VOTING_METHODS.map((method) => (
          <Card
            key={method.id}
            className="hover:shadow-lg transition-shadow duration-200 flex flex-col"
          >
            <CardHeader>
              <h3 className="text-lg font-bold text-slate-900">{method.name}</h3>
              <p className="text-sm text-slate-500">{method.ballotType}</p>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col justify-between gap-4">
              <p className="text-sm text-slate-600">{method.description}</p>
              <Button
                className="w-full"
                onClick={() => onSelectMethod(method.id)}
              >
                Create Election
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="text-center">
        <a
          href="https://votelab-visualizations.web.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          Explore voting methods visually
        </a>
      </div>
    </div>
  );
};

export default HomePage;
