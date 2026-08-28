import { describe, expect, test } from 'vitest';
import {
  districtColor,
  districtFill,
  formatPartisanMargin,
  formatPopulationDeviation,
  partisanColor,
  populationColor,
} from './districtMapPresentation';

describe('district map presentation', () => {
  test('does not repeat categorical colors at the old palette boundary', () => {
    expect(districtColor(0)).not.toBe(districtColor(12));
  });

  test('uses partisan data in partisan mode', () => {
    expect(partisanColor(0.2)).toContain('rgb(');
    expect(
      districtFill('partisan', 0, 100, 100, {
        votesDem: 60,
        votesGop: 40,
        totalVotes: 100,
        demShare: 0.6,
        gopShare: 0.4,
        margin: 0.2,
      })
    ).toBe(partisanColor(0.2));
  });

  test('formats margins and signed population deviations clearly', () => {
    expect(formatPartisanMargin(0.123)).toBe('D+12.3');
    expect(formatPartisanMargin(-0.071)).toBe('R+7.1');
    expect(formatPopulationDeviation(105, 100)).toBe('+5.0%');
    expect(formatPopulationDeviation(95, 100)).toBe('-5.0%');
  });

  test('keeps an ideally populated district visually neutral', () => {
    expect(populationColor(0)).toBe('rgb(241, 245, 249)');
  });

  test('keeps a tied district visually neutral', () => {
    expect(partisanColor(0)).toBe('rgb(241, 245, 249)');
  });
});
