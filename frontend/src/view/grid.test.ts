import { describe, expect, it } from 'vitest';
import { BOARD_HEIGHT, BOARD_WIDTH, cellToPixel, heightColor, ORIGIN, pixelToCell, TILE_SIZE } from './grid';
import { BG_COLOR } from './theme';

const BOARD_LEVELS = [0, 1, 2];

describe('cellToPixel', () => {
  it('places the first cell at the origin', () => {
    expect(cellToPixel({ x: 0, y: 0 })).toEqual({ x: ORIGIN.x, y: ORIGIN.y });
  });

  it('advances one tile per cell', () => {
    expect(cellToPixel({ x: 2, y: 3 })).toEqual({ x: ORIGIN.x + 2 * TILE_SIZE, y: ORIGIN.y + 3 * TILE_SIZE });
  });
});

describe('pixelToCell', () => {
  it('is the inverse of cellToPixel for every cell of the board', () => {
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        expect(pixelToCell(cellToPixel({ x, y }))).toEqual({ x, y });
      }
    }
  });

  it('maps every pixel of a tile to that tile', () => {
    const topLeft = cellToPixel({ x: 3, y: 5 });
    const bottomRight = { x: topLeft.x + TILE_SIZE - 1, y: topLeft.y + TILE_SIZE - 1 };

    expect(pixelToCell(topLeft)).toEqual({ x: 3, y: 5 });
    expect(pixelToCell(bottomRight)).toEqual({ x: 3, y: 5 });
  });

  it('returns null just outside the board on each side', () => {
    const first = cellToPixel({ x: 0, y: 0 });
    const pastLastColumn = ORIGIN.x + BOARD_WIDTH * TILE_SIZE;
    const pastLastRow = ORIGIN.y + BOARD_HEIGHT * TILE_SIZE;

    expect(pixelToCell({ x: first.x - 1, y: first.y })).toBeNull();
    expect(pixelToCell({ x: first.x, y: first.y - 1 })).toBeNull();
    expect(pixelToCell({ x: pastLastColumn, y: ORIGIN.y })).toBeNull();
    expect(pixelToCell({ x: ORIGIN.x, y: pastLastRow })).toBeNull();
  });
});

describe('heightColor', () => {
  it('gives a distinct colour to each level', () => {
    expect(BOARD_LEVELS.map(heightColor)).toEqual([0x23283a, 0x30364a, 0x3f4152]);
    expect(new Set(BOARD_LEVELS.map(heightColor)).size).toBe(BOARD_LEVELS.length);
  });

  it('keeps every tile apart from the night behind the board', () => {
    // A tile the same value as the page would erase the edge of the board.
    for (const level of BOARD_LEVELS) {
      expect(heightColor(level), `level ${level}`).not.toBe(BG_COLOR);
    }
  });

  it('refuses a level that is not on the board', () => {
    expect(() => heightColor(3)).toThrow(RangeError);
    expect(() => heightColor(-1)).toThrow(RangeError);
  });
});
