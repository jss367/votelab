"use client"

import { Suspense } from 'react';
import VotingMethodComparisonGrid from '../components/VotingMethodComparisonGrid';

export default function ComparisonPage() {
    return (
        <main className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6">Voting Method Comparison</h1>
            <Suspense fallback={<div>Loading visualization...</div>}>
                <VotingMethodComparisonGrid />
            </Suspense>
        </main>
    );
}
