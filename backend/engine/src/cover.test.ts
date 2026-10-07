// Cover: the prop a unit stands behind, and what it costs the shooter.
//
// A `cover` prop is chest-high — it does not block the line of sight (a `wall` does, see `sight.ts`),
// it makes whoever stands behind it harder to hit. The rule is read off the board alone and moves in
// whole points (ADR 0005), so a replay applies exactly what the live match applied.
import { describe, expect, it } from 'vitest';
import { propAt, propsOf } from './board';
import { COVER_HIT_PENALTY, coverFor } from './cover';
import type { Board, Position, Prop } from './types';

/** An 8x8 board of flat ground carrying `props`. */
function makeBoard(props: readonly Prop[] = []): Board {
  return { width: 8, height: 8, levels: new Array<number>(64).fill(0), props };
}

function coverAt(x: number, y: number): Prop {
  return { position: { x, y }, kind: 'cover' };
}

function wallAt(x: number, y: number): Prop {
  return { position: { x, y }, kind: 'wall' };
}

/** The eight cells around a cell, diagonals included. */
const AROUND: readonly Position[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

/** A cell as it is named in a failure message. */
function key(cell: Position): string {
  return `${cell.x},${cell.y}`;
}

describe('propsOf', () => {
  it('answers the props the board carries, in the order the board lists them', () => {
    const props = [coverAt(2, 2), wallAt(5, 5)];
    expect(propsOf(makeBoard(props))).toEqual(props);
  });

  it('answers nothing for a board that left them out, which is the setup a test writes', () => {
    const bare: Board = { width: 8, height: 8, levels: new Array<number>(64).fill(0) };
    expect(propsOf(bare)).toEqual([]);
  });
});

describe('propAt', () => {
  it('reads the prop standing on a cell, and nothing on a cell without one', () => {
    const board = makeBoard([coverAt(3, 3)]);

    expect(propAt(board, { x: 3, y: 3 })).toEqual(coverAt(3, 3));
    expect(propAt(board, { x: 3, y: 4 })).toBeUndefined();
  });

  it('narrows to a kind when the caller names one', () => {
    const board = makeBoard([wallAt(3, 3)]);

    expect(propAt(board, { x: 3, y: 3 }, 'wall')).toEqual(wallAt(3, 3));
    expect(propAt(board, { x: 3, y: 3 }, 'cover')).toBeUndefined();
  });

  it('answers nothing outside the board, which is what reading the neighbours of an edge needs', () => {
    expect(propAt(makeBoard([coverAt(0, 0)]), { x: -1, y: 0 })).toBeUndefined();
    expect(propAt(makeBoard([coverAt(0, 0)]), { x: 8, y: 8 })).toBeUndefined();
  });
});

describe('coverFor', () => {
  it('gives no cover from the prop the target itself stands on', () => {
    // The crate is under its feet, not between the two: standing on top of it is a place to be seen
    // from, not a place to hide (ADR 0013). A crate beside it still covers it, which is the case below.
    const under = makeBoard([coverAt(4, 4)]);
    expect(coverFor(under, { x: 4, y: 4 }, { x: 6, y: 4 })).toBe(false);
    expect(coverFor(under, { x: 4, y: 4 }, { x: 5, y: 4 })).toBe(false);

    const beside = makeBoard([coverAt(4, 4), coverAt(5, 4)]);
    expect(coverFor(beside, { x: 4, y: 4 }, { x: 6, y: 4 })).toBe(true);
  });

  it('gives cover from the side the attacker is on, whatever direction it comes from', () => {
    const target = { x: 4, y: 4 };

    for (const step of AROUND) {
      const behind = { x: target.x + step.x, y: target.y + step.y };
      const attacker = { x: target.x + step.x * 2, y: target.y + step.y * 2 };

      expect(coverFor(makeBoard([coverAt(behind.x, behind.y)]), target, attacker), key(step)).toBe(
        true,
      );
    }
  });

  it('gives no cover from the same prop seen from the other side', () => {
    const target = { x: 4, y: 4 };

    for (const step of AROUND) {
      const opposite = { x: target.x - step.x, y: target.y - step.y };
      const attacker = { x: target.x + step.x * 2, y: target.y + step.y * 2 };

      expect(
        coverFor(makeBoard([coverAt(opposite.x, opposite.y)]), target, attacker),
        key(step),
      ).toBe(false);
    }
  });

  it('gives no cover from a prop beside the target that is not between the two', () => {
    const board = makeBoard([coverAt(4, 3), coverAt(4, 5)]);
    expect(coverFor(board, { x: 4, y: 4 }, { x: 6, y: 4 })).toBe(false);
  });

  it('reads the attacker at any distance, not only on a neighbouring cell', () => {
    // Due east: the crate east of the target is between the two, wherever the shooter stands on that
    // side. From the south-east the same crate is still on the shooter's side; one to the north-west
    // is behind the target's back.
    expect(coverFor(makeBoard([coverAt(2, 1)]), { x: 1, y: 1 }, { x: 7, y: 1 })).toBe(true);
    expect(coverFor(makeBoard([coverAt(2, 1)]), { x: 1, y: 1 }, { x: 7, y: 7 })).toBe(true);
    expect(coverFor(makeBoard([coverAt(0, 0)]), { x: 1, y: 1 }, { x: 7, y: 7 })).toBe(false);
  });

  it('gives no cover from the crate the shooter itself stands on', () => {
    // The crate is under the shooter's feet, not between the two. The target is the neighbouring cell,
    // which is the only distance at which a shooter can share a cell with one of its eight neighbours.
    const board = makeBoard([coverAt(5, 4)]);
    expect(coverFor(board, { x: 4, y: 4 }, { x: 5, y: 4 })).toBe(false);

    // The same crate is cover for a shot from further away, which is the rule doing its work.
    expect(coverFor(board, { x: 4, y: 4 }, { x: 6, y: 4 })).toBe(true);
  });

  it('gives no cover when the two share a cell, which cannot happen in a match', () => {
    // The cell the two stand on is not read at all, so the crate under them changes nothing (ADR 0013).
    expect(coverFor(makeBoard([coverAt(4, 4)]), { x: 4, y: 4 }, { x: 4, y: 4 })).toBe(false);
    expect(coverFor(makeBoard(), { x: 4, y: 4 }, { x: 4, y: 4 })).toBe(false);
  });

  it('never gives cover from a wall: a wall blocks the line instead', () => {
    const onTheSide = makeBoard([wallAt(5, 4)]);
    const onTheTarget = makeBoard([wallAt(4, 4)]);

    expect(coverFor(onTheSide, { x: 4, y: 4 }, { x: 6, y: 4 })).toBe(false);
    expect(coverFor(onTheTarget, { x: 4, y: 4 }, { x: 6, y: 4 })).toBe(false);
  });

  it('throws outside the board, like levelAt', () => {
    const board = makeBoard([coverAt(4, 4)]);

    expect(() => coverFor(board, { x: 8, y: 0 }, { x: 4, y: 4 })).toThrow(RangeError);
    expect(() => coverFor(board, { x: 4, y: 4 }, { x: -1, y: 4 })).toThrow(RangeError);
  });
});

describe('COVER_HIT_PENALTY', () => {
  it('is a whole number of points of the 0..100 accuracy, and not all of them', () => {
    expect(Number.isInteger(COVER_HIT_PENALTY)).toBe(true);
    expect(COVER_HIT_PENALTY).toBeGreaterThan(0);
    expect(COVER_HIT_PENALTY).toBeLessThan(100);
  });
});
