'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

// The election app is a fully client-side SPA (reads window/location, subscribes
// to Firestore). Load it client-only so it is excluded from static prerendering.
const App = dynamic(() => import('../../election/App'), {
  ssr: false,
  loading: () => <p className="container mx-auto p-4">Loading…</p>,
});

export default function ElectionsClient() {
  // The SPA reads ?id=/?view= once on mount. In the hub, the persistent nav can
  // change the query string (e.g. the "Run Elections" link back to /elections)
  // without remounting the SPA, leaving a stale election on screen. Keying on the
  // search string re-mounts the app whenever the query changes so it re-reads.
  const searchParams = useSearchParams();
  return <App key={searchParams.toString()} />;
}
