// The isometric projection of the board: where a cell is drawn, which cell a point belongs to, the
// order things are drawn in, and how a face is shaded. Plain arithmetic, no Phaser.
//
// The board is a diamond: cell (0, 0) is the top vertex and the far corner of the last diagonal the
// bottom one, whatever size the state says the board is. A cell's level lifts its top face by `HZ` per
// level, and the block under it is drawn as its side faces, which is what makes a raised cell read as
// a block instead of a differently coloured tile.
//
// Since map fidelity M2 the numbers are the prototype's own, at `PIXEL` times their size: its tile is
// 32x16 with a height step of 8, and everything the client draws is that drawing scaled by a whole
// number, so no edge is ever half a pixel wide. `lift` is the prototype's other unit — how far it
// lowers a whole map — and it is passed in by the map, never invented here.
import { NO_FLOOR, type BoardSize, type Cell, type Pixel } from './grid';

/** How much bigger than the prototype's own pixels a canvas pixel of the board is. */
export const PIXEL = 2;

/** Width of the top face of a tile, in canvas pixels: the prototype's 32. */
export const TILE_W = 32 * PIXEL;

/** Height of the top face of a tile, in canvas pixels: the prototype's 16. */
export const TILE_H = 16 * PIXEL;

/** How far one level lifts a top face: the prototype's 8. */
export const HZ = 8 * PIXEL;

/**
 * Draw order of the attack effects: above every piece of the board — the deepest of the maps the
 * server ships puts a unit on (9, 9), at 18.5 — and below the HUD, which is drawn at 100.
 */
export const EFFECT_DEPTH = 20;

/** Canvas x of the vertical axis the board is centred on. */
export const CX = 640;

/** Canvas y of the top vertex of the flat board. */
export const TOP_Y = 200;

/** How much of the top colour the left face keeps, and how much the right face keeps. */
export const SHADE_LEFT = 0.72;
export const SHADE_RIGHT = 0.5;

/**
 * Centre of the top face of a cell at a level, in canvas pixels. `lift` is the map's own, in the
 * prototype's pixels, so a lifted map is lowered as a whole rather than cell by cell.
 */
export function cellToScreen(cell: Cell, level: number, lift = 0): Pixel {
  return {
    x: CX + ((cell.x - cell.y) * TILE_W) / 2,
    y: TOP_Y + ((cell.x + cell.y + 1) * TILE_H) / 2 - level * HZ + lift * PIXEL,
  };
}

/** The four corners of a top face: N, E, S and W, clockwise from the top. */
export function topFace(cell: Cell, level: number, lift = 0): [Pixel, Pixel, Pixel, Pixel] {
  const { x, y } = cellToScreen(cell, level, lift);
  return [
    { x, y: y - TILE_H / 2 },
    { x: x + TILE_W / 2, y },
    { x, y: y + TILE_H / 2 },
    { x: x - TILE_W / 2, y },
  ];
}

/**
 * Every cell of a board, from the front of it to the back: the largest `x + y` first, which is the cell
 * nearest the viewer. Cells on the same diagonal touch but never cover each other, so their order
 * among themselves only has to be stable; it runs left to right.
 */
function cellsFrontToBack(size: BoardSize): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) cells.push({ x, y });
  }
  return cells.sort((a, b) => b.x + b.y - (a.x + a.y) || a.x - b.x);
}

/**
 * Whether a point is inside the silhouette of a cell: its top face swept straight down by the height
 * of its block, so the lowest edge is the ground diamond's. A flat cell's silhouette is its top face.
 * Sweeping a diamond down a segment widens it by what it loses in the sideways direction, which is the
 * closed form below.
 */
function insideBlock(point: Pixel, cell: Cell, level: number, lift: number): boolean {
  const centre = cellToScreen(cell, level, lift);
  const dx = Math.abs(point.x - centre.x) / (TILE_W / 2);
  if (dx > 1) return false;

  const slack = (1 - dx) * (TILE_H / 2);
  const drop = level * HZ;
  return point.y >= centre.y - slack && point.y <= centre.y + drop + slack;
}

/**
 * The cell of `size` under a point, or null. `levelAt` gives each cell's level, and a cell it answers
 * `NO_FLOOR` for is skipped outright: a gap has nothing to stand on and nothing to aim at.
 *
 * Cells are tested in the order they are drawn over one another, so a click lands on the cell the
 * player sees: a wall's side face belongs to the wall, not to the flat cell hidden behind it (DT-61).
 * A point outside the board the state carries is on nothing at all.
 */
export function cellAt(
  point: Pixel,
  size: BoardSize,
  levelAt: (cell: Cell) => number,
  lift = 0,
): Cell | null {
  // Only the cells with a floor are ever tested, and each is asked its level once: a gap is neither a
  // top face to aim at nor a block to fall on.
  const floors = cellsFrontToBack(size)
    .map((cell) => ({ cell, level: levelAt(cell) }))
    .filter(({ level }) => level !== NO_FLOOR);

  // Front to back, the first silhouette that holds the point is the one drawn over the others there.
  for (const { cell, level } of floors) {
    if (insideBlock(point, cell, level, lift)) return cell;
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
