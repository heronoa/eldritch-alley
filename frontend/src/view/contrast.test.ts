import { describe, expect, it } from 'vitest';
import { contrastRatio, luminance } from './contrast';

describe('contrastRatio', () => {
  it('gives the full 21 between black and white', () => {
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 5);
  });

  it('gives 1 between a colour and itself', () => {
    expect(contrastRatio(0x777777, 0x777777)).toBeCloseTo(1, 5);
    expect(contrastRatio(0x0b0e18, 0x0b0e18)).toBeCloseTo(1, 5);
  });

  it('does not care about the order of the pair', () => {
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(contrastRatio(0xffffff, 0x000000), 10);
    expect(contrastRatio(0x6f95d6, 0x0b0e18)).toBeCloseTo(contrastRatio(0x0b0e18, 0x6f95d6), 10);
  });

  it('reproduces the ratios the palette was chosen against', () => {
    expect(contrastRatio(0x6f95d6, 0x0b0e18)).toBeCloseTo(6.37, 2);
    expect(contrastRatio(0xd9473d, 0x0b0e18)).toBeCloseTo(4.51, 2);
    expect(contrastRatio(0x4a4a4a, 0xe6dcc4)).toBeCloseTo(6.5, 2);
  });
});

describe('luminance', () => {
  it('orders the ends of the scale', () => {
    expect(luminance(0x000000)).toBeCloseTo(0, 5);
    expect(luminance(0xffffff)).toBeCloseTo(1, 5);
  });

  it('is a relative luminance, never above 1', () => {
    for (const color of [0x0b0e18, 0x131622, 0xe6dcc4, 0xc8322a, 0x3f4152]) {
      expect(luminance(color)).toBeGreaterThanOrEqual(0);
      expect(luminance(color)).toBeLessThanOrEqual(1);
    }
  });
});
