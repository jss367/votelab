import { Ballot } from './ballotGeneration';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: number;
}

const CACHE_VERSION = 1;

export function createCache<T>(prefix: string) {
  const getKey = (key: string) => `${prefix}_${key}`;

  return {
    get: async (key: string): Promise<T | null> => {
      try {
        const response = await fetch(
          `/api/cache?key=${encodeURIComponent(getKey(key))}`
        );

        if (!response.ok) {
          return null;
        }

        const { data } = await response.json();
        const cached = data as CacheEntry<T>;

        if (cached.version !== CACHE_VERSION) {
          await this.clear(key);
          return null;
        }

        return cached.data;
      } catch (error) {
        console.error('Cache get error:', error);
        return null;
      }
    },

    set: async (key: string, data: T) => {
      try {
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          version: CACHE_VERSION,
        };

        await fetch('/api/cache', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: getKey(key),
            data: entry,
          }),
        });
      } catch (error) {
        console.error('Cache set error:', error);
      }
    },

    clear: async (key?: string) => {
      try {
        await fetch('/api/cache', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: key ? getKey(key) : `${prefix}_`,
            data: null,
          }),
        });
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
