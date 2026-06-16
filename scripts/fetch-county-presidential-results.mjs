#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2020_US_County_Level_Presidential_Results.csv';

const OUTPUT =
  'apps/visualizations/public/data/elections/county-president-2020.json';

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status}`);
}

const csv = await response.text();
const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
const headers = parseCsvLine(headerLine);
const counties = {};

for (const line of lines) {
  const values = parseCsvLine(line);
  const row = Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  const countyFips = row.county_fips?.padStart(5, '0');
  if (!countyFips) continue;
  counties[countyFips] = {
    countyName: row.county_name,
    votesDem: numeric(row.votes_dem),
    votesGop: numeric(row.votes_gop),
    totalVotes: numeric(row.total_votes),
  };
}

const fixture = {
  id: 'county-president-2020',
  title: '2020 presidential county results',
  source:
    'Tony McGovern, US_County_Level_Election_Results_08-24, 2020_US_County_Level_Presidential_Results.csv',
  sourceUrl: SOURCE_URL,
  note:
    'Used for approximate district scoring by allocating county votes to Census units by population share.',
  counties,
};

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, `${JSON.stringify(fixture)}\n`, 'utf8');
console.log(`Wrote ${Object.keys(counties).length} county results to ${OUTPUT}`);
