// Geometry of the grid. Height is a property of the cell, so a unit only carries (x, y).
import type { Board, Position } from './types';

export function inBounds(board: Board, position: Position): boolean {
  return (
    position.x >= 0 && position.y >= 0 && position.x < board.width && position.y < board.height
  );
}

/** Reads the height level of a cell. A position outside the board is a programming error, not a rule violation. */
export function levelAt(board: Board, position: Position): number {
  if (!inBounds(board, position)) {
    throw new RangeError(`position outside the board: ${position.x},${position.y}`);
  }
  return board.levels[position.y * board.width + position.x];
}

/** Chebyshev distance: a diagonal step and a straight step both count as 1. */
export function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
