#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const STATES = [
  ['01', 'Alabama', 'alabama', 7],
  ['02', 'Alaska', 'alaska', 1],
  ['04', 'Arizona', 'arizona', 9],
  ['05', 'Arkansas', 'arkansas', 4],
  ['06', 'California', 'california', 52],
  ['08', 'Colorado', 'colorado', 8],
  ['09', 'Connecticut', 'connecticut', 5],
  ['10', 'Delaware', 'delaware', 1],
  ['12', 'Florida', 'florida', 28],
  ['13', 'Georgia', 'georgia', 14],
  ['15', 'Hawaii', 'hawaii', 2],
  ['16', 'Idaho', 'idaho', 2],
  ['17', 'Illinois', 'illinois', 17],
  ['18', 'Indiana', 'indiana', 9],
  ['19', 'Iowa', 'iowa', 4],
  ['20', 'Kansas', 'kansas', 4],
  ['21', 'Kentucky', 'kentucky', 6],
  ['22', 'Louisiana', 'louisiana', 6],
  ['23', 'Maine', 'maine', 2],
  ['24', 'Maryland', 'maryland', 8],
  ['25', 'Massachusetts', 'massachusetts', 9],
  ['26', 'Michigan', 'michigan', 13],
  ['27', 'Minnesota', 'minnesota', 8],
  ['28', 'Mississippi', 'mississippi', 4],
  ['29', 'Missouri', 'missouri', 8],
  ['30', 'Montana', 'montana', 2],
  ['31', 'Nebraska', 'nebraska', 3],
  ['32', 'Nevada', 'nevada', 4],
  ['33', 'New Hampshire', 'new-hampshire', 2],
  ['34', 'New Jersey', 'new-jersey', 12],
  ['35', 'New Mexico', 'new-mexico', 3],
  ['36', 'New York', 'new-york', 26],
  ['37', 'North Carolina', 'north-carolina', 14],
  ['38', 'North Dakota', 'north-dakota', 1],
  ['39', 'Ohio', 'ohio', 15],
  ['40', 'Oklahoma', 'oklahoma', 5],
  ['41', 'Oregon', 'oregon', 6],
  ['42', 'Pennsylvania', 'pennsylvania', 17],
  ['44', 'Rhode Island', 'rhode-island', 2],
  ['45', 'South Carolina', 'south-carolina', 7],
  ['46', 'South Dakota', 'south-dakota', 1],
  ['47', 'Tennessee', 'tennessee', 9],
  ['48', 'Texas', 'texas', 38],
  ['49', 'Utah', 'utah', 4],
  ['50', 'Vermont', 'vermont', 1],
  ['51', 'Virginia', 'virginia', 11],
  ['53', 'Washington', 'washington', 10],
  ['54', 'West Virginia', 'west-virginia', 2],
  ['55', 'Wisconsin', 'wisconsin', 8],
  ['56', 'Wyoming', 'wyoming', 1],
];

const force = process.argv.includes('--force');

for (const [fips, name, slug, districts] of STATES) {
  const output = `apps/visualizations/public/data/districting/${slug}-tracts.json`;
  if (!force && fs.existsSync(output)) {
    console.log(`Skipping ${name}; ${output} exists.`);
    continue;
  }

  const args = [
    'scripts/fetch-real-districting-data.mjs',
    '--state',
    fips,
    '--name',
    name,
    '--slug',
    slug,
    '--resolution',
    'tracts',
    '--districts',
    String(districts),
    '--tolerance',
    '0.001',
    '--page-size',
    '400',
    '--timeout-ms',
    '30000',
    '--skip-pl',
  ];
  console.log(`Generating ${name}`);
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Failed to generate ${name}`);
  }
}
