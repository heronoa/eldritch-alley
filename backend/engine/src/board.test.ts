import { describe, expect, it } from 'vitest';
import { distance, inBounds, levelAt } from './board';
import type { Board } from './types';

/** Builds an 8x8 board where every cell is level 0 unless `heights` gives it a level. Keys are "x,y". */
function makeBoard(heights: Record<string, number> = {}): Board {
  const levels = new Array<number>(64).fill(0);
  for (const [key, level] of Object.entries(heights)) {
    const [x, y] = key.split(',').map(Number);
    levels[y * 8 + x] = level;
  }
  return { width: 8, height: 8, levels };
}

describe('board', () => {
  it('accepts every cell of the 8x8 grid', () => {
    const board = makeBoard();
    for (let x = 0; x <= 7; x++) {
      for (let y = 0; y <= 7; y++) {
        expect(inBounds(board, { x, y })).toBe(true);
      }
    }
  });

  it('rejects cells outside the grid', () => {
    const board = makeBoard();
    expect(inBounds(board, { x: -1, y: 0 })).toBe(false);
    expect(inBounds(board, { x: 0, y: -1 })).toBe(false);
    expect(inBounds(board, { x: 8, y: 0 })).toBe(false);
    expect(inBounds(board, { x: 0, y: 8 })).toBe(false);
  });

  it('reads the height level of a cell', () => {
    const board = makeBoard({ '2,3': 2, '0,0': 1 });
    expect(levelAt(board, { x: 2, y: 3 })).toBe(2);
    expect(levelAt(board, { x: 0, y: 0 })).toBe(1);
    expect(levelAt(board, { x: 7, y: 7 })).toBe(0);
  });

  it('measures Chebyshev distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(1); // diagonal
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(1); // straight
    expect(distance({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(2); // two cells away
    expect(distance({ x: 0, y: 0 }, { x: 2, y: 5 })).toBe(5);
  });

  it('measures distance symmetrically', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6 };
    expect(distance(a, b)).toBe(4);
    expect(distance(a, b)).toBe(distance(b, a));
  });
});
