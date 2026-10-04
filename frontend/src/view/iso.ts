// The isometric projection of the board: where a cell is drawn, which cell a point belongs to, the
// order things are drawn in, and how a face is shaded. Plain arithmetic, no Phaser.
//
// The board is a diamond: cell (0, 0) is the top vertex, (7, 7) the bottom one. A cell's level lifts
// its top face by `HZ` per level, and the block under it is drawn as its side faces, which is what
// makes a raised cell read as a block instead of a differently coloured tile.
import { BOARD_HEIGHT, BOARD_WIDTH, type Cell, type Pixel } from './grid';

/** Width of the top face of a tile, in canvas pixels. */
export const TILE_W = 80;

/** Height of the top face of a tile, in canvas pixels. */
export const TILE_H = 40;

/** How far one level lifts a top face. */
export const HZ = 20;

/** Canvas x of the vertical axis the board is centred on. */
export const CX = 640;

/** Canvas y of the top vertex of the flat board. */
export const TOP_Y = 200;

/** How much of the top colour the left face keeps, and how much the right face keeps. */
export const SHADE_LEFT = 0.72;
export const SHADE_RIGHT = 0.5;

/** Centre of the top face of a cell at a level, in canvas pixels. */
export function cellToScreen(cell: Cell, level: number): Pixel {
  return {
    x: CX + ((cell.x - cell.y) * TILE_W) / 2,
    y: TOP_Y + ((cell.x + cell.y + 1) * TILE_H) / 2 - level * HZ,
  };
}

/** The four corners of a top face: N, E, S and W, clockwise from the top. */
export function topFace(cell: Cell, level: number): [Pixel, Pixel, Pixel, Pixel] {
  const { x, y } = cellToScreen(cell, level);
  return [
    { x, y: y - TILE_H / 2 },
    { x: x + TILE_W / 2, y },
    { x, y: y + TILE_H / 2 },
    { x: x - TILE_W / 2, y },
  ];
}

/**
 * Every cell, from the front of the board to the back: the largest `x + y` first, which is the cell
 * nearest the viewer. Cells on the same diagonal touch but never cover each other, so their order
 * among themselves only has to be stable; it runs left to right.
 */
const CELLS_FRONT_TO_BACK: Cell[] = (() => {
  const cells: Cell[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) cells.push({ x, y });
  }
  return cells.sort((a, b) => b.x + b.y - (a.x + a.y) || a.x - b.x);
})();

/** Whether a point is inside the diamond of a top face centred on `centre`. */
function insideTopFace(point: Pixel, centre: Pixel): boolean {
  const dx = Math.abs(point.x - centre.x) / (TILE_W / 2);
  const dy = Math.abs(point.y - centre.y) / (TILE_H / 2);
  return dx + dy <= 1;
}

/**
 * Whether a point is inside the silhouette of a cell's block: its top face swept straight down by
 * the height of the block plus the half tile of the base. Sweeping a diamond down a segment widens
 * it by what it loses in the sideways direction, which is the closed form below.
 */
function insideBlock(point: Pixel, cell: Cell, level: number): boolean {
  const centre = cellToScreen(cell, level);
  const dx = Math.abs(point.x - centre.x) / (TILE_W / 2);
  if (dx > 1) return false;

  const slack = (1 - dx) * (TILE_H / 2);
  const drop = level * HZ + TILE_H / 2;
  return point.y >= centre.y - slack && point.y <= centre.y + drop + slack;
}

/**
 * The cell under a point, or null. `levelAt` gives each cell's level.
 *
 * A top face is what the player aims at, so every one of them is tested before any block: a click on
 * a raised cell's top belongs to that cell even where a flat cell behind it happens to reach the
 * same pixel. Only a point that no top face claims can fall on a block's side, and then the nearest
 * block wins.
 */
export function cellAt(point: Pixel, levelAt: (cell: Cell) => number): Cell | null {
  for (const cell of CELLS_FRONT_TO_BACK) {
    if (insideTopFace(point, cellToScreen(cell, levelAt(cell)))) return cell;
  }
  for (const cell of CELLS_FRONT_TO_BACK) {
    if (insideBlock(point, cell, levelAt(cell))) return cell;
  }
  return null;
}

/** Draw order of a cell: the further down the diagonal, the nearer the viewer. */
export function depthOfCell(cell: Cell): number {
  return cell.x + cell.y;
}

/**
 * Draw order of a unit standing on a cell. Half a step past its own cell, so it is drawn over the
 * tile it stands on and under the tile in front of it.
 */
export function depthOfUnit(cell: Cell): number {
  return cell.x + cell.y + 0.5;
}

/** The colour with every channel multiplied by `factor` and rounded down. */
export function shade(color: number, factor: number): number {
  if (factor < 0 || factor > 1) throw new RangeError(`shade factor out of range: ${factor}`);

  const channel = (shift: number) => Math.floor(((color >> shift) & 0xff) * factor);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
