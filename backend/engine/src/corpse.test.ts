import { describe, expect, it } from 'vitest';
import { corpseRounds } from './corpse';

describe('corpseRounds', () => {
  it('gives 3 rounds for Nerve 0 to 49', () => {
    expect(corpseRounds(0)).toBe(3);
    expect(corpseRounds(49)).toBe(3);
  });

  it('gives 4 rounds for Nerve 50 to 99', () => {
    expect(corpseRounds(50)).toBe(4);
    expect(corpseRounds(99)).toBe(4);
  });

  it('gives 5 rounds for Nerve 100', () => {
    expect(corpseRounds(100)).toBe(5);
  });

  it('rejects values outside 0..100 and non-integers', () => {
    expect(() => corpseRounds(-1)).toThrow(RangeError);
    expect(() => corpseRounds(101)).toThrow(RangeError);
    expect(() => corpseRounds(49.5)).toThrow(RangeError);
  });
});
