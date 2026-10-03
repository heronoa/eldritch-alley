import { describe, expect, it } from 'vitest';
import { createRng, nextInt } from './rng';

const UINT32_MAX = 0xffffffff;

// Reference sequence for seed 1, from the mulberry32 algorithm implemented in rng.ts.
const SEED_1_SEQUENCE = [
  2693262067, 11749833, 2265367787, 4213581821, 4159151403, 1207330352, 2632122864, 3095568220,
  1828783984, 4272732017, 1955374602, 2099329838, 596715197, 1734070562, 1063107040, 663542962,
];

function draw(rng: ReturnType<typeof createRng>, count: number): number[] {
  return Array.from({ length: count }, () => nextInt(rng, 0, UINT32_MAX));
}

describe('rng', () => {
  it('produces the same first 16 values for the same seed', () => {
    expect(draw(createRng(1), 16)).toEqual(draw(createRng(1), 16));
  });

  it('follows the reference sequence for seed 1', () => {
    expect(draw(createRng(1), 16)).toEqual(SEED_1_SEQUENCE);
  });

  it('diverges for different seeds within the first values', () => {
    expect(draw(createRng(1), 16)).not.toEqual(draw(createRng(2), 16));
  });

  it('rejects bounds that are not integers, empty ranges and ranges wider than 2^32', () => {
    expect(() => nextInt(createRng(1), 5, 4)).toThrow(RangeError);
    expect(() => nextInt(createRng(1), 0.5, 4)).toThrow(RangeError);
    expect(() => nextInt(createRng(1), 0, 0x100000000)).toThrow(RangeError);
  });

  it('draws each value of a range that does not divide 2^32 with the same frequency', () => {
    // 2^32 % 3 = 1, so a plain modulo would favour the low values. Rejection sampling removes that.
    const rng = createRng(2024);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[nextInt(rng, 0, 2)]++;
    for (const count of counts) {
      expect(count).toBeGreaterThan(9500);
      expect(count).toBeLessThan(10500);
    }
  });

  it('keeps nextInt inside the inclusive range and returns integers only', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const value = nextInt(rng, 3, 9);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(9);
    }
  });

  it('covers both ends of a small range', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(nextInt(rng, 1, 2));
    expect([...seen].sort()).toEqual([1, 2]);
  });

  it('returns min when the range holds a single value', () => {
    expect(nextInt(createRng(7), 5, 5)).toBe(5);
  });
});
