// Turning the view by right angles. Plain arithmetic over the board, no Phaser and no map data.
//
// The map itself never turns, and neither does the engine: the client picks the side it looks from, and
// every cell of the map is read through this rotation before it is drawn. A tap walks the same road
// backwards (`unrotateCell`), so the cell the player sees is the cell the server is told about.
import type { BoardSize, Cell } from './grid';

/** How many views there are: one per right angle. */
export const VIEWS = 4;

/** Which side of the map the camera is looking from, as the panel names it. */
export type ViewDirection = 'north' | 'east' | 'south' | 'west';

const DIRECTIONS: readonly ViewDirection[] = ['north', 'east', 'south', 'west'];

/**
 * Where a cell of the map ends up in a view turned `steps` times. One step sends `(x, y)` to
 * `(N - 1 - y, x)`, which is a quarter turn of the square, and each step reads the board by the size it
 * has at that step, so a board that is not square turns correctly too.
 */
export function rotateCell(cell: Cell, steps: number, size: BoardSize): Cell {
  let { x, y } = cell;
  let { width, height } = size;

  for (let step = 0; step < viewTurns(steps); step += 1) {
    const turnedX = height - 1 - y;
    const turnedY = x;
    x = turnedX;
    y = turnedY;
    [width, height] = [height, width];
  }

  return { x, y };
}

/**
 * The cell of the map that a cell of the view came from: what a tap on the canvas has to answer before
 * it names anything to the server. `size` is the size of the view the cell is in.
 */
export function unrotateCell(cell: Cell, steps: number, size: BoardSize): Cell {
  return rotateCell(cell, VIEWS - viewTurns(steps), size);
}

/** How many cells the view has, which is the map's own size with its sides swapped on odd views. */
export function rotatedSize(size: BoardSize, steps: number): BoardSize {
  return viewTurns(steps) % 2 === 1 ? { width: size.height, height: size.width } : size;
}

/** The side the camera looks from, for the label on the camera panel. */
export function viewDirection(steps: number): ViewDirection {
  return DIRECTIONS[viewTurns(steps)];
}

/**
 * A count of steps of any size, read as one of the four views: how many right angles the view is from
 * the map's own, counted the way round the map is turned.
 */
export function viewTurns(steps: number): number {
  return ((steps % VIEWS) + VIEWS) % VIEWS;
}
