'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DISTRICT_COLORS } from '../../lib/districting';
import {
  DistrictingFeature,
  MultiPolygonCoordinates,
  PolygonCoordinates,
  RealDistrictingResult,
  RealStateDistrictingDataset,
  VALIDITY_TOLERANCE,
} from '../../lib/realDistricting';
import { DISTRICTING_STATES } from '../../lib/realDistrictingStates';

const CANVAS_WIDTH = 420;
const CANVAS_HEIGHT = 500;

// Precomputed plan shape on disk: a RealDistrictingResult plus generator
// metadata (see scripts/build-district-maps.ts).
type PrecomputedPlan = RealDistrictingResult & {
  bridges?: number;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function tint(hex: string, amount = 0.18): string {
  const rgb = hexToRgb(hex);
  const r = Math.round(rgb.r * amount + 255 * (1 - amount));
  const g = Math.round(rgb.g * amount + 255 * (1 - amount));
  const b = Math.round(rgb.b * amount + 255 * (1 - amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function formatPopulation(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSignedPercent(value: number): string {
  const party = value >= 0 ? 'D' : 'R';
  return `${party}+${(Math.abs(value) * 100).toFixed(1)}`;
}

function visitFeatureCoordinates(
  feature: DistrictingFeature,
  visit: (point: number[]) => void
) {
  const visitRing = (ring: number[][]) => ring.forEach(visit);

  if (feature.geometry.type === 'Polygon') {
    const coordinates = feature.geometry.coordinates as PolygonCoordinates;
    coordinates.forEach(visitRing);
  } else {
    const coordinates = feature.geometry.coordinates as MultiPolygonCoordinates;
    coordinates.forEach((polygon) => {
      polygon.forEach(visitRing);
    });
  }
}

function createProjection(
  dataset: RealStateDistrictingDataset,
  width: number,
  height: number
) {
  const { bbox } = dataset;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const crossesAntimeridian = maxLon - minLon > 180;
  let projectedMinLon = Infinity;
  let projectedMaxLon = -Infinity;
  for (const feature of dataset.geometries.features) {
    visitFeatureCoordinates(feature, ([lon]) => {
      const projectedLon = crossesAntimeridian && lon < 0 ? lon + 360 : lon;
      projectedMinLon = Math.min(projectedMinLon, projectedLon);
      projectedMaxLon = Math.max(projectedMaxLon, projectedLon);
    });
  }
  if (!Number.isFinite(projectedMinLon) || !Number.isFinite(projectedMaxLon)) {
    projectedMinLon = crossesAntimeridian ? maxLon : minLon;
    projectedMaxLon = crossesAntimeridian ? minLon + 360 : maxLon;
  }
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonScale = Math.cos(midLat);
  const minX = projectedMinLon * lonScale;
  const maxX = projectedMaxLon * lonScale;
  const minY = minLat;
  const maxY = maxLat;
  const padding = 18;
  const scale = Math.min(
    (width - padding * 2) / Math.max(0.0001, maxX - minX),
    (height - padding * 2) / Math.max(0.0001, maxY - minY)
  );
  const offsetX = (width - (maxX - minX) * scale) / 2;
  const offsetY = (height - (maxY - minY) * scale) / 2;

  return ([lon, lat]: number[]) => {
    const projectedLon = crossesAntimeridian && lon < 0 ? lon + 360 : lon;
    return {
      x: offsetX + (projectedLon * lonScale - minX) * scale,
      y: height - (offsetY + (lat - minY) * scale),
    };
  };
}

function drawFeaturePath(
  ctx: CanvasRenderingContext2D,
  feature: DistrictingFeature,
  project: (point: number[]) => { x: number; y: number }
) {
  const drawRing = (ring: number[][]) => {
    ring.forEach((point, index) => {
      const projected = project(point);
      if (index === 0) {
        ctx.moveTo(projected.x, projected.y);
      } else {
        ctx.lineTo(projected.x, projected.y);
      }
    });
    ctx.closePath();
  };

  if (feature.geometry.type === 'Polygon') {
    const coordinates = feature.geometry.coordinates as PolygonCoordinates;
    coordinates.forEach(drawRing);
  } else {
    const coordinates = feature.geometry.coordinates as MultiPolygonCoordinates;
    coordinates.forEach((polygon) => {
      polygon.forEach(drawRing);
    });
  }
}

interface RealDistrictMapProps {
  dataset: RealStateDistrictingDataset;
  result: RealDistrictingResult;
}

const RealDistrictMap: React.FC<RealDistrictMapProps> = ({ dataset, result }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const unitByGeoid = useMemo(
    () => new Map(dataset.units.map((unit) => [unit.geoid, unit])),
    [dataset]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const project = createProjection(dataset, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    for (const feature of dataset.geometries.features) {
      const district = result.assignment[feature.properties.geoid] ?? 0;
      const color = DISTRICT_COLORS[district % DISTRICT_COLORS.length];
      ctx.beginPath();
      drawFeaturePath(ctx, feature, project);
      ctx.fillStyle = tint(color, 0.24);
      ctx.fill('evenodd');
    }

    ctx.lineWidth = 0.45;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    for (const feature of dataset.geometries.features) {
      ctx.beginPath();
      drawFeaturePath(ctx, feature, project);
      ctx.stroke();
    }

    ctx.lineWidth = 1.8;
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.34)';
    for (const feature of dataset.geometries.features) {
      const unit = unitByGeoid.get(feature.properties.geoid);
      if (!unit) continue;
      const hasOtherCountyNeighbor = unit.neighbors.some((neighbor) => {
        const neighborUnit = unitByGeoid.get(neighbor);
        return neighborUnit && neighborUnit.countyGeoid !== unit.countyGeoid;
      });
      if (!hasOtherCountyNeighbor) continue;
      ctx.beginPath();
      drawFeaturePath(ctx, feature, project);
      ctx.stroke();
    }

    for (let d = 0; d < result.numDistricts; d++) {
      const projected = project([result.centroids[d].x, result.centroids[d].y]);
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, 5.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = DISTRICT_COLORS[d % DISTRICT_COLORS.length];
      ctx.stroke();
    }
  }, [dataset, result, unitByGeoid]);

  const metrics = result.metrics;

  const validityLabel = metrics.valid
    ? 'Valid plan'
    : metrics.contiguousDistricts < result.numDistricts
      ? `Non-contiguous (${metrics.contiguousDistricts}/${result.numDistricts})`
      : `Over ${formatPercent(VALIDITY_TOLERANCE)} population deviation`;

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">
          {result.algorithm}
        </h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            metrics.valid
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {validityLabel}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="mt-3 w-full rounded border border-gray-200 bg-slate-50"
      />
      <div className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Population deviation</span>
          <span className="font-mono font-medium">
            {formatPercent(metrics.maxDeviationFraction)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Population range</span>
          <span className="font-mono font-medium">
            {formatPopulation(metrics.minPopulation)}-
            {formatPopulation(metrics.maxPopulation)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">County splits</span>
          <span className="font-mono font-medium">
            {metrics.splitCounties} ({formatPercent(metrics.countySplitFraction)})
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Contiguous districts</span>
          <span className="font-mono font-medium">
            {metrics.contiguousDistricts}/{result.numDistricts}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Avg. weighted distance</span>
          <span className="font-mono font-medium">
            {metrics.avgWeightedDistance.toFixed(4)}
          </span>
        </div>
        {metrics.partisanScores && (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Approx. 2020 seats</span>
              <span className="font-mono font-medium">
                D {metrics.seatsDem ?? 0}-R {metrics.seatsGop ?? 0}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Median district lean</span>
              <span className="font-mono font-medium">
                {formatSignedPercent(metrics.medianPartisanMargin ?? 0)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const DistrictingViz: React.FC = () => {
  const [stateId, setStateId] = useState(DISTRICTING_STATES[0].id);
  const [dataset, setDataset] = useState<RealStateDistrictingDataset | null>(
    null
  );
  const [result, setResult] = useState<PrecomputedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedState =
    DISTRICTING_STATES.find((state) => state.id === stateId) ??
    DISTRICTING_STATES[0];

  // Maps are precomputed offline (scripts/build-district-maps.ts) and committed
  // under public/data/districting/results. Selecting a state just loads the
  // tract geometry plus its prebuilt plan — no districting runs in the browser.
  useEffect(() => {
    let cancelled = false;
    setDataset(null);
    setResult(null);
    setError(null);
    const datasetUrl = selectedState.datasets.tracts;
    const resultUrl = `/data/districting/results/${selectedState.id}.json`;
    if (!datasetUrl) {
      setError('No tract data is available for this state.');
      return;
    }
    Promise.all([
      fetch(datasetUrl).then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load map data (${response.status})`);
        }
        return response.json() as Promise<RealStateDistrictingDataset>;
      }),
      fetch(resultUrl).then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load district plan (${response.status})`);
        }
        return response.json() as Promise<PrecomputedPlan>;
      }),
    ])
      .then(([data, plan]) => {
        if (cancelled) return;
        setDataset(data);
        setResult(plan);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedState]);

  const statePicker = (
    <div className="mb-6 max-w-xs">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        State
      </label>
      <select
        value={stateId}
        onChange={(event) => setStateId(event.target.value)}
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
      >
        {DISTRICTING_STATES.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </select>
    </div>
  );

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">Real District Maps</h1>
        {statePicker}
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      </div>
    );
  }

  if (!dataset || !result) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">Real District Maps</h1>
        {statePicker}
        <p className="text-gray-600">Loading {selectedState.name} map...</p>
      </div>
    );
  }

  const totalPopulation = dataset.units.reduce(
    (sum, unit) => sum + unit.population,
    0
  );
  const counties = new Set(dataset.units.map((unit) => unit.countyGeoid)).size;
  const unitLabel =
    dataset.unitType === 'blockGroup' ? 'block groups' : `${dataset.unitType}s`;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Real District Maps</h1>
      <p className="text-gray-700 mb-6 max-w-3xl">
        Each map is the best of several ReCom (recombination) plans built
        offline from {dataset.stateName} 2020 Census {unitLabel}, then selected
        for full district contiguity and the smallest population deviation. The
        website only displays the precomputed result — no districting runs in
        your browser.
      </p>

      {statePicker}

      <div className="mb-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-gray-500">Districts</div>
          <div className="font-semibold">{result.numDistricts}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-gray-500">Units</div>
          <div className="font-semibold">{dataset.units.length}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-gray-500">Counties</div>
          <div className="font-semibold">{counties}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-gray-500">Population</div>
          <div className="font-semibold">{formatPopulation(totalPopulation)}</div>
        </div>
      </div>

      <div className="max-w-md">
        <RealDistrictMap dataset={dataset} result={result} />
      </div>

      <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700">
        <p>
          Plans are generated with recursive spanning-tree bisection plus ReCom
          balancing steps, which keep every district contiguous by construction.
          {result.bridges
            ? ` Offshore/island units in ${dataset.stateName} were bridged to the mainland by nearest neighbor so the dual graph is connected.`
            : ''}
        </p>
        {result.metrics.partisanScores && (
          <p className="mt-2">
            Approximate seat counts allocate 2020 county presidential votes to
            map units by population share. Treat them as rough comparison
            signals, not official results.
          </p>
        )}
      </div>
    </div>
  );
};

export default DistrictingViz;
