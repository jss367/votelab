import { Point2D, Voter, VoterBloc, VoterPopulation, VoterPreset } from './types.js';

// Box-Muller transform for normal distribution
const randomNormal = (): number => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

// Clamp value to 0-1 range
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

let blocIdCounter = 0;

export const createVoterBloc = (
  position: Point2D,
  count: number,
  spread: number
): VoterBloc => ({
  id: `bloc-${++blocIdCounter}`,
  position,
  count,
  spread,
});

export const generateVotersFromBloc = (bloc: VoterBloc): Voter[] => {
  const voters: Voter[] = [];

  for (let i = 0; i < bloc.count; i++) {
    const x = clamp01(bloc.position.x + randomNormal() * bloc.spread);
    const y = clamp01(bloc.position.y + randomNormal() * bloc.spread);

    voters.push({
      position: { x, y },
      blocId: bloc.id,
    });
  }

  return voters;
};

export const generatePopulation = (blocs: VoterBloc[]): Voter[] => {
  return blocs.flatMap(bloc => generateVotersFromBloc(bloc));
};

export const createPresetPopulation = (
  preset: VoterPreset,
  totalCount: number
): VoterPopulation => {
  switch (preset) {
    case 'uniform': {
      // Create a grid of small blocs for even distribution
      const gridSize = 5;
      const countPerBloc = Math.floor(totalCount / (gridSize * gridSize));
      const blocs: VoterBloc[] = [];

      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const x = (i + 0.5) / gridSize;
          const y = (j + 0.5) / gridSize;
          blocs.push(createVoterBloc({ x, y }, countPerBloc, 0.08));
        }
      }
      return { blocs, totalCount: countPerBloc * gridSize * gridSize };
    }

    case 'centered': {
      const blocs = [createVoterBloc({ x: 0.5, y: 0.5 }, totalCount, 0.15)];
      return { blocs, totalCount };
    }

    case 'polarized': {
      const countPerBloc = Math.floor(totalCount / 2);
      const blocs = [
        createVoterBloc({ x: 0.25, y: 0.5 }, countPerBloc, 0.12),
        createVoterBloc({ x: 0.75, y: 0.5 }, countPerBloc, 0.12),
      ];
      return { blocs, totalCount: countPerBloc * 2 };
    }

    case 'triangle': {
      const countPerBloc = Math.floor(totalCount / 3);
      const blocs = [
        createVoterBloc({ x: 0.5, y: 0.2 }, countPerBloc, 0.1),
        createVoterBloc({ x: 0.2, y: 0.8 }, countPerBloc, 0.1),
        createVoterBloc({ x: 0.8, y: 0.8 }, countPerBloc, 0.1),
      ];
      return { blocs, totalCount: countPerBloc * 3 };
    }

    case 'custom':
    default:
      return { blocs: [], totalCount: 0 };
  }
};
