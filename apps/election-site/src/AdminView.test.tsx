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
  createdByUid: 'creator-uid',
};

const noop = vi.fn();
const noopAsync = vi.fn().mockResolvedValue(undefined);

const defaultProps = {
  election: baseElection,
  electionId: 'test-id',
  currentUserUid: 'creator-uid',
  authReady: true,
  onCloseSubmissions: noop,
  onCloseVoting: noop,
  onReopenVoting: noopAsync,
  onDelete: noopAsync,
  onUpdate: noopAsync,
};

describe('AdminView owner gate', () => {
  test('shows loading state while auth initializes', () => {
    render(<AdminView {...defaultProps} authReady={false} currentUserUid={null} />);
    expect(screen.getByText('Test Election')).toBeInTheDocument();
    expect(screen.getByText(/checking admin access/i)).toBeInTheDocument();
    expect(screen.queryByText('Controls')).not.toBeInTheDocument();
  });

  test('blocks admin controls when current Firebase user is not the creator', () => {
    render(<AdminView {...defaultProps} currentUserUid="other-uid" />);
    expect(screen.getByText('Test Election')).toBeInTheDocument();
    expect(screen.getByText(/firebase user that created/i)).toBeInTheDocument();
    expect(screen.queryByText('Controls')).not.toBeInTheDocument();
  });

  test('shows legacy name gate when the election has no owner uid', () => {
    const legacyElection: Election = {
      ...baseElection,
      createdByUid: undefined,
    };
    render(
      <AdminView
        {...defaultProps}
        election={legacyElection}
        currentUserUid="creator-uid"
      />
    );
    expect(screen.getByPlaceholderText(/creator name/i)).toBeInTheDocument();
    expect(screen.queryByText('Controls')).not.toBeInTheDocument();
  });

  test('unlocks legacy admin controls on matching creator name', async () => {
    const user = userEvent.setup();
    const legacyElection: Election = {
      ...baseElection,
      createdByUid: undefined,
    };
    render(
      <AdminView
        {...defaultProps}
        election={legacyElection}
        currentUserUid="other-uid"
      />
    );

    await user.type(screen.getByPlaceholderText(/creator name/i), ' julius ');
    await user.click(screen.getByRole('button', { name: /access admin panel/i }));

    expect(screen.getByText('Controls')).toBeInTheDocument();
  });

  test('keeps legacy admin controls locked when creator name does not match', async () => {
    const user = userEvent.setup();
    const legacyElection: Election = {
      ...baseElection,
      createdByUid: undefined,
    };
    render(
      <AdminView
        {...defaultProps}
        election={legacyElection}
        currentUserUid="other-uid"
      />
    );

    await user.type(screen.getByPlaceholderText(/creator name/i), 'Someone Else');
    await user.click(screen.getByRole('button', { name: /access admin panel/i }));

    expect(screen.getByText(/doesn't match/i)).toBeInTheDocument();
    expect(screen.queryByText('Controls')).not.toBeInTheDocument();
  });

  test('shows admin controls when current Firebase user matches creator uid', () => {
    render(<AdminView {...defaultProps} />);
    expect(screen.getByText('Controls')).toBeInTheDocument();
  });
});
