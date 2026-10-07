import { describe, expect, it } from 'vitest';
import { effectiveRange, heightAdvantage, heightBonus } from './height';
import type { Board, Position } from './types';

function makeBoard(heights: Record<string, number> = {}): Board {
  const levels = new Array<number>(64).fill(0);
  for (const [key, level] of Object.entries(heights)) {
    const [x, y] = key.split(',').map(Number);
    levels[y * 8 + x] = level;
  }
  return { width: 8, height: 8, levels };
}

/** The roof the table calls its top, and the alley beside it. */
const ROOFTOP: Position = { x: 3, y: 3 };
const ALLEY: Position = { x: 3, y: 4 };
/** An enemy on the ground, well away from both. */
const GROUND: Position = { x: 6, y: 6 };

/** A board with a roof over the alley: the two levels the table is read between. */
const ROOF_OVER_ALLEY = makeBoard({ [`${ROOFTOP.x},${ROOFTOP.y}`]: 2 });

/** A shooter, which is a cell to stand on and a reach, the way `effectiveRange` reads one. */
function shooter(position: Position, range: number) {
  return { position, range };
}

/** The difference in levels between the two cells of a board, read the way the rule reads it. */
function difference(board: Board, from: Position, to: Position): number {
  return board.levels[from.y * board.width + from.x] - board.levels[to.y * board.width + to.x];
}

describe('the height table', () => {
  it('gives a unit level with its target nothing at all', () => {
    expect(heightBonus(0)).toEqual({ hit: 0, range: 0 });
  });

  it('moves only accuracy at one level, and reach as well at two', () => {
    expect(heightBonus(1).range).toBe(0);
    expect(heightBonus(1).hit).toBeGreaterThan(0);
    expect(heightBonus(2).range).toBeGreaterThan(0);
    expect(heightBonus(2).hit).toBeGreaterThan(heightBonus(1).hit);
  });

  it('doubles the accuracy from one level to two, so the table is read and not improvised', () => {
    expect(heightBonus(2).hit).toBe(2 * heightBonus(1).hit);
  });

  it('makes shooting down cost exactly what shooting up gives', () => {
    for (let levels = 1; levels <= 5; levels += 1) {
      const up = heightBonus(levels);
      const down = heightBonus(-levels);

      // Read as sums, so a row of zeroes is a row of zeroes and not a signed zero.
      expect(down.hit + up.hit, `${levels} levels of accuracy`).toBe(0);
      expect(down.range + up.range, `${levels} levels of reach`).toBe(0);
    }
  });

  it('saturates at two levels, above and below', () => {
    const top = heightBonus(2);
    const bottom = heightBonus(-2);

    for (const levels of [2, 3, 7, 100]) expect(heightBonus(levels)).toEqual(top);
    for (const levels of [-2, -3, -7, -100]) expect(heightBonus(levels)).toEqual(bottom);
  });
});

describe('heightAdvantage', () => {
  it('reads the difference in levels between the shooter and the target', () => {
    const rooftop = heightAdvantage(ROOF_OVER_ALLEY, ROOFTOP, ALLEY);
    const alley = heightAdvantage(ROOF_OVER_ALLEY, ALLEY, ROOFTOP);

    expect(rooftop).toEqual(heightBonus(difference(ROOF_OVER_ALLEY, ROOFTOP, ALLEY)));
    expect(alley).toEqual(heightBonus(difference(ROOF_OVER_ALLEY, ALLEY, ROOFTOP)));
    expect(rooftop).toEqual({ hit: -alley.hit, range: -alley.range });
  });

  it('answers nothing for two cells on the same level, however high the pair stands', () => {
    const high = makeBoard({ [`${ROOFTOP.x},${ROOFTOP.y}`]: 2, [`${ALLEY.x},${ALLEY.y}`]: 2 });

    expect(heightAdvantage(high, ROOFTOP, ALLEY)).toEqual({ hit: 0, range: 0 });
    expect(heightAdvantage(makeBoard(), ROOFTOP, ALLEY)).toEqual({ hit: 0, range: 0 });
  });

  it('answers the table for every difference from three below to three above', () => {
    const flat = makeBoard();

    for (let levels = -3; levels <= 3; levels += 1) {
      // The same board every time, read from the two ends the difference asks for.
      const above = { x: 2, y: 2 };
      const below = { x: 2, y: 3 };
      const board = makeBoard({ [`${above.x},${above.y}`]: Math.max(0, levels) });
      board.levels[below.y * board.width + below.x] = Math.max(0, -levels);

      expect(heightAdvantage(board, above, below), `${levels} levels above`).toEqual(
        heightBonus(levels),
      );
    }

    // The flat board's own answer is the middle row.
    expect(heightAdvantage(flat, ROOFTOP, ALLEY)).toEqual(heightBonus(0));
  });

  it('puts the rooftop and the alley at the two ends of the table', () => {
    // The best a shooter can get from the roof over the target, and the worst from the alley below it.
    const fromTheRoof = heightAdvantage(ROOF_OVER_ALLEY, ROOFTOP, GROUND);
    const fromTheAlley = heightAdvantage(ROOF_OVER_ALLEY, ALLEY, ROOFTOP);

    expect(fromTheRoof).toEqual(heightBonus(2));
    expect(fromTheAlley).toEqual(heightBonus(-2));
    expect(fromTheRoof.hit - fromTheAlley.hit).toBe(2 * fromTheRoof.hit);
    expect(fromTheRoof.range - fromTheAlley.range).toBe(2 * fromTheRoof.range);
  });
});

describe('effectiveRange', () => {
  it('leaves the reach of the unit alone at the same level', () => {
    expect(effectiveRange(makeBoard(), shooter(ALLEY, 3), GROUND)).toBe(3);
  });

  it('adds the reach of the table to a shot from above', () => {
    const reach = 3 + heightBonus(2).range;

    expect(effectiveRange(ROOF_OVER_ALLEY, shooter(ROOFTOP, 3), GROUND)).toBe(reach);
  });

  it('takes the reach of the table away from a shot from below', () => {
    expect(effectiveRange(ROOF_OVER_ALLEY, shooter(ALLEY, 3), ROOFTOP)).toBe(
      3 + heightBonus(-2).range,
    );
  });

  it('never falls below one, however far below the target the shooter stands', () => {
    const tower = makeBoard({ [`${ROOFTOP.x},${ROOFTOP.y}`]: 20 });

    for (const range of [0, 1, 2]) {
      expect(effectiveRange(tower, shooter(ALLEY, range), ROOFTOP), `reach ${range}`).toBe(1);
    }
  });
});
