import React from 'react';
import type { Candidate } from './types';

interface TieNoticeProps {
  /** Ids of the tied candidates; renders nothing unless there are two or more. */
  tied: string[];
  candidates: Candidate[];
  /** What they were tied for, e.g. "first place" or "last place". */
  tiedFor: string;
  /** How the tie was resolved. */
  resolution?: string;
}

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/**
 * Flags an exact tie that the tally broke by candidate order, so a result that
 * came down to a tie-break isn't presented as a clear win.
 */
const TieNotice: React.FC<TieNoticeProps> = ({
  tied,
  candidates,
  tiedFor,
  resolution = 'The tie was broken by the order the candidates are listed in.',
}) => {
  if (tied.length < 2) return null;
  const names = tied.map((id) => candidates.find((c) => c.id === id)?.name ?? id);

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
      <span className="font-semibold">Tie:</span> {listFormat.format(names)} tied for{' '}
      {tiedFor}. {resolution}
    </div>
  );
};

export default TieNotice;
