import type { UnitState } from '../protocol';
import { describe, expect, it } from 'vitest';
import {
  DIM_ALPHA,
  FRAME,
  IDLE_COLUMNS,
  chipFrameOf,
  classRow,
  frameBox,
  frameColumn,
  frameIndex,
  frameRow,
  healthFraction,
  idleFrameOf,
  markerStyle,
  pipsFor,
  rowIdleFrame,
  spriteSheetOf,
  turnLook,
} from './unit-look';

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
  it('is null for a class with no magazine, whatever its resource', () => {
    expect(pipsFor({ magazine: null, ammo: 0, resourceKind: 'ammo' })).toBeNull();
    expect(pipsFor({ magazine: null, ammo: 0, resourceKind: 'mana' })).toBeNull();
  });

  it('is the magazine with as many filled as there is ammunition, warm', () => {
    expect(pipsFor({ magazine: 3, ammo: 1, resourceKind: 'ammo' })).toEqual({
      total: 3,
      filled: 1,
      resource: 'ammo',
    });
  });

  it('counts mana for a magic class, so the pool reads as pips too', () => {
    expect(pipsFor({ magazine: 3, ammo: 3, resourceKind: 'mana' })).toEqual({
      total: 3,
      filled: 3,
      resource: 'mana',
    });
  });

  it('clamps the filled count to the magazine', () => {
    expect(pipsFor({ magazine: 3, ammo: 9, resourceKind: 'ammo' })).toEqual({
      total: 3,
      filled: 3,
      resource: 'ammo',
    });
    expect(pipsFor({ magazine: 3, ammo: -1, resourceKind: 'mana' })).toEqual({
      total: 3,
      filled: 0,
      resource: 'mana',
    });
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

describe('rowIdleFrame', () => {
  it('is one of the two idle columns of the row, and nothing else', () => {
    expect(IDLE_COLUMNS).toEqual([0, 1]);
    expect(frameColumn(rowIdleFrame(3, 0))).toBe(IDLE_COLUMNS[0]);
    expect(frameColumn(rowIdleFrame(3, 1))).toBe(IDLE_COLUMNS[1]);
  });

  it('stays in the row it was given', () => {
    for (const phase of [0, 1]) expect(frameRow(rowIdleFrame(5, phase))).toBe(5);
  });

  it('reads a phase of any size as one of the two poses', () => {
    expect(rowIdleFrame(3, 2)).toBe(rowIdleFrame(3, 0));
    expect(rowIdleFrame(3, 97)).toBe(rowIdleFrame(3, 1));
  });
});

describe('idleFrameOf', () => {
  const CLASSES = ['sniper', 'wizard', 'priest', 'soldier'];

  it('is the idle pose of the class, in the class’s own row', () => {
    expect(idleFrameOf({ primaryClass: 'sniper' })).toBe(frameIndex(3, 0));
    expect(idleFrameOf({ primaryClass: 'wizard' })).toBe(frameIndex(4, 0));
    expect(idleFrameOf({ primaryClass: 'priest' })).toBe(frameIndex(5, 0));
  });

  it('falls back to the first row for a class the sheet does not carry', () => {
    expect(idleFrameOf({ primaryClass: 'soldier' })).toBe(frameIndex(0, 0));
    expect(idleFrameOf({ primaryClass: '' })).toBe(frameIndex(0, 0));
  });

  it('takes the second pose on an odd phase', () => {
    expect(idleFrameOf({ primaryClass: 'priest' }, 1)).toBe(frameIndex(5, 1));
  });

  it('is the frame the turn-order chip shows, for every class and both teams', () => {
    // Slice A's rule: the figure the rotation draws is the figure the unit is drawn with at rest, so
    // the two have to come out of one function. The chip is the only other caller of the same choice.
    for (const primaryClass of CLASSES) {
      for (const team of ['A', 'B'] as const) {
        const unit = { primaryClass, team } as UnitState;
        expect(idleFrameOf(unit)).toBe(chipFrameOf(unit));
      }
    }
  });
});

describe('frameBox', () => {
  it('cuts a frame out of the sheet where the index says it is', () => {
    expect(frameBox(frameIndex(3, 5))).toEqual({ column: 5, row: 3, width: FRAME.width, height: FRAME.height });
  });

  it('gives the first frame of the sheet for the first index', () => {
    expect(frameBox(0)).toEqual({ column: 0, row: 0, width: FRAME.width, height: FRAME.height });
  });
});

describe('turnLook', () => {
  it('gives the unit on turn the arrow and steps nothing back', () => {
    expect(turnLook(true)).toEqual({ arrow: true, alpha: 1 });
  });

  it('steps back the units that are not acting, and gives them no arrow', () => {
    expect(turnLook(false)).toEqual({ arrow: false, alpha: DIM_ALPHA });
  });

  it('dims to the alpha the plan assumed until the phone test says otherwise', () => {
    expect(DIM_ALPHA).toBe(0.6);
  });
});
