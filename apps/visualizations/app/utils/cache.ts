import { Ballot } from './ballotGeneration';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: number;
}

const CACHE_VERSION = 1;

// Guard for SSR / static export: localStorage only exists in the browser.
function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    // Accessing localStorage can throw (e.g. blocked by privacy settings).
    return null;
  }
}

export function createCache<T>(prefix: string) {
  const getKey = (key: string) => `${prefix}_${key}`;

  return {
    get: async (key: string): Promise<T | null> => {
      const storage = getStorage();
      if (!storage) return null;

      try {
        const raw = storage.getItem(getKey(key));
        if (!raw) return null;

        const cached = JSON.parse(raw) as CacheEntry<T>;

        if (cached.version !== CACHE_VERSION) {
          return null;
        }

        return cached.data;
      } catch (error) {
        // Corrupt entry or parse failure -> treat as cache miss / recompute.
        console.error('Cache get error:', error);
        return null;
      }
    },

    set: async (key: string, data: T) => {
      const storage = getStorage();
      if (!storage) return;

      try {
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          version: CACHE_VERSION,
        };

        storage.setItem(getKey(key), JSON.stringify(entry));
      } catch (error) {
        // QuotaExceededError or serialization failure -> degrade gracefully (no-op).
        console.error('Cache set error:', error);
      }
    },

    clear: async (key?: string) => {
      const storage = getStorage();
      if (!storage) return;

      try {
        if (key) {
          storage.removeItem(getKey(key));
          return;
        }

        // Clear all entries for this cache's prefix.
        const prefixKey = `${prefix}_`;
        const toRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const storedKey = storage.key(i);
          if (storedKey && storedKey.startsWith(prefixKey)) {
            toRemove.push(storedKey);
          }
        }
        toRemove.forEach((k) => storage.removeItem(k));
      } catch (error) {
        console.error('Cache clear error:', error);
      }
    },
  };
}

// Create specific caches for our use cases
interface VisualizationResult {
  imageData: number[]; // Convert ImageData to array for storage
  width: number;
  height: number;
}

interface BallotResult {
  ballots: Array<{
    voterPosition: { x: number; y: number };
    pluralityBallot: Ballot;
    rankedBallot: Ballot;
    starBallot: Ballot;
  }>;
}

export const visualizationCache = createCache<VisualizationResult>('viz');
export const ballotCache = createCache<BallotResult>('ballots');
