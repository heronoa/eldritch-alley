// Which way round a unit is drawn. Plain arithmetic over view-space positions, no Phaser.
//
// The sprites are billboards: they always face the camera, and there are no back views (DT-58). The
// only choice left is which way they look across the canvas, and the answer is "towards the enemy",
// worked out in screen space after the view has been turned.
import type { Position, Team } from '../protocol';

/**
 * A unit as the view sees it: its side, where it stands in the view (the cell already turned to face
 * the camera), and whether its body has left the map.
 */
export interface BillboardUnit {
  team: Team;
  position: Position;
  permanentlyDead: boolean;
  /** The class the unit's sheet row comes from, which is what decides the frame drawn for it. */
  primaryClass: string;
}

/**
 * Whether the drawing of a unit has to be mirrored. The sprite standing on the board does it with
 * `setFlipX`; the flat figure of a turn does it with a canvas transform. Both ask this one question,
 * so a unit cannot face one way at rest and the other way while the view turns.
 */
export function mirrored(unit: BillboardUnit, units: readonly BillboardUnit[]): boolean {
  return !facesRight(unit, units);
}

/**
 * Whether a unit is drawn the right way round, the way its sprite was drawn, rather than mirrored. It
 * faces the middle of the enemy squad — not the nearest soldier — so a squad occupying one part of the
 * map reads as one body of troops rather than a crowd of individuals.
 *
 * With no enemy left alive to face, each team falls back to the side it has always faced, so the two
 * still look at each other.
 */
export function facesRight(unit: BillboardUnit, units: readonly BillboardUnit[]): boolean {
  let sum = 0;
  let count = 0;

  for (const other of units) {
    if (other.team === unit.team || other.permanentlyDead) continue;
    sum += across(other.position);
    count += 1;
  }

  if (count === 0) return unit.team === 'A';
  return across(unit.position) < sum / count;
}

/** How far across the canvas a cell stands: the isometric projection puts a cell at `x - y`. */
function across(position: Position): number {
  return position.x - position.y;
}
