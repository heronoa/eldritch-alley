// The size of the board and the colour of its height levels. Plain arithmetic, no Phaser.
//
// Where a cell is drawn on the canvas is `iso.ts`'s business now: the board is isometric, so a cell
// has no top-left corner to speak of.

/**
 * The board is 8x8 and this module hard-codes it. The state carries the real size, so if a later map
 * is not 8x8, the projection and the picking have to take the board as an argument instead.
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

/**
 * The colour of the top face of a tile at a given height. Levels are data; only 0, 1 and 2 exist.
 *
 * The three tones are the tile tops of the prototype — asphalt, slab, plaza — kept dark enough that
 * the paper outline of a unit's marker clears 7:1 on all of them (`theme.contrast.test.ts`).
 */
export function heightColor(level: number): number {
  switch (level) {
    case 0:
      return 0x23283a;
    case 1:
      return 0x30364a;
    case 2:
      return 0x3f4152;
    default:
      throw new RangeError(`unknown height level: ${level}`);
  }
}
