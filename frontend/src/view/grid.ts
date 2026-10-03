// Where the board sits on the canvas and how a cell is coloured. Plain arithmetic, no Phaser.

/** Side of one tile, in pixels. */
export const TILE_SIZE = 48;

/** Top-left corner of the board, in pixels. */
export const ORIGIN = { x: 40, y: 40 };

/**
 * The M2-a board is 8x8 and this module hard-codes it. The state carries the real size, so if a
 * later map is not 8x8, `pixelToCell` has to take the board as an argument instead.
 */
export const BOARD_WIDTH = 8;
export const BOARD_HEIGHT = 8;

/** A cell of the board. */
export interface Cell {
  x: number;
  y: number;
}

/** A point on the canvas. */
export interface Pixel {
  x: number;
  y: number;
}

/** The top-left pixel of a cell. */
export function cellToPixel(cell: Cell): Pixel {
  return { x: ORIGIN.x + cell.x * TILE_SIZE, y: ORIGIN.y + cell.y * TILE_SIZE };
}

/** The cell under a pixel, or null when the pixel is outside the board. */
export function pixelToCell(px: Pixel): Cell | null {
  const x = Math.floor((px.x - ORIGIN.x) / TILE_SIZE);
  const y = Math.floor((px.y - ORIGIN.y) / TILE_SIZE);
  if (x < 0 || y < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return null;
  return { x, y };
}

/** The colour of a tile at a given height. Levels are data; only 0, 1 and 2 exist. */
export function heightColor(level: number): number {
  switch (level) {
    case 0:
      return 0x2b2d3a;
    case 1:
      return 0x4a4e69;
    case 2:
      return 0x7b6d8d;
    default:
      throw new RangeError(`unknown height level: ${level}`);
  }
}
