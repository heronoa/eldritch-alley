// The only source of randomness in the engine (ADR 0005). Every value is an integer, and no rule
// divides: the engine's forbidden-pattern guard rejects `/`, so the bounds below use `%` only.
import type { Rng } from './types';

const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 0x100000000;

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Advances the state and returns the next 32 bits. This is the mulberry32 core. */
function nextUint32(rng: Rng): number {
  rng.state = (rng.state + MULBERRY_INCREMENT) >>> 0;
  let mix = rng.state;
  mix = Math.imul(mix ^ (mix >>> 15), mix | 1);
  mix = (mix + Math.imul(mix ^ (mix >>> 7), mix | 61)) ^ mix;
  return (mix ^ (mix >>> 14)) >>> 0;
}

/**
 * Returns an integer in the inclusive range [min, max], and advances the state.
 *
 * A plain `value % span` favours the low results whenever 2^32 is not a multiple of `span`. To avoid
 * that bias, values in the last incomplete block are discarded and a new 32-bit value is drawn. The
 * number of draws is therefore not fixed; it is still fully determined by the seed and the history.
 */
export function nextInt(rng: Rng, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new RangeError(`nextInt bounds must be integers, got ${min}..${max}`);
  }
  const span = max - min + 1;
  if (span < 1 || span > UINT32_RANGE) {
    throw new RangeError(`nextInt needs a range of 1 to 2^32 values, got ${min}..${max}`);
  }

  // The largest multiple of `span` that fits in 2^32, written without division.
  const threshold = UINT32_RANGE - (UINT32_RANGE % span);
  let value = nextUint32(rng);
  while (value >= threshold) value = nextUint32(rng);
  return min + (value % span);
}
