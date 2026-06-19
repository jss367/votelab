import Link from 'next/link';

const visualizations = [
  { href: '/visualizations', label: 'Election Explorer' },
  { href: '/yee', label: 'Yee Diagrams' },
  { href: '/comparison', label: 'Method Comparison' },
  { href: '/detailed', label: 'Detailed View' },
  { href: '/perturbation', label: 'Perturbation Maps' },
  { href: '/districts', label: 'Voting Districts' },
];

export default function Home() {
  return (
    <main className="container mx-auto p-4 max-w-5xl">
      <header className="py-12 text-center">
        <h1 className="text-4xl font-bold mb-3">VoteLab</h1>
        <p className="text-lg text-gray-600">
          Tools and visualizations for understanding elections.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 pb-12">
        {/* Visualize */}
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Visualize</h2>
          <p className="text-sm text-gray-600 mb-4">
            Explore how different voting methods behave through interactive
            visualizations.
          </p>
          <ul className="space-y-1">
            {visualizations.map((v) => (
              <li key={v.href}>
                <Link
                  href={v.href}
                  className="text-blue-600 hover:underline"
                >
                  {v.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Run Elections */}
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Run Elections</h2>
          <p className="text-sm text-gray-600 mb-4">
            Create a poll, gather ballots, and see results across voting
            methods.
          </p>
          <Link href="/elections" className="text-blue-600 hover:underline">
            Open the election app
          </Link>
        </section>

      </div>
    </main>
  );
}
