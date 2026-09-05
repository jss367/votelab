// apps/visualizations/lib/urlState.ts
import { SpatialCandidate, VoterBloc, VotingMethod } from '@votelab/shared-utils';

export interface ElectionConfig {
  candidates: SpatialCandidate[];
  blocs: VoterBloc[];
  method: VotingMethod;
  approvalThreshold: number;
}

/**
 * Serialize election config to URL search params.
 * Format: candidates=A,0.3,0.5,#ef4444;B,0.7,0.5,#3b82f6&blocs=0.5,0.5,0.1,500&method=irv&threshold=0.3
 */
export const serializeConfig = (config: ElectionConfig): string => {
  const params = new URLSearchParams();

  // Candidates: name,x,y,color;name,x,y,color
  const candidatesStr = config.candidates
    .map(
      (c) =>
        `${encodeURIComponent(c.name)},${c.x.toFixed(3)},${c.y.toFixed(3)},${c.color}`
    )
    .join(';');
  params.set('candidates', candidatesStr);

  // Blocs: x,y,spread,count;x,y,spread,count
  const blocsStr = config.blocs
    .map(
      (b) =>
        `${b.position.x.toFixed(3)},${b.position.y.toFixed(3)},${b.spread.toFixed(3)},${b.count}`
    )
    .join(';');
  params.set('blocs', blocsStr);

  params.set('method', config.method);
  params.set('threshold', config.approvalThreshold.toFixed(2));

  return params.toString();
};

const SPATIAL_METHODS: ReadonlySet<string> = new Set<VotingMethod>([
  'plurality',
  'approval',
  'irv',
  'borda',
  'condorcet',
  'smithApproval',
]);

// Names are percent-encoded on serialize so ',' and ';' in a name don't
// corrupt the record. Links generated before encoding was added carry raw
// names, which may contain a literal '%' that is not a valid escape; keep
// those usable by falling back to the raw string when decoding fails.
const decodeName = (raw: string): string => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const finiteOrThrow = (raw: string | undefined): number => {
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number: ${raw}`);
  return n;
};

/**
 * Parse URL search params into election config.
 * Returns null if the params are missing or malformed (unknown method,
 * non-numeric coordinates, empty names), so callers fall back to defaults
 * instead of crashing inside the election computation.
 */
export const parseConfig = (searchParams: URLSearchParams): ElectionConfig | null => {
  try {
    const candidatesStr = searchParams.get('candidates');
    const blocsStr = searchParams.get('blocs');
    const method = searchParams.get('method');
    const threshold = searchParams.get('threshold');

    if (!candidatesStr || !blocsStr || !method || !SPATIAL_METHODS.has(method)) {
      return null;
    }

    const candidates: SpatialCandidate[] = candidatesStr.split(';').map((str) => {
      const [rawName, x, y, color] = str.split(',');
      const name = decodeName(rawName ?? '');
      if (!name || !color) throw new Error('Malformed candidate');
      return {
        id: name.toLowerCase(),
        name,
        x: finiteOrThrow(x),
        y: finiteOrThrow(y),
        color,
      };
    });

    const blocs: VoterBloc[] = blocsStr.split(';').map((str, i) => {
      const [x, y, spread, count] = str.split(',');
      return {
        id: `bloc-${i}`,
        position: { x: finiteOrThrow(x), y: finiteOrThrow(y) },
        spread: finiteOrThrow(spread),
        count: Math.max(0, Math.floor(finiteOrThrow(count))),
      };
    });

    if (candidates.length < 2 || blocs.length === 0) return null;

    return {
      candidates,
      blocs,
      method: method as VotingMethod,
      approvalThreshold: threshold ? finiteOrThrow(threshold) : 0.3,
    };
  } catch {
    return null;
  }
};

/**
 * Update URL without triggering navigation.
 */
export const updateURL = (config: ElectionConfig): void => {
  const serialized = serializeConfig(config);
  const newURL = `${window.location.pathname}?${serialized}`;
  window.history.replaceState(null, '', newURL);
};
