// How hard a finger drags the map (owner's request): the four steps the settings panel walks, and the
// one key the choice is kept under. The model is pure arithmetic; only the last two functions below
// touch storage, and neither of them may ever throw.
import { describe, expect, it } from 'vitest';
import {
  PAN_SENSITIVITY_DEFAULT,
  PAN_SENSITIVITY_KEY,
  isPanSensitivity,
  panFactor,
  readPanSensitivity,
  savePanSensitivity,
  stepPanSensitivity,
} from './panSensitivity';

describe('the stepper', () => {
  it('moves a quarter of the travel per press, either way', () => {
    expect(stepPanSensitivity(50, 1)).toBe(75);
    expect(stepPanSensitivity(50, -1)).toBe(25);
    expect(stepPanSensitivity(25, 1)).toBe(50);
    expect(stepPanSensitivity(100, -1)).toBe(75);
  });

  it('stops at each end instead of wrapping round', () => {
    expect(stepPanSensitivity(100, 1)).toBe(100);
    expect(stepPanSensitivity(25, -1)).toBe(25);
  });
});

describe('the factor', () => {
  it('is the percentage over a hundred, so the map follows the whole finger at 100', () => {
    expect(panFactor(25)).toBe(0.25);
    expect(panFactor(50)).toBe(0.5);
    expect(panFactor(75)).toBe(0.75);
    expect(panFactor(100)).toBe(1);
  });
});

describe('the steps the panel can show', () => {
  it('accepts the four of them', () => {
    for (const percent of [25, 50, 75, 100]) expect(isPanSensitivity(percent)).toBe(true);
  });

  it('refuses every other number, whole or not', () => {
    for (const value of [0, 24, 26, 37, 101, -25, 50.5, Number.NaN]) {
      expect(isPanSensitivity(value), String(value)).toBe(false);
    }
  });
});

describe('the setting in the browser', () => {
  const blocked = {
    getItem(): string | null {
      throw new Error('storage is blocked');
    },
    setItem(): void {
      throw new Error('storage is blocked');
    },
  };

  function memoryStorage() {
    const saved = new Map<string, string>();
    return {
      saved,
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    };
  }

  it('keeps the setting under its own namespaced key', () => {
    expect(PAN_SENSITIVITY_KEY).toBe('eldritch-alley.panSensitivity');
  });

  it('is the default when there is nothing saved and when there is no storage at all', () => {
    expect(readPanSensitivity(memoryStorage())).toBe(PAN_SENSITIVITY_DEFAULT);
    expect(readPanSensitivity(null)).toBe(PAN_SENSITIVITY_DEFAULT);
  });

  it('falls back to the default when the storage refuses the read', () => {
    expect(readPanSensitivity(blocked)).toBe(PAN_SENSITIVITY_DEFAULT);
  });

  it('reads back what it saved', () => {
    const storage = memoryStorage();

    savePanSensitivity(25, storage);
    expect(readPanSensitivity(storage)).toBe(25);

    savePanSensitivity(100, storage);
    expect(readPanSensitivity(storage)).toBe(100);
  });

  it('answers with the default on anything the storage hands back that is not a step', () => {
    const storage = memoryStorage();

    // A value the panel cannot show is not rounded to the nearest step: that would put on the screen a
    // number the player never chose. Every one of these is a way storage can be wrong.
    for (const saved of ['perhaps', '', '0', '37', '1000', '-25', '50.5']) {
      storage.saved.set(PAN_SENSITIVITY_KEY, saved);
      expect(readPanSensitivity(storage), saved).toBe(PAN_SENSITIVITY_DEFAULT);
    }
  });

  it('swallows a write the storage refuses, so a blocked browser still plays', () => {
    expect(() => savePanSensitivity(25, blocked)).not.toThrow();
  });
});
