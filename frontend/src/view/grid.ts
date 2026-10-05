// The two shapes the projection speaks in, and the one value that is not a level. Plain arithmetic,
// no Phaser.
//
// Where a cell is drawn on the canvas is `iso.ts`'s business: the board is isometric, so a cell has no
// top-left corner to speak of. How high a cell is, is the map's business: since map fidelity M1 the
// heights are the prototype's own, 0 to 11 with a gap here and there, and they live as data in
// `maps/prototype-maps.ts` — there is no palette of four tones to keep in step any more.

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

/**
 * The height of a cell with no floor: the gap between the rooftops, where the street runs twenty-odd
 * levels below the deck. No map reaches it, so it never equals a real level, and it is what the
 * projection and the board's bounds skip: nothing stands on a cell without a floor, and nothing picks
 * one either.
 */
export const NO_FLOOR = Number.NEGATIVE_INFINITY;
