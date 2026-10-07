// Geometry of the grid. Height is a property of the cell, so a unit only carries (x, y); so is the prop
// that stands on it.
import type { Board, Position, Prop, PropKind } from './types';

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

/** The props of a board. A setup that left them out has none, the way a unit without a profile walks. */
export function propsOf(board: Board): readonly Prop[] {
  return board.props ?? [];
}

/**
 * The prop standing on a cell, or undefined when none does. A position outside the board answers
 * undefined rather than throwing, because the rule that reads the neighbours of a cell (ADR 0012)
 * walks off the edge of the board and nothing stands there.
 */
export function propAt(board: Board, position: Position, kind?: PropKind): Prop | undefined {
  if (!inBounds(board, position)) return undefined;

  return propsOf(board).find(
    (prop) =>
      prop.position.x === position.x &&
      prop.position.y === position.y &&
      (kind === undefined || prop.kind === kind),
  );
}
