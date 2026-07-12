'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DistrictMapMode,
  districtColor,
  districtFill,
  formatPartisanMargin,
} from '../../lib/districtMapPresentation';
import {
  DistrictingFeature,
  MultiPolygonCoordinates,
  PartisanDistrictScore,
  PolygonCoordinates,
  RealDistrictingResult,
  RealStateDistrictingDataset,
  VALIDITY_TOLERANCE,
} from '../../lib/realDistricting';
import { DISTRICTING_STATES } from '../../lib/realDistrictingStates';

const MAP_WIDTH = 960;
const MIN_MAP_HEIGHT = 440;
const MAX_MAP_HEIGHT = 660;

type PrecomputedPlan = RealDistrictingResult & {
  bridges?: number;
};

interface DistrictSummary {
  district: number;
  population: number;
  populationDeviation: number;
  counties: number;
  partisanScore?: PartisanDistrictScore;
}

interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

const MAP_MODES: Array<{
  id: DistrictMapMode;
  label: string;
  requiresElection?: boolean;
}> = [
  { id: 'districts', label: 'Districts' },
  { id: 'partisan', label: '2020 presidential lean', requiresElection: true },
  { id: 'population', label: 'Population balance' },
];

function formatPopulation(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function visitFeatureCoordinates(
  feature: DistrictingFeature,
  visit: (point: number[]) => void
) {
  const visitRing = (ring: number[][]) => ring.forEach(visit);
  if (feature.geometry.type === 'Polygon') {
    (feature.geometry.coordinates as PolygonCoordinates).forEach(visitRing);
  } else {
    (feature.geometry.coordinates as MultiPolygonCoordinates).forEach(
      (polygon) => polygon.forEach(visitRing)
    );
  }
}

function mapHeight(dataset: RealStateDistrictingDataset): number {
  const [minLon, minLat, maxLon, maxLat] = dataset.bbox;
  const lonSpan = Math.max(
    0.01,
    maxLon - minLon > 180 ? minLon + 360 - maxLon : maxLon - minLon
  );
  const latSpan = Math.max(0.01, maxLat - minLat);
  const projectedWidth =
    lonSpan * Math.cos(((minLat + maxLat) / 4) * (Math.PI / 180));
  const naturalHeight = MAP_WIDTH * (latSpan / Math.max(0.01, projectedWidth));
  return Math.round(
    Math.max(MIN_MAP_HEIGHT, Math.min(MAX_MAP_HEIGHT, naturalHeight))
  );
}

function createProjection(
  dataset: RealStateDistrictingDataset,
  width: number,
  height: number
) {
  const [minLon, minLat, maxLon, maxLat] = dataset.bbox;
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

  const lonScale = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const minX = projectedMinLon * lonScale;
  const maxX = projectedMaxLon * lonScale;
  const padding = 34;
  const scale = Math.min(
    (width - padding * 2) / Math.max(0.0001, maxX - minX),
    (height - padding * 2) / Math.max(0.0001, maxLat - minLat)
  );
  const offsetX = (width - (maxX - minX) * scale) / 2;
  const offsetY = (height - (maxLat - minLat) * scale) / 2;

  return ([lon, lat]: number[]) => {
    const projectedLon = crossesAntimeridian && lon < 0 ? lon + 360 : lon;
    return {
      x: offsetX + (projectedLon * lonScale - minX) * scale,
      y: height - (offsetY + (lat - minLat) * scale),
    };
  };
}

function addFeatureToPath(
  path: PathSink,
  feature: DistrictingFeature,
  project: (point: number[]) => { x: number; y: number }
) {
  const addRing = (ring: number[][]) => {
    ring.forEach((point, index) => {
      const projected = project(point);
      if (index === 0) path.moveTo(projected.x, projected.y);
      else path.lineTo(projected.x, projected.y);
    });
    path.closePath();
  };

  if (feature.geometry.type === 'Polygon') {
    (feature.geometry.coordinates as PolygonCoordinates).forEach(addRing);
  } else {
    (feature.geometry.coordinates as MultiPolygonCoordinates).forEach(
      (polygon) => polygon.forEach(addRing)
    );
  }
}

interface DistrictRaster {
  labels: Uint8Array;
  exterior: Uint8Array;
}

function buildDistrictRaster(
  paths: Path2D[],
  width: number,
  height: number
): DistrictRaster {
  const mask = document.createElement('canvas');
  mask.width = width;
  mask.height = height;
  const maskContext = mask.getContext('2d', { willReadFrequently: true });
  if (!maskContext) {
    return {
      labels: new Uint8Array(width * height),
      exterior: new Uint8Array(width * height),
    };
  }

  let districtLabels = new Uint8Array(width * height);
  paths.forEach((path, district) => {
    maskContext.clearRect(0, 0, width, height);
    maskContext.fillStyle = '#000000';
    maskContext.fill(path, 'evenodd');
    const districtPixels = maskContext.getImageData(0, 0, width, height).data;
    for (let pixel = 0; pixel < districtLabels.length; pixel++) {
      if (districtPixels[pixel * 4 + 3] > 0) {
        districtLabels[pixel] = district + 1;
      }
    }
  });

  // Adjacent tract polygons can leave sub-pixel raster gaps even when their
  // geographic edges meet. Close only gaps surrounded by the same district so
  // those seams do not become false district boundaries.
  for (let pass = 0; pass < 2; pass++) {
    const closed = districtLabels.slice();
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const pixel = y * width + x;
        if (districtLabels[pixel] !== 0) continue;
        const surrounding = new Set<number>();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const district = districtLabels[(y + dy) * width + x + dx];
            if (district !== 0) surrounding.add(district);
          }
        }
        if (surrounding.size === 1) {
          closed[pixel] = surrounding.values().next().value ?? 0;
        }
      }
    }
    districtLabels = closed;
  }
  const exterior = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (pixel: number) => {
    if (districtLabels[pixel] !== 0 || exterior[pixel] !== 0) return;
    exterior[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (pixel >= width) enqueue(pixel - width);
    if (pixel < width * (height - 1)) enqueue(pixel + width);
  }

  // Census tract geometry contains interior gaps for water and other excluded
  // areas. Extend the surrounding district colors into those enclosed gaps so
  // they do not read as hundreds of tiny districts or boundary marks.
  const fillQueue = new Int32Array(width * height);
  head = 0;
  tail = 0;
  for (let pixel = 0; pixel < districtLabels.length; pixel++) {
    if (districtLabels[pixel] !== 0) fillQueue[tail++] = pixel;
  }
  while (head < tail) {
    const pixel = fillQueue[head++];
    const district = districtLabels[pixel];
    const x = pixel % width;
    const neighbors = [
      x > 0 ? pixel - 1 : -1,
      x < width - 1 ? pixel + 1 : -1,
      pixel >= width ? pixel - width : -1,
      pixel < width * (height - 1) ? pixel + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (
        neighbor < 0 ||
        exterior[neighbor] !== 0 ||
        districtLabels[neighbor] !== 0
      ) {
        continue;
      }
      districtLabels[neighbor] = district;
      fillQueue[tail++] = neighbor;
    }
  }
  return { labels: districtLabels, exterior };
}

function drawDistrictBoundaries(
  ctx: CanvasRenderingContext2D,
  raster: DistrictRaster,
  width: number,
  height: number,
  activeDistrict: number | null
) {
  const boundaryImage = ctx.createImageData(width, height);
  const { labels: districtLabels, exterior } = raster;

  const districtAt = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return districtLabels[y * width + x];
  };
  const isExterior = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return true;
    return exterior[y * width + x] === 1;
  };
  const stamp = (x: number, y: number, selected: boolean) => {
    const radius = selected ? 2 : 1;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        const offset = (py * width + px) * 4;
        if (!selected && boundaryImage.data[offset + 3] === 255) continue;
        boundaryImage.data[offset] = selected ? 15 : 51;
        boundaryImage.data[offset + 1] = selected ? 23 : 65;
        boundaryImage.data[offset + 2] = selected ? 42 : 85;
        boundaryImage.data[offset + 3] = selected ? 255 : 190;
      }
    }
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const district = districtAt(x, y);
      if (district === 0) continue;
      const neighborPoints = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      const neighbors = neighborPoints.map(([nx, ny]) => districtAt(nx, ny));
      const isBoundary = neighborPoints.some(([nx, ny], index) => {
        const neighbor = neighbors[index];
        return (
          (neighbor !== 0 && neighbor !== district) ||
          (neighbor === 0 && isExterior(nx, ny))
        );
      });
      if (!isBoundary) continue;
      const selectedId = activeDistrict === null ? 0 : activeDistrict + 1;
      stamp(x, y, district === selectedId || neighbors.includes(selectedId));
    }
  }
  const boundaryCanvas = document.createElement('canvas');
  boundaryCanvas.width = width;
  boundaryCanvas.height = height;
  const boundaryContext = boundaryCanvas.getContext('2d');
  if (!boundaryContext) return;
  boundaryContext.putImageData(boundaryImage, 0, 0);
  ctx.drawImage(boundaryCanvas, 0, 0);
}

function drawDistrictFills(
  ctx: CanvasRenderingContext2D,
  raster: DistrictRaster,
  result: RealDistrictingResult,
  mode: DistrictMapMode,
  width: number,
  height: number
) {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext('2d', {
    willReadFrequently: true,
  });
  if (!colorContext) return;

  const palette = Array.from({ length: result.numDistricts }, (_, district) => {
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = districtFill(
      mode,
      district,
      result.metrics.populations[district] ?? 0,
      result.metrics.idealPopulation,
      result.metrics.partisanScores?.[district]
    );
    colorContext.fillRect(0, 0, 1, 1);
    return colorContext.getImageData(0, 0, 1, 1).data.slice(0, 3);
  });

  const fillImage = ctx.createImageData(width, height);
  for (let pixel = 0; pixel < raster.labels.length; pixel++) {
    const district = raster.labels[pixel] - 1;
    if (district < 0) continue;
    const color = palette[district];
    const offset = pixel * 4;
    fillImage.data[offset] = color[0];
    fillImage.data[offset + 1] = color[1];
    fillImage.data[offset + 2] = color[2];
    fillImage.data[offset + 3] = 255;
  }
  const fillCanvas = document.createElement('canvas');
  fillCanvas.width = width;
  fillCanvas.height = height;
  const fillContext = fillCanvas.getContext('2d');
  if (!fillContext) return;
  fillContext.putImageData(fillImage, 0, 0);
  ctx.drawImage(fillCanvas, 0, 0);
}

function MapLegend({ mode }: { mode: DistrictMapMode }) {
  if (mode === 'partisan') {
    return (
      <div className="flex items-center gap-3 text-xs text-slate-600">
        <span>More Republican</span>
        <div
          className="h-2.5 w-36 rounded-full border border-slate-200"
          style={{
            background:
              'linear-gradient(90deg, rgb(190,55,55), rgb(241,245,249), rgb(37,99,181))',
          }}
        />
        <span>More Democratic</span>
      </div>
    );
  }
  if (mode === 'population') {
    return (
      <div className="flex items-center gap-3 text-xs text-slate-600">
        <span>Below ideal</span>
        <div
          className="h-2.5 w-36 rounded-full border border-slate-200"
          style={{
            background:
              'linear-gradient(90deg, rgb(194,103,22), rgb(241,245,249), rgb(13,124,116))',
          }}
        />
        <span>Above ideal</span>
      </div>
    );
  }
  return (
    <p className="text-xs text-slate-600">
      Colors identify districts. Numbers match the district list.
    </p>
  );
}

interface DistrictMapProps {
  dataset: RealStateDistrictingDataset;
  result: RealDistrictingResult;
  mode: DistrictMapMode;
  activeDistrict: number | null;
  onHoverDistrict: (district: number | null) => void;
  onSelectDistrict: (district: number) => void;
}

const DistrictMap: React.FC<DistrictMapProps> = ({
  dataset,
  result,
  mode,
  activeDistrict,
  onHoverDistrict,
  onSelectDistrict,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathsRef = useRef<Path2D[]>([]);
  const geometryRef = useRef<{
    dataset: RealStateDistrictingDataset;
    result: RealDistrictingResult;
    height: number;
    paths: Path2D[];
    raster: DistrictRaster;
  } | null>(null);
  const height = useMemo(() => mapHeight(dataset), [dataset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const project = createProjection(dataset, MAP_WIDTH, height);
    const cached = geometryRef.current;
    let paths: Path2D[];
    let raster: DistrictRaster;
    if (
      cached?.dataset === dataset &&
      cached.result === result &&
      cached.height === height
    ) {
      paths = cached.paths;
      raster = cached.raster;
    } else {
      paths = Array.from({ length: result.numDistricts }, () => new Path2D());
      for (const feature of dataset.geometries.features) {
        const district = result.assignment[feature.properties.geoid];
        if (district === undefined || !paths[district]) continue;
        addFeatureToPath(paths[district], feature, project);
      }
      raster = buildDistrictRaster(paths, MAP_WIDTH, height);
      geometryRef.current = { dataset, result, height, paths, raster };
    }
    pathsRef.current = paths;

    ctx.clearRect(0, 0, MAP_WIDTH, height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, MAP_WIDTH, height);

    drawDistrictFills(ctx, raster, result, mode, MAP_WIDTH, height);

    drawDistrictBoundaries(ctx, raster, MAP_WIDTH, height, activeDistrict);

    const labelSize =
      result.numDistricts <= 20 ? 15 : result.numDistricts <= 40 ? 11 : 9;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${labelSize}px ui-sans-serif, system-ui, sans-serif`;
    result.centroids.forEach((centroid, district) => {
      const point = project([centroid.x, centroid.y]);
      const label = String(district + 1);
      ctx.lineWidth = Math.max(3, labelSize / 3);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.strokeText(label, point.x, point.y);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(label, point.x, point.y);
    });
  }, [activeDistrict, dataset, height, mode, result]);

  const districtAtPointer = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return null;
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * MAP_WIDTH;
      const y = ((event.clientY - rect.top) / rect.height) * height;
      for (
        let district = pathsRef.current.length - 1;
        district >= 0;
        district--
      ) {
        if (ctx.isPointInPath(pathsRef.current[district], x, y, 'evenodd')) {
          return district;
        }
      }
      return null;
    },
    [height]
  );

  return (
    <canvas
      ref={canvasRef}
      width={MAP_WIDTH}
      height={height}
      className="block h-auto w-full cursor-pointer bg-slate-50"
      style={{ filter: 'none' }}
      aria-label={`${dataset.stateName} generated congressional district map. Use the district list for keyboard-accessible details.`}
      onPointerMove={(event) => onHoverDistrict(districtAtPointer(event))}
      onPointerLeave={() => onHoverDistrict(null)}
      onClick={(event) => {
        const district = districtAtPointer(event);
        if (district !== null) onSelectDistrict(district);
      }}
    />
  );
};

function DistrictDetails({ summary }: { summary: DistrictSummary | null }) {
  if (!summary) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        Hover over the map or select a district below to inspect it.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: districtColor(summary.district) }}
        />
        <h3 className="font-semibold text-slate-900">
          District {summary.district + 1}
        </h3>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-slate-500">Population</dt>
        <dd className="text-right font-medium text-slate-900">
          {formatPopulation(summary.population)}
        </dd>
        <dt className="text-slate-500">From ideal</dt>
        <dd className="text-right font-medium text-slate-900">
          {`${summary.populationDeviation >= 0 ? '+' : ''}${(
            summary.populationDeviation * 100
          ).toFixed(1)}%`}
        </dd>
        <dt className="text-slate-500">Counties represented</dt>
        <dd className="text-right font-medium text-slate-900">
          {summary.counties}
        </dd>
        {summary.partisanScore && (
          <>
            <dt className="text-slate-500">Projected lean</dt>
            <dd className="text-right font-medium text-slate-900">
              {formatPartisanMargin(summary.partisanScore.margin)}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

interface MarginChartProps {
  summaries: DistrictSummary[];
  activeDistrict: number | null;
  onSelectDistrict: (district: number) => void;
}

function MarginChart({
  summaries,
  activeDistrict,
  onSelectDistrict,
}: MarginChartProps) {
  const sorted = useMemo(
    () =>
      [...summaries].sort(
        (a, b) =>
          (b.partisanScore?.margin ?? 0) - (a.partisanScore?.margin ?? 0)
      ),
    [summaries]
  );
  const hasScores = sorted.some((summary) => summary.partisanScore);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-semibold text-slate-900">District outlook</h3>
        {hasScores && (
          <span className="text-xs text-slate-500">
            Democratic → Republican
          </span>
        )}
      </div>
      <div className="max-h-80 space-y-1 overflow-y-auto pr-1 lg:max-h-96">
        {sorted.map((summary) => {
          const margin = summary.partisanScore?.margin;
          const width =
            margin === undefined
              ? 0
              : Math.min(50, (Math.abs(margin) / 0.3) * 50);
          return (
            <button
              key={summary.district}
              type="button"
              onClick={() => onSelectDistrict(summary.district)}
              aria-pressed={activeDistrict === summary.district}
              aria-label={`District ${summary.district + 1}${
                margin === undefined
                  ? ''
                  : `, projected ${formatPartisanMargin(margin)}`
              }`}
              className={`grid w-full grid-cols-[2.6rem_1fr_3.5rem] items-center gap-2 rounded px-2 py-1.5 text-xs transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                activeDistrict === summary.district
                  ? 'bg-slate-200'
                  : 'hover:bg-slate-100'
              }`}
            >
              <span className="text-left font-medium text-slate-700">
                D{summary.district + 1}
              </span>
              <span className="relative h-2 overflow-hidden rounded-full bg-slate-200">
                <span className="absolute left-1/2 top-0 h-full w-px bg-slate-500" />
                {margin !== undefined && (
                  <span
                    className={`absolute top-0 h-full ${
                      margin >= 0 ? 'bg-blue-600' : 'bg-red-600'
                    }`}
                    style={
                      margin >= 0
                        ? { right: '50%', width: `${width}%` }
                        : { left: '50%', width: `${width}%` }
                    }
                  />
                )}
              </span>
              <span className="text-right font-mono font-medium text-slate-700">
                {margin === undefined ? '—' : formatPartisanMargin(margin)}
              </span>
            </button>
          );
        })}
      </div>
      {hasScores && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Projection based on the two-party 2020 presidential vote, not a
          congressional election result.
        </p>
      )}
    </div>
  );
}

const DistrictingViz: React.FC = () => {
  const [stateId, setStateId] = useState(DISTRICTING_STATES[0].id);
  const [dataset, setDataset] = useState<RealStateDistrictingDataset | null>(
    null
  );
  const [result, setResult] = useState<PrecomputedPlan | null>(null);
  const [mode, setMode] = useState<DistrictMapMode>('districts');
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(null);
  const [hoveredDistrict, setHoveredDistrict] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedState =
    DISTRICTING_STATES.find((state) => state.id === stateId) ??
    DISTRICTING_STATES[0];

  useEffect(() => {
    let cancelled = false;
    setDataset(null);
    setResult(null);
    setSelectedDistrict(null);
    setHoveredDistrict(null);
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
        if (!plan.metrics.partisanScores) setMode('districts');
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedState]);

  const summaries = useMemo<DistrictSummary[]>(() => {
    if (!dataset || !result) return [];
    const counties = Array.from(
      { length: result.numDistricts },
      () => new Set<string>()
    );
    for (const unit of dataset.units) {
      const district = result.assignment[unit.geoid];
      if (district !== undefined) counties[district]?.add(unit.countyGeoid);
    }
    return Array.from({ length: result.numDistricts }, (_, district) => {
      const population = result.metrics.populations[district] ?? 0;
      return {
        district,
        population,
        populationDeviation:
          (population - result.metrics.idealPopulation) /
          Math.max(1, result.metrics.idealPopulation),
        counties: counties[district]?.size ?? 0,
        partisanScore: result.metrics.partisanScores?.[district],
      };
    });
  }, [dataset, result]);

  const activeDistrict = hoveredDistrict ?? selectedDistrict;
  const activeSummary =
    activeDistrict === null ? null : (summaries[activeDistrict] ?? null);

  const statePicker = (
    <div className="w-full sm:w-64">
      <label
        htmlFor="district-state"
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        State
      </label>
      <select
        id="district-state"
        value={stateId}
        onChange={(event) => setStateId(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
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
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-2 text-3xl font-bold">District Results Explorer</h1>
        <div className="mt-6">{statePicker}</div>
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      </div>
    );
  }

  if (!dataset || !result) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-2 text-3xl font-bold">District Results Explorer</h1>
        <div className="mt-6">{statePicker}</div>
        <p className="mt-6 text-slate-600">Loading {selectedState.name} map…</p>
      </div>
    );
  }

  const totalPopulation = dataset.units.reduce(
    (sum, unit) => sum + unit.population,
    0
  );
  const unitLabel =
    dataset.unitType === 'blockGroup' ? 'block groups' : `${dataset.unitType}s`;
  const projectedSeats = result.metrics.partisanScores
    ? `D ${result.metrics.seatsDem ?? 0}–R ${result.metrics.seatsGop ?? 0}`
    : 'Unavailable';
  const checksLabel = result.metrics.valid
    ? 'Passes site checks'
    : result.metrics.contiguousDistricts < result.numDistricts
      ? `Non-contiguous (${result.metrics.contiguousDistricts}/${result.numDistricts})`
      : `Above ${formatPercent(VALIDITY_TOLERANCE)} deviation threshold`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-blue-700">
            Generated congressional districts
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            District Results Explorer
          </h1>
          <p className="mt-3 max-w-3xl leading-relaxed text-slate-600">
            Explore one computer-generated district plan for each state. Switch
            views to see its boundaries, estimated presidential lean, and
            population balance.
          </p>
        </div>
        {statePicker}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-slate-500">Districts</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {result.numDistricts}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-slate-500">Projected presidential split</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {projectedSeats}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-slate-500">Maximum population deviation</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {formatPercent(result.metrics.maxDeviationFraction)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-slate-500">Counties split</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {result.metrics.splitCounties}
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Map view"
          >
            {MAP_MODES.map((entry) => {
              const disabled =
                entry.requiresElection && !result.metrics.partisanScores;
              return (
                <button
                  key={entry.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setMode(entry.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 ${
                    mode === entry.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
          <span
            className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
              result.metrics.valid
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {checksLabel}
          </span>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.75fr)_minmax(310px,0.75fr)]">
          <div className="min-w-0 border-b border-slate-200 lg:border-b-0 lg:border-r">
            <DistrictMap
              dataset={dataset}
              result={result}
              mode={mode}
              activeDistrict={activeDistrict}
              onHoverDistrict={setHoveredDistrict}
              onSelectDistrict={setSelectedDistrict}
            />
            <div className="border-t border-slate-200 px-4 py-3">
              <MapLegend mode={mode} />
            </div>
          </div>

          <aside className="space-y-5 p-4 sm:p-5">
            <DistrictDetails summary={activeSummary} />
            <MarginChart
              summaries={summaries}
              activeDistrict={activeDistrict}
              onSelectDistrict={setSelectedDistrict}
            />
          </aside>
        </div>
      </div>

      <div className="mt-6 grid gap-4 text-sm leading-relaxed text-slate-600 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-semibold text-slate-900">
            How this plan was chosen
          </h2>
          <p className="mt-2">
            This is the highest-ranked of 12 precomputed recombination plans.
            The site prioritizes contiguous districts, then population balance,
            compactness, and fewer county splits. “Passes site checks” means all
            districts are contiguous and the maximum population deviation is no
            more than {formatPercent(VALIDITY_TOLERANCE)}.
          </p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-semibold text-slate-900">About the estimates</h2>
          <p className="mt-2">
            The plan uses {dataset.stateName} 2020 Census {unitLabel} covering{' '}
            {formatPopulation(totalPopulation)} people. Presidential results are
            county totals distributed to map units by population share, so they
            are useful as rough comparison signals—not official district
            results.
            {result.bridges
              ? ` ${dataset.stateName} includes ${result.bridges} synthetic adjacency ${result.bridges === 1 ? 'connection' : 'connections'} for separated land areas.`
              : ''}
          </p>
        </section>
      </div>
    </div>
  );
};

export default DistrictingViz;
