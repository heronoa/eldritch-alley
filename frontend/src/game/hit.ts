// Where a press landed on the board: the unit whose figure covers the point, if any.
//
// A figure stands over the cells behind the one its feet rest on, so the cell under a press is not
// always the unit the player aimed at (EA-8, finding). The scene asks here first and falls back to
// the cell only when no drawn figure covers the point, which is what makes a press anywhere on a
// sprite a press on its unit.
//
// Pure: the caller says where a unit's feet are drawn and how forgiving the hit box is; nothing here
// knows about Phaser, the map, or the zoom.
import type { Position } from '../protocol';
import type { Pixel } from '../view/grid';
import { depthOfUnit } from '../view/iso';
import { containsPoint, type Rect } from '../view/layout';
import { SPRITE_SIZE } from '../view/unit-look';

/**
 * How far outside the figure a press still counts as a press on it, in screen pixels (D1). A finger
 * is not a pixel; the caller divides it by the zoom of the map, so the margin a thumb covers is the
 * same at every scale.
 */
export const HIT_MARGIN_PX = 4;

/**
 * What the hit test reads of a unit: where it stands, and whether it is still on the board. A unit
 * that was removed for good is not drawn at all, so nothing of it can be pressed.
 */
export interface HitUnit {
  position: Position;
  permanentlyDead: boolean;
}

/** How the board draws a unit, as the hit test needs it. */
export interface SpriteLayout {
  /** The point the feet of a unit rest on, in the space of the point being read. */
  anchorOf: (unit: HitUnit) => Pixel;
  /** How far outside the figure a press still counts, in the same space (D1). */
  margin: number;
}

/**
 * The box a figure standing on its feet at `anchor` is drawn in: the sprite, centred on the feet and
 * standing up from them, with the margin on every side.
 */
function spriteRect(anchor: Pixel, margin: number): Rect {
  return {
    x: anchor.x - SPRITE_SIZE.width / 2 - margin,
    y: anchor.y - SPRITE_SIZE.height - margin,
    width: SPRITE_SIZE.width + 2 * margin,
    height: SPRITE_SIZE.height + 2 * margin,
  };
}

/**
 * The unit whose figure covers the point, or null when no figure does. Two figures can overlap, and
 * the one drawn on top wins, so the press lands on the unit the player sees; the order is the depth
 * the board is drawn in (`iso.ts`), not the order the state happens to list the units in.
 */
export function unitAtPoint<T extends HitUnit>(
  units: readonly T[],
  point: Pixel,
  layout: SpriteLayout,
): T | null {
  let found: T | null = null;

  for (const unit of units) {
    if (unit.permanentlyDead) continue;
    if (!containsPoint(spriteRect(layout.anchorOf(unit), layout.margin), point)) continue;
    if (found === null || depthOfUnit(unit.position) > depthOfUnit(found.position)) found = unit;
  }

  return found;
}
