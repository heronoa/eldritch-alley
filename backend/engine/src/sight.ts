// Line of sight between two cells, decided by the height of the cells on the line between them.
//
// The eye of a unit is one level above the cell it stands on. A shot from A to T runs from the eye of
// A to the eye of T, and a cell on the way blocks it when its level is above that line at that step.
// The line is scaled by the distance so every value stays an integer (ADR 0005):
//
//   level(cell_i) * n  >  eyeA * n + (eyeT - eyeA) * i
//
// where n is the Chebyshev distance and i is the step of the cell, from 1 to n - 1. A cell at the eye
// level is on the line and not above it, so it does not block. Two adjacent cells have no cell between
// them and are always visible.
//
// A `wall` prop blocks the line the same way a tall cell does, and only a `wall`: a chest-high crate
// does not stop the shot, it costs the shooter accuracy (`cover.ts`, ADR 0012). Only the cells strictly
// between the two ends are read, so a wall on either end — under the shooter or under the target —
// blocks nothing, which is the limit the height rule already had.
import { distance, levelAt, propAt } from './board';
import type { Board, Position } from './types';

/** The eye height of a unit standing on a cell. Throws outside the board, like `levelAt`. */
function eyeHeight(board: Board, position: Position): number {
  return levelAt(board, position) + 1;
}

/**
 * The cells of the line from `from` to `to`, both ends included, one cell per step. The classic integer
 * Bresenham line, so the same pair of cells always gives the same cells (ADR 0005).
 */
function lineCells(from: Position, to: Position): Position[] {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;

  let x = from.x;
  let y = from.y;
  let err = dx - dy;
  const cells: Position[] = [{ x, y }];

  while (x !== to.x || y !== to.y) {
    const doubled = err * 2;
    if (doubled > -dy) {
      err -= dy;
      x += sx;
    }
    if (doubled < dx) {
      err += dx;
      y += sy;
    }
    cells.push({ x, y });
  }

  return cells;
}

/** Whether the line is clear read from `from` to `to`. One direction alone: see `hasLineOfSight`. */
function clearLine(board: Board, from: Position, to: Position): boolean {
  // Read before the early return, so a position outside the board throws whatever the distance is.
  const fromEye = eyeHeight(board, from);
  const toEye = eyeHeight(board, to);
  const steps = distance(from, to);
  if (steps < 2) return true;

  // The sight line rises from the eye of `from` to the eye of `to`; a cell above it at its own step,
  // and not on it, blocks the shot. A wall on the way blocks it however low the ground is.
  const cells = lineCells(from, to);
  for (let i = 1; i < cells.length - 1; i++) {
    if (levelAt(board, cells[i]) * steps > fromEye * steps + (toEye - fromEye) * i) return false;
    if (propAt(board, cells[i], 'wall') !== undefined) return false;
  }
  return true;
}

/**
 * Whether a unit on `from` sees a unit on `to`. Symmetric (decision D2): a diagonal line steps through
 * different cells read one way than the other, so the shot is clear only when both readings are. Pure,
 * no state, no I/O; a position outside the board is a programming error and throws, like `levelAt`.
 */
export function hasLineOfSight(board: Board, from: Position, to: Position): boolean {
  return clearLine(board, from, to) && clearLine(board, to, from);
}
