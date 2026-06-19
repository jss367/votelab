import { Suspense } from 'react';
import ElectionsClient from './ElectionsClient';

export const metadata = {
  title: 'Run Elections — VoteLab',
  description:
    'Create a poll, gather ballots, and see results across voting methods.',
};

export default function ElectionsPage() {
  // ElectionsClient uses useSearchParams(), which requires a Suspense boundary
  // under static export.
  return (
    <Suspense fallback={<p className="container mx-auto p-4">Loading…</p>}>
      <ElectionsClient />
    </Suspense>
  );
}
