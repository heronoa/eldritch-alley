// The height levels of the board and the two shapes the projection speaks in. Plain arithmetic, no
// Phaser.
//
// Where a cell is drawn on the canvas is `iso.ts`'s business: the board is isometric, so a cell has no
// top-left corner to speak of.

/**
 * The board is 8x8 and this module hard-codes it. The state carries the real size, so the projection
 * and the picking take the board as an argument now; what still counts cells with these two is
 * `BoardTiles`, which learns the size it is handed in M2 of the map-variety feature.
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

/** How many cells a board has, which is all the projection and the HUD need to know about it. */
export interface BoardSize {
  width: number;
  height: number;
}

/** The tallest level the board can carry: the building mass a map is walled with. */
export const MAX_LEVEL = 3;

/**
 * The colour of the top face of a tile at a given height. Levels are data; 0 to 3 exist.
 *
 * The four tones are the tile tops of the prototype — asphalt, slab, plaza and building — kept dark
 * enough that the paper outline of a unit's marker clears 7:1 on all of them
 * (`theme.contrast.test.ts`). The wall is the darkest of the four on purpose: it has to read as mass,
 * not as another kind of ground.
 */
export function heightColor(level: number): number {
  switch (level) {
    case 0:
      return 0x23283a;
    case 1:
      return 0x30364a;
    case 2:
      return 0x3f4152;
    case 3:
      return 0x1a1e2c;
    default:
      throw new RangeError(`unknown height level: ${level}`);
  }
}
