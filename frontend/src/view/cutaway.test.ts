import { describe, expect, it } from 'vitest';
import type { BoardSize, Cell } from './grid';
import { CUTAWAY_LEVEL, CUTAWAY_MIN_LEVEL, type Drawn, covers, cutawayLevel } from './cutaway';

const SIZE: BoardSize = { width: 10, height: 10 };

/** A predicate that answers "is there a building here" out of a list of building cells. */
function buildings(...cells: Cell[]): (cell: Cell) => boolean {
  return (cell) => cells.some((b) => b.x === cell.x && b.y === cell.y);
}

/** A box of the given size with its top-left corner at a point. */
function box(x: number, y: number, width = 32, height = 48): Drawn['box'] {
  return { x, y, width, height };
}

describe('cutawayLevel', () => {
  it('lowers a building tall enough with open ground behind it', () => {
    const here = { x: 5, y: 5 };

    const level = cutawayLevel(here, 4, SIZE, buildings(here, { x: 4, y: 4 }));

    expect(level).toBe(CUTAWAY_LEVEL);
  });

  it('leaves a building of three levels alone, however open the ground behind it', () => {
    const here = { x: 5, y: 5 };

    expect(cutawayLevel(here, 3, SIZE, buildings(here))).toBe(3);
  });

  it('lowers a building taller than the threshold too', () => {
    const here = { x: 5, y: 5 };

    expect(cutawayLevel(here, 9, SIZE, buildings(here))).toBe(CUTAWAY_LEVEL);
    expect(CUTAWAY_MIN_LEVEL).toBe(4);
  });

  it('takes any of the three neighbours behind it as the playable area', () => {
    const here = { x: 5, y: 5 };

    for (const behind of [
      { x: 4, y: 5 },
      { x: 5, y: 4 },
      { x: 4, y: 4 },
    ]) {
      expect(cutawayLevel(here, 6, SIZE, buildings(here, behind))).toBe(CUTAWAY_LEVEL);
    }
  });

  it('leaves it standing when the neighbours behind it are buildings as well', () => {
    const here = { x: 5, y: 5 };

    const level = cutawayLevel(
      here,
      6,
      SIZE,
      buildings(here, { x: 4, y: 5 }, { x: 5, y: 4 }, { x: 4, y: 4 }),
    );

    expect(level).toBe(6);
  });

  it('leaves a building at the edge of the board standing, with nothing behind it to open', () => {
    const corner = { x: 0, y: 0 };

    expect(cutawayLevel(corner, 8, SIZE, buildings(corner))).toBe(8);
  });

  it('leaves a cell that is not a building at its own level', () => {
    const here = { x: 5, y: 5 };

    expect(cutawayLevel(here, 6, SIZE, buildings())).toBe(6);
  });
});

describe('covers', () => {
  const building: Drawn = { box: box(100, 200, 64, 60), depth: 5 };
  /** A unit standing where the building's own box reaches. */
  const hidden: Drawn = { box: box(110, 220), depth: 3 };

  it('says a building covers what is behind it and inside its box', () => {
    expect(covers(building, hidden)).toBe(true);
  });

  it('leaves alone what stands in front of it', () => {
    expect(covers(building, { ...hidden, depth: 6 })).toBe(false);
  });

  it('leaves alone what stands beside it', () => {
    expect(covers(building, { ...hidden, box: box(400, 220) })).toBe(false);
  });

  it('leaves alone what stands above its roof', () => {
    expect(covers(building, { ...hidden, box: box(110, 40) })).toBe(false);
  });
});
