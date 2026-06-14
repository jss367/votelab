// apps/visualizations/app/components/DistrictingViz.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DISTRICT_COLORS,
  DistrictingResult,
  MapData,
  districtByCentroid,
  districtByCounty,
  generateMapData,
} from '../../lib/districting';

const CANVAS_SIZE = 380;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

interface DistrictMapProps {
  title: string;
  description: string;
  map: MapData;
  result: DistrictingResult;
  showCounties: boolean;
}

const DistrictMap: React.FC<DistrictMapProps> = ({
  title,
  description,
  map,
  result,
  showCounties,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const S = CANVAS_SIZE;
    const k = result.numDistricts;
    const colors = result.centroids.map((_, i) =>
      hexToRgb(DISTRICT_COLORS[i % DISTRICT_COLORS.length])
    );

    // 1. Shade the background from the *actual* district assignment: each
    //    pixel takes the district of its nearest voter. Tinting by nearest
    //    centroid would draw straight Voronoi boundaries that can cut through
    //    counties the county-integrity algorithm deliberately kept whole, so
    //    the fill would disagree with the dots and the split-count metric.
    //    Following the assignment keeps the regions consistent with both.
    const vx = new Float32Array(map.voters.length);
    const vy = new Float32Array(map.voters.length);
    for (let i = 0; i < map.voters.length; i++) {
      vx[i] = map.voters[i].x;
      vy[i] = map.voters[i].y;
    }
    const img = ctx.createImageData(S, S);
    const data = img.data;
    const STEP = 2;
    for (let py = 0; py < S; py += STEP) {
      for (let px = 0; px < S; px += STEP) {
        const ux = px / S;
        const uy = 1 - py / S;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < vx.length; i++) {
          const dx = ux - vx[i];
          const dy = uy - vy[i];
          const dd = dx * dx + dy * dy;
          if (dd < bestD) {
            bestD = dd;
            best = result.assignment[i];
          }
        }
        const col = colors[best];
        // blend toward white for a soft fill
        const r = Math.round(col.r * 0.18 + 255 * 0.82);
        const g = Math.round(col.g * 0.18 + 255 * 0.82);
        const b = Math.round(col.b * 0.18 + 255 * 0.82);
        for (let dy = 0; dy < STEP && py + dy < S; dy++) {
          for (let dx = 0; dx < STEP && px + dx < S; dx++) {
            const idx = ((py + dy) * S + (px + dx)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    // 2. County boundaries (dashed gray grid).
    if (showCounties) {
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (let c = 1; c < map.cols; c++) {
        const x = (c / map.cols) * S;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, S);
        ctx.stroke();
      }
      for (let r = 1; r < map.rows; r++) {
        const y = (r / map.rows) * S;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(S, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // 3. Voters, colored by their actual district assignment.
    for (let i = 0; i < map.voters.length; i++) {
      const v = map.voters[i];
      const col = DISTRICT_COLORS[result.assignment[i] % DISTRICT_COLORS.length];
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(v.x * S, (1 - v.y) * S, 1.6, 0, 2 * Math.PI);
      ctx.fill();
    }

    // 4. District centroids.
    for (let d = 0; d < k; d++) {
      const c = result.centroids[d];
      const cx = c.x * S;
      const cy = (1 - c.y) * S;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = DISTRICT_COLORS[d % DISTRICT_COLORS.length];
      ctx.stroke();
    }
  }, [map, result, showCounties]);

  const minPop = Math.min(...result.populations);
  const maxPop = Math.max(...result.populations);
  const imbalance = (((maxPop - minPop) / Math.max(1, maxPop)) * 100).toFixed(1);

  return (
    <div className="flex flex-col items-center">
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-gray-600 mb-3 text-center max-w-sm min-h-[2.5rem]">
        {description}
      </p>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="border border-gray-300 rounded"
      />
      <div className="mt-3 w-full max-w-sm text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-600">Avg. distance to centroid</span>
          <span className="font-mono font-medium">
            {result.avgDistance.toFixed(4)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Population imbalance</span>
          <span className="font-mono font-medium">
            {imbalance}% ({minPop}–{maxPop})
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Counties split</span>
          <span className="font-mono font-medium">
            {result.splitCounties} (
            {(result.countySplitFraction * 100).toFixed(0)}%)
          </span>
        </div>
      </div>
    </div>
  );
};

const DistrictingViz: React.FC = () => {
  const [numDistricts, setNumDistricts] = useState(4);
  const [seed, setSeed] = useState(1);

  // counties fixed at a 4x4 grid for clarity
  const map = useMemo(
    () =>
      generateMapData({
        numVoters: 2000,
        cols: 4,
        rows: 4,
        numClusters: 5,
        seed,
      }),
    [seed]
  );

  const centroidResult = useMemo(
    () => districtByCentroid(map, { numDistricts, seed }),
    [map, numDistricts, seed]
  );
  const countyResult = useMemo(
    () => districtByCounty(map, { numDistricts, seed }),
    [map, numDistricts, seed]
  );

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Voting District Maps</h1>
      <p className="text-gray-700 mb-6 max-w-3xl">
        Gerrymandering works by drawing district lines to favor one group. One
        antidote is to draw districts with a neutral, transparent rule instead.
        Both maps below split the same population into equal-population
        districts that are as compact as possible — the difference is whether
        they respect existing county lines. Each dot is a voter, colored by the
        district they end up in; the ringed markers are the district centroids,
        and the dashed grid shows county boundaries.
      </p>

      <div className="flex flex-wrap items-end gap-6 mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of districts: {numDistricts}
          </label>
          <input
            type="range"
            min={2}
            max={7}
            value={numDistricts}
            onChange={(e) => setNumDistricts(Number(e.target.value))}
            className="w-48"
          />
        </div>
        <button
          onClick={() => setSeed((s) => s + 1)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          New population
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <DistrictMap
          title="1. Compactness only"
          description="Minimizes the average distance from each voter to their district's centroid. Compact and equal-population, but it cuts across county lines freely."
          map={map}
          result={centroidResult}
          showCounties
        />
        <DistrictMap
          title="2. Compactness + county integrity"
          description="Same compactness goal, but keeps whole counties together wherever reasonable. Counties are only split when needed to balance population."
          map={map}
          result={countyResult}
          showCounties
        />
      </div>

      <div className="mt-10 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-700 max-w-3xl">
        <p className="font-semibold mb-1">Reading the results</p>
        <p>
          Algorithm&nbsp;1 will usually post a slightly lower average
          distance-to-centroid (it has more freedom), while Algorithm&nbsp;2
          splits far fewer counties. The trade-off between raw compactness and
          respecting communities of interest is exactly the kind of explicit,
          measurable rule that independent redistricting commissions use in
          place of partisan map-drawing.
        </p>
      </div>
    </div>
  );
};

export default DistrictingViz;
