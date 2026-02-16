'use client';

import Link from 'next/link';
import ElectionViz from './components/ElectionViz';

export default function Home() {
  return (
    <main className="container mx-auto p-4">
      <nav className="mb-6 flex gap-4">
        <Link href="/" className="text-blue-600 hover:underline font-medium">
          Home
        </Link>
        <Link href="/yee" className="text-blue-600 hover:underline font-medium">
          Yee Diagrams
        </Link>
        <Link href="/comparison" className="text-blue-600 hover:underline font-medium">
          Method Comparison
        </Link>
        <Link href="/detailed" className="text-blue-600 hover:underline font-medium">
          Detailed View
        </Link>
      </nav>
      <ElectionViz />
    </main>
  );
}
