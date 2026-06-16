#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const COUNTIES_2020_LAYER =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/55/query';
const PL_2020_API = 'https://api.census.gov/data/2020/dec/pl';

const RESOLUTIONS = {
  tracts: {
    layer:
      'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/10/query',
    unitType: 'tract',
    label: 'tracts',
    apiFor: 'tract:*',
    apiIn: (state) => [`state:${state}`, 'county:*'],
    outFields:
      'GEOID,BASENAME,NAME,STATE,COUNTY,TRACT,POP100,AREALAND,AREAWATER,CENTLAT,CENTLON,INTPTLAT,INTPTLON',
    geoidFromRow: (row) => `${row.state}${row.county}${row.tract}`,
  },
  'block-groups': {
    layer:
      'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/11/query',
    unitType: 'blockGroup',
    label: 'block groups',
    apiFor: 'block group:*',
    apiIn: (state) => [`state:${state}`, 'county:*', 'tract:*'],
    outFields:
      'GEOID,BASENAME,NAME,STATE,COUNTY,TRACT,BLKGRP,POP100,AREALAND,AREAWATER,CENTLAT,CENTLON,INTPTLAT,INTPTLON',
    geoidFromRow: (row) =>
      `${row.state}${row.county}${row.tract}${row['block group']}`,
  },
};

const PL_VARIABLES = [
  'NAME',
  'P1_001N',
  'P3_001N',
  'P4_002N',
  'P4_005N',
  'P1_004N',
  'P1_006N',
];

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i], process.argv[i + 1]);
}

const stateFips = args.get('--state') ?? '10';
const stateName = args.get('--name') ?? 'Delaware';
const slug = args.get('--slug') ?? stateName.toLowerCase().replace(/\s+/g, '-');
const resolution = args.get('--resolution') ?? 'tracts';
const resolutionConfig = RESOLUTIONS[resolution];
if (!resolutionConfig) {
  throw new Error(
    `Unsupported --resolution ${resolution}. Expected one of: ${Object.keys(
      RESOLUTIONS
    ).join(', ')}`
  );
}
const defaultDistricts = Number(args.get('--districts') ?? '3');
const tolerance = Number(args.get('--tolerance') ?? '0.0006');
const fetchTimeoutMs = Number(args.get('--timeout-ms') ?? '15000');
const pageSize = Number(args.get('--page-size') ?? '500');
const skipPl = args.has('--skip-pl');
const censusApiKey = args.get('--census-key') ?? process.env.CENSUS_API_KEY;
const output =
  args.get('--output') ??
  `apps/visualizations/public/data/districting/${slug}-${resolution}.json`;

function queryUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchJson(url, timeoutMs = fetchTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    const body = await response.text();
    throw new Error(`Expected JSON for ${url}, received: ${body.slice(0, 120)}`);
  }
  return response.json();
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function messageWithoutKey(error) {
  const key = censusApiKey;
  return key ? error.message.replaceAll(key, '[redacted]') : error.message;
}

function roundCoord(value) {
  return Number(value.toFixed(5));
}

function pointLineDistance(point, start, end) {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(x - x1, y - y1);
  }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py);
}

function douglasPeucker(points, epsilon) {
  if (points.length <= 3) return points;

  let maxDistance = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const distance = pointLineDistance(points[i], points[0], points[end]);
    if (distance > maxDistance) {
      index = i;
      maxDistance = distance;
    }
  }

  if (maxDistance <= epsilon) {
    return [points[0], points[end]];
  }

  const left = douglasPeucker(points.slice(0, index + 1), epsilon);
  const right = douglasPeucker(points.slice(index), epsilon);
  return left.slice(0, -1).concat(right);
}

function simplifyRing(ring, epsilon) {
  if (ring.length <= 4) {
    return ring.map(([x, y]) => [roundCoord(x), roundCoord(y)]);
  }
  const closed =
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const openRing = closed ? ring.slice(0, -1) : ring;
  const simplified = douglasPeucker(openRing, epsilon);
  const rounded = simplified.map(([x, y]) => [roundCoord(x), roundCoord(y)]);
  const first = rounded[0];
  const last = rounded[rounded.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    rounded.push([...first]);
  }
  return rounded.length >= 4 ? rounded : ring.map(([x, y]) => [roundCoord(x), roundCoord(y)]);
}

function simplifyGeometry(geometry, epsilon) {
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring) => simplifyRing(ring, epsilon)),
    };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => simplifyRing(ring, epsilon))
      ),
    };
  }
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function forEachRing(geometry, callback) {
  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach(callback);
    return;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      polygon.forEach(callback);
    }
  }
}

function collectBbox(features) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const feature of features) {
    forEachRing(feature.geometry, (ring) => {
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    });
  }
  return [minX, minY, maxX, maxY];
}

function pointKey(point) {
  return `${point[0].toFixed(5)},${point[1].toFixed(5)}`;
}

function buildAdjacency(features) {
  const pointOwners = new Map();
  features.forEach((feature, index) => {
    const seen = new Set();
    forEachRing(feature.geometry, (ring) => {
      for (const point of ring) {
        seen.add(pointKey(point));
      }
    });
    for (const key of seen) {
      if (!pointOwners.has(key)) pointOwners.set(key, []);
      pointOwners.get(key).push(index);
    }
  });

  const sharedCounts = new Map();
  for (const owners of pointOwners.values()) {
    if (owners.length < 2) continue;
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        const a = Math.min(owners[i], owners[j]);
        const b = Math.max(owners[i], owners[j]);
        const key = `${a}:${b}`;
        sharedCounts.set(key, (sharedCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const neighbors = Array.from({ length: features.length }, () => new Set());
  for (const [key, count] of sharedCounts.entries()) {
    if (count < 2) continue;
    const [a, b] = key.split(':').map(Number);
    neighbors[a].add(features[b].properties.GEOID);
    neighbors[b].add(features[a].properties.GEOID);
  }
  return neighbors.map((set) => Array.from(set).sort());
}

async function fetchFeatureCollection(base, params) {
  const countUrl = queryUrl(base, {
    ...params,
    returnGeometry: 'false',
    returnCountOnly: 'true',
  });
  const countResponse = await fetchJson(countUrl);
  const count = Number(countResponse.count ?? 0);
  const features = [];

  for (let offset = 0; offset < count; offset += pageSize) {
    const pageUrl = queryUrl(base, {
      ...params,
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      orderByFields: 'GEOID',
    });
    const page = await fetchJson(pageUrl);
    features.push(...(page.features ?? []));
    console.log(
      `Fetched ${Math.min(offset + pageSize, count)}/${count} ${resolutionConfig.label}`
    );
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

async function fetchPlDemographics(countyGeoids) {
  if (skipPl) {
    console.log('Skipping P.L. 94-171 join by request.');
    return new Map();
  }
  if (!censusApiKey) {
    console.log('Skipping P.L. 94-171 join; set CENSUS_API_KEY to enable it.');
    return new Map();
  }

  const joined = new Map();
  console.log(`Fetching P.L. 94-171 fields for ${resolutionConfig.label}`);
  for (const countyGeoid of countyGeoids) {
    const county = countyGeoid.slice(2);
    const url = queryUrl(PL_2020_API, {
      get: PL_VARIABLES.join(','),
      for: resolutionConfig.apiFor,
      key: censusApiKey,
    });
    const plUrl = new URL(url);
    const queryParts =
      resolution === 'tracts'
        ? [`state:${stateFips} county:${county}`]
        : [`state:${stateFips} county:${county}`, 'tract:*'];
    for (const queryPart of queryParts) {
      plUrl.searchParams.append('in', queryPart);
    }
    let rows;
    try {
      rows = await fetchJson(plUrl.toString());
    } catch (error) {
      console.warn(
        `Skipping P.L. fields for county ${countyGeoid}: ${messageWithoutKey(error)}`
      );
      continue;
    }
    const [headers, ...records] = rows;
    for (const record of records) {
      const row = Object.fromEntries(
        headers.map((header, i) => [header, record[i]])
      );
      joined.set(resolutionConfig.geoidFromRow(row), {
        population: numeric(row.P1_001N),
        votingAgePopulation: numeric(row.P3_001N),
        demographics: {
          hispanicOrLatino: numeric(row.P4_002N),
          nonHispanicWhite: numeric(row.P4_005N),
          blackAlone: numeric(row.P1_004N),
          asianAlone: numeric(row.P1_006N),
        },
      });
    }
  }
  return joined;
}

const geographyParams = {
  where: `STATE='${stateFips}'`,
  outFields: resolutionConfig.outFields,
  returnGeometry: 'true',
  outSR: '4326',
  f: 'geojson',
};

const countyUrl = queryUrl(COUNTIES_2020_LAYER, {
  where: `STATE='${stateFips}'`,
  outFields: 'GEOID,NAME,STATE,COUNTY,POP100',
  returnGeometry: 'false',
  f: 'geojson',
});

console.log(`Fetching counties for ${stateName} (${stateFips})`);
const counties = await fetchJson(countyUrl);

const countyNames = new Map(
  counties.features.map((feature) => [
    feature.properties.GEOID,
    feature.properties.NAME,
  ])
);

console.log(
  `Fetching 2020 Census ${resolutionConfig.label} for ${stateName} (${stateFips})`
);
const [geographies, plDemographics] = await Promise.all([
  fetchFeatureCollection(resolutionConfig.layer, geographyParams),
  fetchPlDemographics(Array.from(countyNames.keys()).sort()),
]);
const neighbors = buildAdjacency(geographies.features);
const bbox = collectBbox(geographies.features).map(roundCoord);

const features = geographies.features.map((feature) => ({
  type: 'Feature',
  geometry: simplifyGeometry(feature.geometry, tolerance),
  properties: {
    geoid: feature.properties.GEOID,
  },
}));

const units = geographies.features.map((feature, index) => {
  const countyGeoid = `${feature.properties.STATE}${feature.properties.COUNTY}`;
  const pl = plDemographics.get(feature.properties.GEOID);
  return {
    geoid: feature.properties.GEOID,
    name: feature.properties.NAME,
    type: resolutionConfig.unitType,
    countyGeoid,
    countyName: countyNames.get(countyGeoid) ?? `County ${feature.properties.COUNTY}`,
    population: pl?.population ?? numeric(feature.properties.POP100),
    votingAgePopulation: pl?.votingAgePopulation,
    demographics: pl?.demographics,
    areaLand: numeric(feature.properties.AREALAND),
    centroid: {
      x: numeric(feature.properties.INTPTLON || feature.properties.CENTLON),
      y: numeric(feature.properties.INTPTLAT || feature.properties.CENTLAT),
    },
    neighbors: neighbors[index],
  };
});

const dataset = {
  stateFips,
  stateName,
  unitType: resolutionConfig.unitType,
  defaultDistricts,
  bbox,
  source: {
    geometry:
      `U.S. Census Bureau TIGERweb, Tracts_Blocks MapServer 2020 Census ${resolutionConfig.label}`,
    population:
      plDemographics.size > 0
        ? '2020 Census P.L. 94-171 API P1_001N joined by GEOID'
        : `POP100 field from the 2020 Census TIGERweb ${resolutionConfig.label} layer`,
    demographics:
      plDemographics.size > 0
        ? '2020 Census P.L. 94-171 API P3/P4/P1 fields joined by GEOID'
        : null,
    fetchedAt: new Date().toISOString(),
  },
  units,
  geometries: {
    type: 'FeatureCollection',
    features,
  },
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(dataset)}\n`, 'utf8');
console.log(`Wrote ${units.length} ${resolutionConfig.label} to ${output}`);
