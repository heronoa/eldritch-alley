import { describe, expect, it } from 'vitest';
import { PROTOTYPE_MAPS } from '../maps/prototype-maps';
import type { BoardSize, Cell } from './grid';
import { VIEWS, rotateCell, rotatedSize, unrotateCell, viewDirection } from './rotation';

const SQUARE: BoardSize = { width: 10, height: 10 };
const WIDE: BoardSize = { width: 7, height: 4 };

/** Every cell of a board, which is what a rotation has to account for. */
function cells(size: BoardSize): Cell[] {
  const all: Cell[] = [];
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) all.push({ x, y });
  }
  return all;
}

describe('rotateCell', () => {
  it('walks the corners of a square board round by one step', () => {
    expect(rotateCell({ x: 0, y: 0 }, 1, SQUARE)).toEqual({ x: 9, y: 0 });
    expect(rotateCell({ x: 9, y: 0 }, 1, SQUARE)).toEqual({ x: 9, y: 9 });
    expect(rotateCell({ x: 9, y: 9 }, 1, SQUARE)).toEqual({ x: 0, y: 9 });
    expect(rotateCell({ x: 0, y: 9 }, 1, SQUARE)).toEqual({ x: 0, y: 0 });
  });

  it('reads a board that is not square by the size it has at that step', () => {
    // A 7x4 board becomes a 4x7 one, so its top-right corner (6, 0) lands on (3, 6).
    expect(rotateCell({ x: 6, y: 0 }, 1, WIDE)).toEqual({ x: 3, y: 6 });
  });

  it('leaves the view it is asked for nothing to do when asked to turn nothing', () => {
    expect(rotateCell({ x: 2, y: 5 }, 0, SQUARE)).toEqual({ x: 2, y: 5 });
    expect(rotateCell({ x: 2, y: 5 }, VIEWS, SQUARE)).toEqual({ x: 2, y: 5 });
  });

  it('comes back to where it started after the four views, on any board', () => {
    for (const size of [SQUARE, WIDE]) {
      for (const cell of cells(size)) expect(rotateCell(cell, VIEWS, size)).toEqual(cell);
    }
  });
});

describe('unrotateCell', () => {
  it('answers the cell of the map a cell of the view came from', () => {
    expect(unrotateCell({ x: 3, y: 6 }, 1, { width: 4, height: 7 })).toEqual({ x: 6, y: 0 });
    expect(unrotateCell({ x: 9, y: 0 }, 1, SQUARE)).toEqual({ x: 0, y: 0 });
  });

  it('is the inverse of the rotation in all four views, on any board', () => {
    for (const size of [SQUARE, WIDE]) {
      for (let steps = 0; steps < VIEWS; steps += 1) {
        const viewSize = rotatedSize(size, steps);
        for (const cell of cells(size)) {
          expect(unrotateCell(rotateCell(cell, steps, size), steps, viewSize)).toEqual(cell);
        }
      }
    }
  });

  it('round trips every cell of every map in every view, which is what a tap has to survive', () => {
    for (const map of PROTOTYPE_MAPS) {
      const size: BoardSize = { width: map.tiles[0].length, height: map.tiles.length };
      for (let steps = 0; steps < VIEWS; steps += 1) {
        const viewSize = rotatedSize(size, steps);
        for (const cell of cells(size)) {
          expect(unrotateCell(rotateCell(cell, steps, size), steps, viewSize)).toEqual(cell);
        }
      }
    }
  });
});

describe('rotatedSize', () => {
  it('swaps the sides of the board on the odd views and only on those', () => {
    expect(rotatedSize(WIDE, 0)).toEqual(WIDE);
    expect(rotatedSize(WIDE, 1)).toEqual({ width: 4, height: 7 });
    expect(rotatedSize(WIDE, 2)).toEqual(WIDE);
    expect(rotatedSize(WIDE, 3)).toEqual({ width: 4, height: 7 });
  });
});

describe('viewDirection', () => {
  it('names the side the camera looks from, wrapping round the compass', () => {
    expect(viewDirection(0)).toBe('north');
    expect(viewDirection(1)).toBe('east');
    expect(viewDirection(2)).toBe('south');
    expect(viewDirection(3)).toBe('west');
    expect(viewDirection(4)).toBe('north');
  });
});
