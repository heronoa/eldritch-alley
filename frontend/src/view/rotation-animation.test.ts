import { describe, expect, it } from 'vitest';
import {
  ROTATION_MS,
  easeInOutCubic,
  rotationAngle,
  rotationProgress,
  simplifiedAt,
} from './rotation-animation';

describe('rotationProgress', () => {
  it('runs from nothing to finished over the length of the turn', () => {
    expect(rotationProgress(0)).toBe(0);
    expect(rotationProgress(ROTATION_MS / 2)).toBe(0.5);
    expect(rotationProgress(ROTATION_MS)).toBe(1);
  });

  it('holds at nothing before the turn and at finished after it', () => {
    expect(rotationProgress(-200)).toBe(0);
    expect(rotationProgress(ROTATION_MS + 1000)).toBe(1);
  });
});

describe('easeInOutCubic', () => {
  it('leaves the ends where they are and passes through the middle of them', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('starts slow and ends slow, so the turn does not jerk into place', () => {
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
  });

  it('is the same shape read from either end', () => {
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(easeInOutCubic(t) + easeInOutCubic(1 - t)).toBeCloseTo(1);
    }
  });
});

describe('rotationAngle', () => {
  it('starts at the view it is leaving and ends at the view it is entering', () => {
    expect(rotationAngle(0, 90, 0)).toBe(0);
    expect(rotationAngle(0, 90, ROTATION_MS)).toBe(90);
    expect(rotationAngle(270, 360, ROTATION_MS)).toBe(360);
  });

  it('is half way round at half the time', () => {
    expect(rotationAngle(0, 90, ROTATION_MS / 2)).toBeCloseTo(45);
  });

  it('only ever turns the one way', () => {
    let previous = rotationAngle(0, 90, 0);
    for (let ms = 0; ms <= ROTATION_MS; ms += ROTATION_MS / 20) {
      const angle = rotationAngle(0, 90, ms);
      expect(angle).toBeGreaterThanOrEqual(previous);
      previous = angle;
    }
  });

  it('turns backwards just as well, for the other button', () => {
    expect(rotationAngle(0, -90, ROTATION_MS / 2)).toBeCloseTo(-45);
    expect(rotationAngle(0, -90, ROTATION_MS)).toBe(-90);
  });
});

describe('simplifiedAt', () => {
  it('asks for the simplified drawing for as long as the turn lasts', () => {
    expect(simplifiedAt(0)).toBe(true);
    expect(simplifiedAt(0.5)).toBe(true);
    expect(simplifiedAt(0.99)).toBe(true);
  });

  it('asks for the detailed view the moment the turn is over', () => {
    expect(simplifiedAt(1)).toBe(false);
    expect(simplifiedAt(2)).toBe(false);
  });
});
