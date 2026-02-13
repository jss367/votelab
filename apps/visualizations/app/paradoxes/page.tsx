'use client';

import { Suspense } from 'react';
import ParadoxSpotlight from '../components/ParadoxSpotlight';

export default function ParadoxesPage() {
  return (
    <main className="container mx-auto p-4">
      <Suspense fallback={<div>Loading visualization...</div>}>
        <ParadoxSpotlight />
      </Suspense>
    </main>
  );
}
