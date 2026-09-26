import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteDoc,
  getDocsFromServer,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { deleteElection } from './deleteElection';

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _collection: string, id: string) => ({ path: `elections/${id}` }),
  collection: (parent: { path: string }, name: string) => ({ path: `${parent.path}/${name}` }),
  updateDoc: vi.fn(),
  getDocsFromServer: vi.fn(),
  writeBatch: vi.fn(),
  deleteDoc: vi.fn(),
}));

const db = {} as Firestore;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('deleteElection', () => {
  it('waits for voting to close, includes a final ballot, and clears all batches before the parent', async () => {
    let closeVoting!: () => void;
    const closed = new Promise<void>((resolve) => { closeVoting = resolve; });
    vi.mocked(updateDoc).mockReturnValue(closed);
    const ballots = Array.from({ length: 500 }, (_, i) => ({ ref: { path: `votes/${i}` } }));
    vi.mocked(getDocsFromServer).mockImplementation(async () => ({ docs: [...ballots] }) as never);
    const deleted: string[] = [];
    const batchSizes: number[] = [];
    vi.mocked(writeBatch).mockImplementation(() => {
      const pending: string[] = [];
      return {
        delete: vi.fn((ref) => { pending.push(ref.path); }),
        commit: vi.fn(async () => {
          batchSizes.push(pending.length);
          deleted.push(...pending);
        }),
      } as unknown as ReturnType<typeof writeBatch>;
    });
    vi.mocked(deleteDoc).mockImplementation(async () => {
      expect(deleted).toEqual(ballots.map((ballot) => ballot.ref.path));
    });

    const deletion = deleteElection(db, 'test');
    expect(updateDoc).toHaveBeenCalledWith({ path: 'elections/test' }, { votingOpen: false });
    expect(getDocsFromServer).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
    // This vote commits while the close-voting write is still pending.
    ballots.push({ ref: { path: 'votes/late-voter' } });
    closeVoting();
    await deletion;

    expect(getDocsFromServer).toHaveBeenCalledWith({ path: 'elections/test/votes' });
    expect(batchSizes).toEqual([500, 1]);
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'elections/test' });
  });

  it('does not delete ballots or the parent if closing voting fails', async () => {
    vi.mocked(updateDoc).mockRejectedValue(new Error('permission denied'));
    await expect(deleteElection(db, 'test')).rejects.toThrow('permission denied');
    expect(getDocsFromServer).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('keeps the parent when a ballot batch fails so cleanup can be retried', async () => {
    vi.mocked(getDocsFromServer).mockResolvedValue({ docs: [{ ref: {} }] } as never);
    vi.mocked(writeBatch).mockReturnValue({
      delete: vi.fn(),
      commit: vi.fn().mockRejectedValue(new Error('offline')),
    } as unknown as ReturnType<typeof writeBatch>);
    await expect(deleteElection(db, 'test')).rejects.toThrow('offline');
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});
