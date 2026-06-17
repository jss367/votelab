import type { VotingMethod } from './types';

export interface SavedElection {
  id: string;
  title: string;
  method: VotingMethod;
  createdAt: string;
}

const STORAGE_KEY = 'votelab_elections';

export function getSavedElections(): SavedElection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveElection(election: SavedElection): void {
  const elections = getSavedElections();
  elections.unshift(election);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(elections));
}

export function removeSavedElection(id: string): void {
  const elections = getSavedElections().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(elections));
}
