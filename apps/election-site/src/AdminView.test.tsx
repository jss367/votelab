import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import AdminView from './AdminView';
import type { Election } from './types';

const baseElection: Election = {
  title: 'Test Election',
  votingMethod: 'plurality',
  candidates: [{ id: '1', name: 'Alice' }],
  votes: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  submissionsClosed: false,
  votingOpen: false,
  createdBy: 'Julius',
};

const noop = vi.fn();
const noopAsync = vi.fn().mockResolvedValue(undefined);

const defaultProps = {
  election: baseElection,
  electionId: 'test-id',
  onCloseSubmissions: noop,
  onCloseVoting: noop,
  onReopenVoting: noopAsync,
  onDelete: noopAsync,
  onUpdate: noopAsync,
};

describe('AdminView name gate', () => {
  test('shows election title and name prompt instead of admin controls by default', () => {
    render(<AdminView {...defaultProps} />);
    expect(screen.getByText('Test Election')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/creator/i)).toBeInTheDocument();
    expect(screen.queryByText('Controls')).not.toBeInTheDocument();
  });

  test('shows error on wrong name', async () => {
    const user = userEvent.setup();
    render(<AdminView {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/creator/i), 'WrongName');
    await user.click(screen.getByRole('button', { name: /unlock|access|manage/i }));
    expect(screen.getByText(/doesn.*match/i)).toBeInTheDocument();
    expect(screen.queryByText('Controls')).not.toBeInTheDocument();
  });

  test('unlocks admin controls on correct name (case-insensitive)', async () => {
    const user = userEvent.setup();
    render(<AdminView {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/creator/i), 'julius');
    await user.click(screen.getByRole('button', { name: /unlock|access|manage/i }));
    expect(screen.getByText('Controls')).toBeInTheDocument();
  });

  test('unlocks via Enter key', async () => {
    const user = userEvent.setup();
    render(<AdminView {...defaultProps} />);
    const input = screen.getByPlaceholderText(/creator/i);
    await user.type(input, 'Julius{Enter}');
    expect(screen.getByText('Controls')).toBeInTheDocument();
  });

  test('unlocks on correct name with extra whitespace', async () => {
    const user = userEvent.setup();
    render(<AdminView {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/creator/i), '  Julius  ');
    await user.click(screen.getByRole('button', { name: /unlock|access|manage/i }));
    expect(screen.getByText('Controls')).toBeInTheDocument();
  });
});
