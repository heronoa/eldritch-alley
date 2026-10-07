// Cover: the chest-high prop a unit stands behind, and what it costs the shooter (ADR 0012).
//
// A `wall` blocks the line of sight (`sight.ts`); a `cover` prop does not — the shot passes over it, and
// what it costs is accuracy. The rule is read off the board alone and moves in whole points (ADR 0005),
// so a replay applies exactly what the live match applied.
//
// Which neighbour counts as "between the two" is an integer test. The sign vector points from the target
// to the attacker, and a neighbour offset `d` lies on that side when its dot product with the vector is
// positive: `d.x * ax + d.y * ay > 0`. For an attacker due east of the target (ax = 1, ay = 0) that is
// the three neighbours with x = 1, which are exactly the cells the shot crosses to reach the target.
import { inBounds, propAt } from './board';
import type { Board, Position } from './types';

/**
 * Points of the 0..100 accuracy that standing behind cover takes away. One constant, the shape
 * `corpseRounds` already has, so a balance pass tunes a number and not a rule (ADR 0012 § D2).
 */
export const COVER_HIT_PENALTY = 25;

/**
 * Whether the target of a shot stands behind cover from `attacker`. True when a `cover` prop stands on
 * one of the eight cells around the target that lies on the side the attacker is on — the crate the
 * target is crouched behind, not the one behind its back.
 *
 * Only the neighbours count, for both ends of the shot (ADR 0013): a prop under the feet is under the
 * feet of whoever stands there, and a unit on top of the car is more exposed than one beside it, not
 * covered all round. The rule is symmetric — the cell the attacker stands on never counts either.
 *
 * Pure, integer, no state; a position outside the board is a programming error and throws, like
 * `levelAt`.
 */
export function coverFor(board: Board, target: Position, attacker: Position): boolean {
  if (!inBounds(board, target)) {
    throw new RangeError(`position outside the board: ${target.x},${target.y}`);
  }
  if (!inBounds(board, attacker)) {
    throw new RangeError(`position outside the board: ${attacker.x},${attacker.y}`);
  }

  const ax = Math.sign(attacker.x - target.x);
  const ay = Math.sign(attacker.y - target.y);
  // The two share a cell: there is no side for a prop to be on, and a shot at oneself is not a shot.
  if (ax === 0 && ay === 0) return false;

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (dx * ax + dy * ay <= 0) continue;

      const cell = { x: target.x + dx, y: target.y + dy };
      if (cell.x === attacker.x && cell.y === attacker.y) continue;
      if (propAt(board, cell, 'cover') !== undefined) return true;
    }
  }

  return false;
}
