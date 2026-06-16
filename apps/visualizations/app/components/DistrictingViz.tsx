'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DISTRICT_COLORS } from '../../lib/districting';
import {
  CountyElectionDataset,
  DistrictingFeature,
  MultiPolygonCoordinates,
  PolygonCoordinates,
  RealDistrictingResult,
  RealStateDistrictingDataset,
  districtRealByCountyIntegrity,
  districtRealByRegionGrow,
  districtRealByWeightedCentroid,
} from '../../lib/realDistricting';
import {
  DISTRICTING_RESOLUTIONS,
  DISTRICTING_STATES,
  DistrictingResolution,
} from '../../lib/realDistrictingStates';

const CANVAS_WIDTH = 420;
const CANVAS_HEIGHT = 500;
const ELECTION_URL = '/data/elections/county-president-2020.json';

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

function createProjection(
  bbox: [number, number, number, number],
  width: number,
  height: number
) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonScale = Math.cos(midLat);
  const minX = minLon * lonScale;
  const maxX = maxLon * lonScale;
  const minY = minLat;
  const maxY = maxLat;
  const padding = 18;
  const scale = Math.min(
    (width - padding * 2) / Math.max(0.0001, maxX - minX),
    (height - padding * 2) / Math.max(0.0001, maxY - minY)
  );
  const offsetX = (width - (maxX - minX) * scale) / 2;
  const offsetY = (height - (maxY - minY) * scale) / 2;

  return ([lon, lat]: number[]) => ({
    x: offsetX + (lon * lonScale - minX) * scale,
    y: height - (offsetY + (lat - minY) * scale),
  });
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

    const project = createProjection(dataset.bbox, CANVAS_WIDTH, CANVAS_HEIGHT);
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

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-4">
      <h3 className="text-base font-semibold text-gray-900">{result.algorithm}</h3>
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
  const [resolution, setResolution] =
    useState<DistrictingResolution>('block-groups');
  const [dataset, setDataset] = useState<RealStateDistrictingDataset | null>(null);
  const [election, setElection] = useState<CountyElectionDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numDistricts, setNumDistricts] = useState(3);
  const [seed, setSeed] = useState(1);

  const selectedState =
    DISTRICTING_STATES.find((state) => state.id === stateId) ??
    DISTRICTING_STATES[0];
  const availableResolutions = DISTRICTING_RESOLUTIONS.filter(
    (entry) => selectedState.datasets[entry.id]
  );
  const selectedResolution = selectedState.datasets[resolution]
    ? resolution
    : availableResolutions[0].id;

  useEffect(() => {
    let cancelled = false;
    fetch(ELECTION_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load election data (${response.status})`);
        }
        return response.json();
      })
      .then((data: CountyElectionDataset) => {
        if (!cancelled) setElection(data);
      })
      .catch(() => {
        if (!cancelled) setElection(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const selectedUrl = selectedState.datasets[selectedResolution];
    if (!selectedUrl) return;
    setDataset(null);
    setError(null);
    fetch(selectedUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load district data (${response.status})`);
        }
        return response.json();
      })
      .then((data: RealStateDistrictingDataset) => {
        if (cancelled) return;
        setDataset(data);
        setNumDistricts(data.defaultDistricts);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedResolution, selectedState]);

  const results = useMemo(() => {
    if (!dataset) return [];
    const options = { numDistricts, seed, election: election ?? undefined };
    return [
      districtRealByWeightedCentroid(dataset, options),
      districtRealByCountyIntegrity(dataset, options),
      districtRealByRegionGrow(dataset, options),
    ];
  }, [dataset, election, numDistricts, seed]);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">Real District Maps</h1>
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">Real District Maps</h1>
        <p className="text-gray-600">Loading Census tract data...</p>
      </div>
    );
  }

  const totalPopulation = dataset.units.reduce(
    (sum, unit) => sum + unit.population,
    0
  );
  const votingAgePopulation = dataset.units.some(
    (unit) => typeof unit.votingAgePopulation === 'number'
  )
    ? dataset.units.reduce(
        (sum, unit) => sum + (unit.votingAgePopulation ?? 0),
        0
      )
    : null;
  const hasDemographics = votingAgePopulation !== null;
  const counties = new Set(dataset.units.map((unit) => unit.countyGeoid)).size;
  const unitLabel =
    dataset.unitType === 'blockGroup' ? 'block groups' : `${dataset.unitType}s`;
  const maxDistricts = Math.max(6, dataset.defaultDistricts);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Real District Maps</h1>
      <p className="text-gray-700 mb-6 max-w-4xl">
        This real-data version uses {dataset.stateName} 2020 Census {unitLabel}
        from TIGERweb. {hasDemographics
          ? 'This dataset also includes P.L. 94-171 voting-age population and demographic fields.'
          : 'This dataset currently uses TIGERweb population fields; it can be regenerated with P.L. 94-171 demographics when the Census API is available.'}
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            State
          </label>
          <select
            value={stateId}
            onChange={(event) => {
              const nextStateId = event.target.value;
              const nextState =
                DISTRICTING_STATES.find((state) => state.id === nextStateId) ??
                DISTRICTING_STATES[0];
              setStateId(nextState.id);
              if (!nextState.datasets[resolution]) {
                const nextResolution = DISTRICTING_RESOLUTIONS.find(
                  (entry) => nextState.datasets[entry.id]
                );
                if (nextResolution) setResolution(nextResolution.id);
              }
            }}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {DISTRICTING_STATES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Geography
          </label>
          <select
            value={selectedResolution}
            onChange={(event) =>
              setResolution(event.target.value as DistrictingResolution)
            }
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {availableResolutions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Districts: {numDistricts}
          </label>
          <input
            type="range"
            min={1}
            max={maxDistricts}
            value={numDistricts}
            onChange={(event) => setNumDistricts(Number(event.target.value))}
            className="w-full"
          />
        </div>
        <button
          onClick={() => setSeed((value) => value + 1)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Reseed
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-gray-500">Geography</div>
          <div className="font-semibold capitalize">{unitLabel}</div>
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
        {votingAgePopulation !== null && (
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="text-gray-500">Voting-age pop.</div>
            <div className="font-semibold">
              {formatPopulation(votingAgePopulation)}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {results.map((result) => (
          <RealDistrictMap
            key={result.algorithm}
            dataset={dataset}
            result={result}
          />
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700">
        <p>
          Block groups improve fidelity, but this is still a prototype. The next
          step is replacing the county-level election approximation with
          precinct or VTD returns; block-level plans will need more aggressive
          preprocessing before they are practical in the browser.
        </p>
        {election && (
          <p className="mt-2">
            Election scoring uses {election.title} and allocates county votes to
            map units by population share. Treat the seat counts and margins as
            approximate comparison signals, not official district results.
          </p>
        )}
      </div>
    </div>
  );
};

export default DistrictingViz;
