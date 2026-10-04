import type { PartisanDistrictScore } from './realDistricting';

export type DistrictMapMode = 'districts' | 'partisan' | 'population';

const RED = { r: 190, g: 55, b: 55 };
const BLUE = { r: 37, g: 99, b: 181 };
const ORANGE = { r: 194, g: 103, b: 22 };
const TEAL = { r: 13, g: 124, b: 116 };
const NEUTRAL = { r: 241, g: 245, b: 249 };

function mix(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  amount: number
): string {
  const t = Math.max(0, Math.min(1, amount));
  const channel = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${channel(from.r, to.r)}, ${channel(from.g, to.g)}, ${channel(from.b, to.b)})`;
}

/** Stable categorical colors without repeating after a fixed-size palette. */
export function districtColor(index: number): string {
  const hue = Math.round((index * 137.508 + 28) % 360);
  return `hsl(${hue} 58% 72%)`;
}

export function partisanColor(margin: number): string {
  const strength = Math.min(1, Math.abs(margin) / 0.3);
  return mix(NEUTRAL, margin >= 0 ? BLUE : RED, strength);
}

export function populationColor(deviation: number): string {
  const strength = Math.min(1, Math.abs(deviation) / 0.08);
  return mix(NEUTRAL, deviation >= 0 ? TEAL : ORANGE, strength);
}

export function districtFill(
  mode: DistrictMapMode,
  district: number,
  population: number,
  idealPopulation: number,
  partisanScore?: PartisanDistrictScore
): string {
  if (mode === 'partisan' && partisanScore) {
    return partisanColor(partisanScore.margin);
  }
  if (mode === 'population') {
    return populationColor(
      (population - idealPopulation) / Math.max(1, idealPopulation)
    );
  }
  return districtColor(district);
}

export function formatPartisanMargin(value: number): string {
  const party = value >= 0 ? 'D' : 'R';
  return `${party}+${(Math.abs(value) * 100).toFixed(1)}`;
}

export function formatPopulationDeviation(
  population: number,
  idealPopulation: number
): string {
  const deviation =
    ((population - idealPopulation) / Math.max(1, idealPopulation)) * 100;
  return `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%`;
}
