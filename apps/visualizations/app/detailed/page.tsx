"use client"

import { Suspense } from 'react';
import DetailedVotingViz from '../components/DetailedVotingViz';

export default function DetailedPage() {
    return (
        <main className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6">Detailed Voting Analysis</h1>
            <Suspense fallback={<div>Loading visualization...</div>}>
                <DetailedVotingViz />
            </Suspense>
        </main>
    );
}
