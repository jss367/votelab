// apps/visualizations/lib/urlState.ts
import { SpatialCandidate, VoterBloc, VotingMethod } from '@votelab/shared-utils';

export interface ElectionConfig {
  candidates: SpatialCandidate[];
  blocs: VoterBloc[];
  method: VotingMethod;
  approvalThreshold: number;
}

const URL_FORMAT_VERSION = 2;

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
  // Format version. v2 percent-encodes candidate names; links without a
  // version predate encoding and carry raw names.
  params.set('v', String(URL_FORMAT_VERSION));

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

// v2 links percent-encode candidate names so ',' and ';' in a name don't
// corrupt the record. Unversioned (legacy) links carry raw names and must not
// be decoded: a legacy name like "Alice%20Bob" is literal. The version marker
// disambiguates; the catch only guards hand-edited v2 links with bad escapes.
const decodeName = (raw: string, encoded: boolean): string => {
  if (!encoded) return raw;
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
    const encodedNames =
      Number(searchParams.get('v') ?? 1) >= URL_FORMAT_VERSION;

    if (!candidatesStr || !blocsStr || !method || !SPATIAL_METHODS.has(method)) {
      return null;
    }

    const candidates: SpatialCandidate[] = candidatesStr.split(';').map((str) => {
      const [rawName, x, y, color] = str.split(',');
      const name = decodeName(rawName ?? '', encodedNames);
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
