import { describe, expect, it } from 'vitest';
import { DIRECTION_BONUS, attackDirection, facingOf } from './facing';
import type { Direction, Facing, Position } from './types';

/** A target in the middle of the board, far enough from every edge for its eight neighbours to exist. */
const TARGET: Position = { x: 4, y: 4 };

/** The eight cells around a cell, by the side of the board they lie on (north is towards row 0). */
const OFFSET: Readonly<Record<string, Position>> = {
  north: { x: 0, y: -1 },
  northeast: { x: 1, y: -1 },
  east: { x: 1, y: 0 },
  southeast: { x: 1, y: 1 },
  south: { x: 0, y: 1 },
  southwest: { x: -1, y: 1 },
  west: { x: -1, y: 0 },
  northwest: { x: -1, y: -1 },
};

const SIDES = Object.keys(OFFSET);

function unitAt(from: Position, facing: Facing, offset: Position) {
  return { position: { x: from.x + offset.x, y: from.y + offset.y }, facing };
}

/**
 * The whole classification, one row per facing of the target. Read off the dot product: with `f` the
 * unit vector of the facing and `d` the sign vector from the target to the attacker, the cell is front
 * when `f . d > 0`, rear when it is `< 0`, and flank when it is `0` — three front, two flank, three rear
 * for every facing.
 */
const CLASSIFICATION: Readonly<Record<Facing, Readonly<Record<string, Direction>>>> = {
  N: {
    north: 'front',
    northeast: 'front',
    northwest: 'front',
    east: 'flank',
    west: 'flank',
    south: 'rear',
    southeast: 'rear',
    southwest: 'rear',
  },
  E: {
    east: 'front',
    northeast: 'front',
    southeast: 'front',
    north: 'flank',
    south: 'flank',
    west: 'rear',
    northwest: 'rear',
    southwest: 'rear',
  },
  S: {
    south: 'front',
    southeast: 'front',
    southwest: 'front',
    east: 'flank',
    west: 'flank',
    north: 'rear',
    northeast: 'rear',
    northwest: 'rear',
  },
  W: {
    west: 'front',
    northwest: 'front',
    southwest: 'front',
    north: 'flank',
    south: 'flank',
    east: 'rear',
    northeast: 'rear',
    southeast: 'rear',
  },
};

const FACINGS: readonly Facing[] = ['N', 'E', 'S', 'W'];

describe('facingOf', () => {
  it('leaves the dominant axis of the step', () => {
    expect(facingOf(TARGET, { x: 5, y: 4 })).toBe('E');
    expect(facingOf(TARGET, { x: 3, y: 4 })).toBe('W');
    expect(facingOf(TARGET, { x: 4, y: 3 })).toBe('N');
    expect(facingOf(TARGET, { x: 4, y: 5 })).toBe('S');
  });

  it('breaks a diagonal to the horizontal, whatever way it leans', () => {
    expect(facingOf(TARGET, { x: 5, y: 3 })).toBe('E');
    expect(facingOf(TARGET, { x: 5, y: 5 })).toBe('E');
    expect(facingOf(TARGET, { x: 3, y: 3 })).toBe('W');
    expect(facingOf(TARGET, { x: 3, y: 5 })).toBe('W');
  });

  it('reads a step of several cells the same way as the step of one', () => {
    expect(facingOf(TARGET, { x: 4, y: 0 })).toBe('N');
    expect(facingOf(TARGET, { x: 7, y: 6 })).toBe('E');
  });
});

describe('attackDirection', () => {
  it.each(FACINGS)('classifies the eight cells around a target facing %s', (facing) => {
    const target = { position: TARGET, facing };
    const expected = CLASSIFICATION[facing];

    for (const side of SIDES) {
      const attacker = unitAt(TARGET, 'N', OFFSET[side]);
      expect(attackDirection(target, attacker), `${facing} <- ${side}`).toBe(expected[side]);
    }
  });

  it('splits the cells around every facing as three front, two flank and three rear', () => {
    for (const facing of FACINGS) {
      const target = { position: TARGET, facing };
      const seen = SIDES.map((side) => attackDirection(target, unitAt(TARGET, 'N', OFFSET[side])));

      expect(seen.filter((direction) => direction === 'front')).toHaveLength(3);
      expect(seen.filter((direction) => direction === 'flank')).toHaveLength(2);
      expect(seen.filter((direction) => direction === 'rear')).toHaveLength(3);
    }
  });

  it('never reads the facing of the attacker', () => {
    const target = { position: TARGET, facing: 'N' as const };

    for (const side of SIDES) {
      const answers = FACINGS.map((facing) =>
        attackDirection(target, unitAt(TARGET, facing, OFFSET[side])),
      );

      expect(new Set(answers).size, `attacker on the ${side}`).toBe(1);
    }
  });

  it('reads a diagonal by the way it leans, not as a flank', () => {
    // A target looking north: the two cells beside its shoulders are flanks, and the two ahead of
    // those shoulders are front — a shot from the front-left is a front shot.
    const target = { position: TARGET, facing: 'N' as const };

    expect(attackDirection(target, unitAt(TARGET, 'N', OFFSET.northwest!))).toBe('front');
    expect(attackDirection(target, unitAt(TARGET, 'N', OFFSET.west!))).toBe('flank');
    expect(attackDirection(target, unitAt(TARGET, 'N', OFFSET.southwest!))).toBe('rear');
  });
});

describe('the direction bonus table', () => {
  it('gives the front shot nothing and the rear the most of both', () => {
    expect(DIRECTION_BONUS.front).toEqual({ hit: 0, damage: 0 });
    expect(DIRECTION_BONUS.rear.hit).toBeGreaterThan(DIRECTION_BONUS.flank.hit);
    expect(DIRECTION_BONUS.flank.hit).toBeGreaterThan(DIRECTION_BONUS.front.hit);
    expect(DIRECTION_BONUS.rear.damage).toBeGreaterThan(DIRECTION_BONUS.flank.damage);
    expect(DIRECTION_BONUS.flank.damage).toBeGreaterThan(DIRECTION_BONUS.front.damage);
  });

  it('names a row for each of the three directions, and no more', () => {
    expect(Object.keys(DIRECTION_BONUS).sort()).toEqual(['flank', 'front', 'rear']);
  });
});
