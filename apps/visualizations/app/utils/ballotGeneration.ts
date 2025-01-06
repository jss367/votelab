export type Ballot = {
  id: number;
  voterPosition: { x: number; y: number };
} & (
  | {
      type: 'plurality';
      choice: string;  // candidate ID
    }
  | {
      type: 'ranked';
      rankings: string[];  // array of candidate IDs in preference order
    }
  | {
      type: 'star';
      ratings: Record<string, number>;  // candidate ID -> rating
    }
);

// This will be used to convert spatial positions into actual ballots
export function generateBallotsFromPosition(
  x: number, 
  y: number, 
  candidates: Array<{ id: string; x: number; y: number; name: string }>,
  method: 'plurality' | 'ranked' | 'star'
): Ballot {
  const distances = candidates.map(candidate => ({
    id: candidate.id,
    name: candidate.name,
    distance: Math.sqrt(
      Math.pow(x - candidate.x, 2) + 
      Math.pow(y - candidate.y, 2)
    )
  }));

  switch (method) {
    case 'plurality':
      // Vote for closest candidate
      const closest = distances.reduce((a, b) => 
        a.distance < b.distance ? a : b
      );
      return {
        id: Math.random(),
        type: 'plurality',
        voterPosition: { x, y },
        choice: closest.id
      };

    case 'ranked':
      // Sort by distance
      const ranked = [...distances].sort((a, b) => a.distance - b.distance);
      return {
        id: Math.random(),
        type: 'ranked',
        voterPosition: { x, y },
        rankings: ranked.map(c => c.id)
      };

    case 'star':
      // Convert distances to ratings (closer = higher rating)
      const maxDistance = Math.sqrt(2); // Maximum possible distance in a 1x1 space
      const ratings: Record<string, number> = {};
      distances.forEach(({ id, distance }) => {
        // Convert distance to 0-5 rating (inverse relationship)
        ratings[id] = Math.round(5 * (1 - distance / maxDistance));
      });
      return {
        id: Math.random(),
        type: 'star',
        voterPosition: { x, y },
        ratings
      };
  }
} 
