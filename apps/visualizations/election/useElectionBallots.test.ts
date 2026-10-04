// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import { useElectionBallots } from './useElectionBallots';

const { subscriptions } = vi.hoisted(() => ({
  subscriptions: [] as Array<{
    path: string;
    receive: (snapshot: unknown) => void;
    unsubscribe: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  onSnapshot: (path: string, receive: (snapshot: unknown) => void) => {
    const unsubscribe = vi.fn();
    subscriptions.push({ path, receive, unsubscribe });
    return unsubscribe;
  },
}));
const db = {} as Firestore;
const onError = vi.fn();
const ballot = (id: string, timestamp = '2026-01-01') => ({
  id, exists: () => true,
  data: () => ({ voterName: id, ranking: ['a'], approved: [], timestamp }),
});

beforeEach(() => { subscriptions.length = 0; });
afterEach(cleanup);

it('waits for sign-in and subscribes only to the current voter on a voting page', () => {
  const { result, rerender } = renderHook(({ uid }: { uid: string | null }) =>
    useElectionBallots(db, 'election', 'own', uid, onError),
  { initialProps: { uid: null } });
  expect(subscriptions).toHaveLength(0);
  rerender({ uid: 'voter' });
  expect(subscriptions.map((s) => s.path)).toEqual(['elections/election/votes/voter']);
  act(() => subscriptions[0].receive(ballot('voter')));
  expect(result.current.map((b) => b.uid)).toEqual(['voter']);
  act(() => subscriptions[0].receive({ exists: () => false }));
  expect(result.current).toEqual([]);
});

it('switches to all ballots for results/admin and releases listeners when leaving', () => {
  const { result, rerender, unmount } = renderHook(({ scope }: { scope: 'own' | 'all' | 'none' }) =>
    useElectionBallots(db, 'election', scope, 'voter', onError),
  { initialProps: { scope: 'own' } });
  act(() => subscriptions[0].receive(ballot('voter')));
  rerender({ scope: 'all' });
  expect(subscriptions[0].unsubscribe).toHaveBeenCalledOnce();
  expect(result.current).toEqual([]);
  expect(subscriptions[1].path).toBe('elections/election/votes');
  act(() => subscriptions[1].receive({ docs: [ballot('later', '2026-02-01'), ballot('earlier')] }));
  expect(result.current.map((b) => b.uid)).toEqual(['earlier', 'later']);
  rerender({ scope: 'none' });
  expect(subscriptions[1].unsubscribe).toHaveBeenCalledOnce();
  expect(result.current).toEqual([]);
  expect(subscriptions).toHaveLength(2);
  unmount();
});

it('clears the old voter/election and ignores late callbacks from their subscriptions', () => {
  const { result, rerender, unmount } = renderHook(({ id, uid }) =>
    useElectionBallots(db, id, 'own', uid, onError),
  { initialProps: { id: 'first', uid: 'alice' } });
  act(() => subscriptions[0].receive(ballot('alice')));
  rerender({ id: 'first', uid: 'bob' });
  expect(result.current).toEqual([]);
  expect(subscriptions[0].unsubscribe).toHaveBeenCalledOnce();
  act(() => subscriptions[1].receive(ballot('bob')));
  act(() => subscriptions[0].receive(ballot('alice')));
  expect(result.current.map((b) => b.uid)).toEqual(['bob']);
  rerender({ id: 'second', uid: 'bob' });
  expect(result.current).toEqual([]);
  expect(subscriptions[1].unsubscribe).toHaveBeenCalledOnce();
  expect(subscriptions[2].path).toBe('elections/second/votes/bob');
  unmount();
  expect(subscriptions[2].unsubscribe).toHaveBeenCalledOnce();
});

it('loads public results without waiting for authentication or restarting on sign-in', () => {
  const { rerender } = renderHook(({ uid }: { uid: string | null }) =>
    useElectionBallots(db, 'election', 'all', uid, onError),
  { initialProps: { uid: null } });
  expect(subscriptions[0].path).toBe('elections/election/votes');
  rerender({ uid: 'voter' });
  expect(subscriptions).toHaveLength(1);
});
