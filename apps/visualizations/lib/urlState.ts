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
    .map((c) => `${c.name},${c.x.toFixed(3)},${c.y.toFixed(3)},${c.color}`)
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

/**
 * Parse URL search params into election config.
 * Returns null if parsing fails.
 */
export const parseConfig = (searchParams: URLSearchParams): ElectionConfig | null => {
  try {
    const candidatesStr = searchParams.get('candidates');
    const blocsStr = searchParams.get('blocs');
    const method = searchParams.get('method') as VotingMethod;
    const threshold = searchParams.get('threshold');

    if (!candidatesStr || !blocsStr || !method) {
      return null;
    }

    const candidates: SpatialCandidate[] = candidatesStr.split(';').map((str) => {
      const [name, x, y, color] = str.split(',');
      return {
        id: name.toLowerCase(),
        name,
        x: parseFloat(x),
        y: parseFloat(y),
        color,
      };
    });

    const blocs: VoterBloc[] = blocsStr.split(';').map((str, i) => {
      const [x, y, spread, count] = str.split(',');
      return {
        id: `bloc-${i}`,
        position: { x: parseFloat(x), y: parseFloat(y) },
        spread: parseFloat(spread),
        count: parseInt(count, 10),
      };
    });

    return {
      candidates,
      blocs,
      method,
      approvalThreshold: threshold ? parseFloat(threshold) : 0.3,
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
