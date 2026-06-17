'use client';

import dynamic from 'next/dynamic';

// The election app is a fully client-side SPA (reads window/location, subscribes
// to Firestore). Load it client-only so it is excluded from static prerendering.
const App = dynamic(() => import('../../election/App'), {
  ssr: false,
  loading: () => <p className="container mx-auto p-4">Loading…</p>,
});

export default function ElectionsClient() {
  return <App />;
}
