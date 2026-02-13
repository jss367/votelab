'use client';

import { Suspense } from 'react';
import DistortionMap from '../components/DistortionMap';

export default function DistortionPage() {
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Voting Method Distortion</h1>
      <Suspense fallback={<div>Loading visualization...</div>}>
        <DistortionMap />
      </Suspense>
    </main>
  );
}
