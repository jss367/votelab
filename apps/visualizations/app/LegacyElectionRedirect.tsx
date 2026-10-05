'use client';

import { useEffect } from 'react';

// Election links shared before the app moved under /elections point at the
// site root (e.g. /?id=2026BookClub&view=results). Forward them so old links
// keep working.
export default function LegacyElectionRedirect() {
  useEffect(() => {
    const { search, hash } = window.location;
    if (new URLSearchParams(search).has('id')) {
      window.location.replace(`/elections${search}${hash}`);
    }
  }, []);

  return null;
}
