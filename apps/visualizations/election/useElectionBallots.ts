import { collection, doc, onSnapshot, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Vote } from './types';

type Ballot = { uid: string; vote: Vote };
type Scope = 'all' | 'own' | 'none';

export function useElectionBallots(
  db: Firestore,
  electionId: string | null,
  scope: Scope,
  currentUserUid: string | null,
  onError: (message: string) => void
): Ballot[] {
  const voterUid = scope === 'own' ? currentUserUid : null;
  const key = JSON.stringify([electionId, scope, voterUid]);
  const [snapshot, setSnapshot] = useState<{ key: string; ballots: Ballot[] } | null>(null);

  useEffect(() => {
    if (!electionId || scope === 'none' || (scope === 'own' && !voterUid)) return;
    let active = true;
    const receive = (ballots: Ballot[]) => {
      if (active) setSnapshot({ key, ballots });
    };
    const fail = (error: Error) => {
      if (!active) return;
      onError('Error loading votes');
      console.error(error);
    };
    const unsubscribe = scope === 'all'
      ? onSnapshot(collection(db, 'elections', electionId, 'votes'), (result) => {
          receive(result.docs
            .map((ballot) => ({ uid: ballot.id, vote: ballot.data() as Vote }))
            .sort((a, b) => a.vote.timestamp.localeCompare(b.vote.timestamp)));
        }, fail)
      : onSnapshot(doc(db, 'elections', electionId, 'votes', voterUid!), (result) => {
          receive(result.exists() ? [{ uid: result.id, vote: result.data() as Vote }] : []);
        }, fail);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [db, electionId, scope, voterUid, key, onError]);

  // Never carry ballots from a different election, view, or signed-in voter.
  return snapshot?.key === key ? snapshot.ballots : [];
}
