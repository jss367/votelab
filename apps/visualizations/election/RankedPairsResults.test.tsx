// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import RankedPairsResults from './RankedPairsResults';
import type { Election } from './types';

afterEach(cleanup);

it('shows the lock-order warning even when the selected graph has a single winner', () => {
  const election: Election = {
    title: 'Cycle election',
    votingMethod: 'rankedPairs',
    candidates: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Charlie' },
    ],
    votes: [['a', 'b', 'c'], ['b', 'c', 'a'], ['c', 'a', 'b']].map((ranking) => ({
      ranking, voterName: 'Voter', approved: [], timestamp: '',
    })),
    createdAt: '',
    createdBy: 'Owner',
    submissionsClosed: true,
    votingOpen: false,
  };
  render(<RankedPairsResults election={election} />);
  expect(screen.getByText('Tie in pair locking:')).toBeInTheDocument();
  expect(screen.getByText(/Alice over Bob; Bob over Charlie; Charlie over Alice/)).toHaveTextContent(
    /may change the winner/
  );
  expect(screen.queryByText(/none of them is beaten/)).not.toBeInTheDocument();
});
