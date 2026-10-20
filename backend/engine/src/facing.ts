// Which way a unit looks, and what that costs a shot (ADR 0014).
//
// Everything here is read in the board's own frame: east is +x and north is −y, so a facing is a
// unit vector on the grid and the classification of a shot is a dot product. Integer arithmetic all
// the way down, so a replay reads the same answer from the same two positions.
import type { Direction, Facing, Position } from './types';

/** The least a unit has to be for a shot to be classified: where it stands and which way it faces. */
export interface FacingUnit {
  readonly position: Position;
  readonly facing: Facing;
}

/** The unit vector of a facing, in the board's frame. */
function axisOf(facing: Facing): Position {
  if (facing === 'N') return { x: 0, y: -1 };
  if (facing === 'S') return { x: 0, y: 1 };
  if (facing === 'E') return { x: 1, y: 0 };
  return { x: -1, y: 0 };
}

/**
 * The facing a step from `from` to `to` leaves. The larger absolute component wins and a tie goes to
 * the horizontal, which is the order the walk already uses to break a diagonal (ADR 0010).
 */
export function facingOf(from: Position, to: Position): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
  return dy >= 0 ? 'S' : 'N';
}

/**
 * Where `attacker` stood around `target`, read against the target's own facing: in front of it, beside
 * it, or behind it. The sign of the dot product between the facing of the target and the direction
 * from the target to the attacker decides, so the four diagonal cells read as front or rear according
 * to the way they lean. The facing of the attacker never enters the answer.
 */
export function attackDirection(target: FacingUnit, attacker: FacingUnit): Direction {
  const facing = axisOf(target.facing);
  const towards = {
    x: Math.sign(attacker.position.x - target.position.x),
    y: Math.sign(attacker.position.y - target.position.y),
  };
  const dot = facing.x * towards.x + facing.y * towards.y;

  if (dot > 0) return 'front';
  return dot < 0 ? 'rear' : 'flank';
}

/** What a shot from one direction buys, on top of the accuracy and the damage of the weapon. */
export interface DirectionBonus {
  /** Points added to the chance to hit, out of 100. */
  hit: number;
  /** Points added to the damage of a shot that lands. */
  damage: number;
}

/**
 * The one damage modifier of the game, and the accuracy that comes with it (ADR 0014). The values are
 * provisional: m3-04 tunes them, and the tests are written against the table rather than the numbers.
 */
export const DIRECTION_BONUS: Readonly<Record<Direction, DirectionBonus>> = {
  front: { hit: 0, damage: 0 },
  flank: { hit: 10, damage: 1 },
  rear: { hit: 15, damage: 2 },
};
