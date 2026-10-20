// What the view does when a building stands between the camera and the fight. Plain rules over the
// board and the view, no rendering.
//
// None of this is a rule of the game: for the engine the building is whole, and it blocks movement and
// sight exactly as it always did. It is only how the view draws it, so the player can see the ground
// they are being asked to fight over.
import type { BoardSize, Cell } from './grid';

/** From this many levels up, a building may hide what stands behind it in the view. */
export const CUTAWAY_MIN_LEVEL = 4;

/** The level a cut building is drawn at: still a block, but low enough to see over. */
export const CUTAWAY_LEVEL = 2;

/** What a building that covers something is drawn at, so what it hides shows through it. */
export const COVERED_ALPHA = 0.28;

/** The neighbours behind a cell in the view: the ground a building can be hiding. */
const BEHIND: readonly Cell[] = [
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: -1 },
];

/** A rectangle on the canvas. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Something drawn on the canvas: the rectangle it covers, and how near the viewer it stands. The depth
 * is the draw order (`depthOfCell`), so a greater one is drawn over a lesser one.
 */
export interface Drawn {
  box: Box;
  depth: number;
}

/** Whether a building is tall enough for the view to consider cutting it down. */
export function isTallBuilding(level: number): boolean {
  return level >= CUTAWAY_MIN_LEVEL;
}

/**
 * The level a cell is drawn at in the current view. A building tall enough that hides playable ground
 * behind it — any of the neighbours at `x - 1`, `y - 1`, or the diagonal between them, that is not a
 * building — is lowered so that ground can be seen. Everything else is drawn at its own level.
 *
 * The cell and its neighbours are read in the view's own coordinates, so which ground counts as
 * "behind" follows the camera rather than the map.
 */
export function cutawayLevel(
  cell: Cell,
  level: number,
  size: BoardSize,
  isBuilding: (cell: Cell) => boolean,
): number {
  if (!isBuilding(cell) || !isTallBuilding(level)) return level;

  const hidesGround = BEHIND.some((offset) => {
    const behind = { x: cell.x + offset.x, y: cell.y + offset.y };
    const onBoard =
      behind.x >= 0 && behind.y >= 0 && behind.x < size.width && behind.y < size.height;
    return onBoard && !isBuilding(behind);
  });

  return hidesGround ? CUTAWAY_LEVEL : level;
}

/** Whether a building covers what is drawn in `target`, and so has to be drawn translucent. */
export function covers(building: Drawn, target: Drawn): boolean {
  // Only what stands behind it: a building in front of a unit hides nothing.
  if (target.depth >= building.depth) return false;

  const a = building.box;
  const b = target.box;
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
