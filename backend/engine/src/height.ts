// What the relief of the map does to a shot (ADR 0015): the chance to hit, and the reach.
//
// Height buys accuracy and distance, never damage. The one damage modifier of the game belongs to the
// direction table (facing.ts), so a rooftop changes how likely a shot is and how far it carries, and
// what it does when it lands stays the weapon's business.
import { levelAt } from './board';
import type { Board, Position } from './types';

/** What shooting from a level buys, on top of the accuracy and the reach of the weapon. */
export interface HeightBonus {
  /** Points added to the chance to hit, out of 100. */
  hit: number;
  /** Cells added to the reach. The reach can be shortened, never taken away. */
  range: number;
}

/** The steepest difference the table reads: a drop further than this is read as this. */
const HEIGHT_MAX = 2;

/** One row per level of difference, from two or more below to two or more above. */
const HEIGHT_TABLE: readonly HeightBonus[] = [
  { hit: -10, range: -1 },
  { hit: -5, range: 0 },
  { hit: 0, range: 0 },
  { hit: 5, range: 0 },
  { hit: 10, range: 1 },
];

/** The levels a shooter stands above its target. Negative when it shoots up. */
export function heightDifference(board: Board, attacker: Position, target: Position): number {
  return levelAt(board, attacker) - levelAt(board, target);
}

/** The row of the table a difference in levels reads. Saturates at two levels, above and below. */
export function heightBonus(levelsAbove: number): HeightBonus {
  const clamped = Math.max(-HEIGHT_MAX, Math.min(HEIGHT_MAX, levelsAbove));
  // The table is indexed from its lowest row, so the middle of it is the difference of zero.
  return HEIGHT_TABLE[clamped + HEIGHT_MAX];
}

/** The row of the table the two cells read. */
export function heightAdvantage(board: Board, attacker: Position, target: Position): HeightBonus {
  return heightBonus(heightDifference(board, attacker, target));
}

/** The least a unit has to be for the reach rule to read it: where it stands and how far it reaches. */
export interface Shooter {
  readonly position: Position;
  readonly range: number;
}

/**
 * How far `shooter` reaches at `target`, which is a property of the pair and not of the unit alone: a
 * shot from a rooftop carries a cell further, and one from the alley a cell less. The floor of 1 is
 * what stops a unit shooting up from losing the ability to shoot at all.
 */
export function effectiveRange(board: Board, shooter: Shooter, target: Position): number {
  return Math.max(1, shooter.range + heightAdvantage(board, shooter.position, target).range);
}
