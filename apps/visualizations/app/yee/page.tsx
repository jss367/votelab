import { YeeDiagramViz } from '../components/YeeDiagramViz';

export default function YeeDiagramPage() {
  return (
    <main className="min-h-screen">
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-2">Yee Diagram Visualization</h1>
        <p className="text-gray-600 mb-6">
          Explore how different voting methods produce different winners based on
          candidate positions and voter distributions.
        </p>
        <YeeDiagramViz />
      </div>
    </main>
  );
}
