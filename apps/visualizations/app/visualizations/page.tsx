'use client';

import Link from 'next/link';
import ElectionViz from '../components/ElectionViz';

export default function VisualizationsPage() {
  return (
    <main className="container mx-auto p-4">
      <nav className="mb-6 flex flex-wrap gap-4">
        <Link href="/" className="text-blue-600 hover:underline font-medium">
          Home
        </Link>
        <Link
          href="/visualizations"
          className="text-blue-600 hover:underline font-medium"
        >
          Election Explorer
        </Link>
        <Link
          href="/yee"
          className="text-blue-600 hover:underline font-medium"
        >
          Yee Diagrams
        </Link>
        <Link
          href="/comparison"
          className="text-blue-600 hover:underline font-medium"
        >
          Method Comparison
        </Link>
        <Link
          href="/detailed"
          className="text-blue-600 hover:underline font-medium"
        >
          Detailed View
        </Link>
        <Link
          href="/perturbation"
          className="text-blue-600 hover:underline font-medium"
        >
          Perturbation Maps
        </Link>
        <Link
          href="/districts"
          className="text-blue-600 hover:underline font-medium"
        >
          Voting Districts
        </Link>
      </nav>
      <ElectionViz />
    </main>
  );
}
