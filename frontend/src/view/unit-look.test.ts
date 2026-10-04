import type { UnitState } from '../protocol';
import { describe, expect, it } from 'vitest';
import { chipFrameOf, classRow, frameIndex, healthFraction, markerStyle, pipsFor, spriteSheetOf } from './unit-look';

describe('spriteSheetOf', () => {
  it('gives the human side the ally sheet and the bot the enemy sheet', () => {
    expect(spriteSheetOf('A')).toBe('ally');
    expect(spriteSheetOf('B')).toBe('enemy');
  });
});

describe('classRow', () => {
  it('points each class of the roster at its row of the sheet', () => {
    expect(classRow('sniper')).toBe(3);
    expect(classRow('wizard')).toBe(4);
    expect(classRow('priest')).toBe(5);
  });

  it('returns null for a class the sheet does not carry', () => {
    expect(classRow('soldier')).toBeNull();
    expect(classRow('')).toBeNull();
  });
});

describe('frameIndex', () => {
  it('counts ten columns per row', () => {
    expect(frameIndex(3, 9)).toBe(39);
    expect(frameIndex(0, 0)).toBe(0);
    expect(frameIndex(5, 4)).toBe(54);
  });
});

describe('healthFraction', () => {
  it('is the share of the health the unit entered with', () => {
    expect(healthFraction({ health: 6, maxHealth: 12 })).toBe(0.5);
  });

  it('never goes above one or below zero', () => {
    expect(healthFraction({ health: 15, maxHealth: 12 })).toBe(1);
    expect(healthFraction({ health: -3, maxHealth: 12 })).toBe(0);
  });

  it('is zero when there is no ceiling to divide by', () => {
    expect(healthFraction({ health: 0, maxHealth: 0 })).toBe(0);
  });
});

describe('pipsFor', () => {
  it('is null for a class with no magazine', () => {
    expect(pipsFor({ magazine: null, ammo: 0 })).toBeNull();
  });

  it('is the magazine with as many filled as there is ammunition', () => {
    expect(pipsFor({ magazine: 3, ammo: 1 })).toEqual({ total: 3, filled: 1 });
  });

  it('clamps the filled count to the magazine', () => {
    expect(pipsFor({ magazine: 3, ammo: 9 })).toEqual({ total: 3, filled: 3 });
    expect(pipsFor({ magazine: 3, ammo: -1 })).toEqual({ total: 3, filled: 0 });
  });
});

describe('markerStyle', () => {
  it('marks the diamond for both teams and the corners for the bot only', () => {
    expect(markerStyle('A')).toEqual({ diamond: true, corners: false });
    expect(markerStyle('B')).toEqual({ diamond: true, corners: true });
  });
});

describe('chipFrameOf', () => {
  it('shows the idle frame of the class in its own row', () => {
    const sniper = { primaryClass: 'sniper' } as UnitState;

    expect(chipFrameOf(sniper)).toBe(frameIndex(3, 0));
  });

  it('falls back to the first row for a class the sheet does not carry', () => {
    const unknown = { primaryClass: 'soldier' } as UnitState;

    expect(chipFrameOf(unknown)).toBe(frameIndex(0, 0));
  });
});
