// The badge a unit in cover wears over its head: which sides of it carry a cover prop, and the words
// the sprite writes for them.
//
// The rule of cover is the engine's (`coverFor`, ADR 0012), and it needs an attacker to answer. The
// badge has nobody shooting, so it reads the same eight neighbours the rule reads, from the target's
// end, and names them. The two are pinned together by a test, so the badge cannot drift from the rule
// it describes.
//
// A prop under the feet counts for nothing here, exactly as it counts for nothing in the rule
// (ADR 0013): standing on top of the car is a place to be seen from.
import { propAt } from '@eldritch-alley/engine';
import { t } from '../i18n';
import type { Board, Position } from '../protocol';

/** The eight sides of a cell, clockwise from the north edge of the map. */
export const COVER_SIDES = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const;

export type CoverSide = (typeof COVER_SIDES)[number];

/**
 * Where each side is, in the board's own frame (m3-02, D1): north is towards row 0 and east is
 * towards +x. The camera turns the view and never renames a side — a badge speaks about the board.
 */
const OFFSET: Record<CoverSide, Position> = {
  north: { x: 0, y: -1 },
  northeast: { x: 1, y: -1 },
  east: { x: 1, y: 0 },
  southeast: { x: 1, y: 1 },
  south: { x: 0, y: 1 },
  southwest: { x: -1, y: 1 },
  west: { x: -1, y: 0 },
  northwest: { x: -1, y: -1 },
};

/** The sides of `position` that carry a cover prop, in `COVER_SIDES` order. Empty when none does. */
export function coverSides(board: Board, position: Position): CoverSide[] {
  return COVER_SIDES.filter((side) => {
    const offset = OFFSET[side];
    const cell = { x: position.x + offset.x, y: position.y + offset.y };

    // Off the board `propAt` answers undefined, so a unit at the edge simply has fewer sides.
    return propAt(board, cell, 'cover') !== undefined;
  });
}

/** The names of the sides, in the player's language, as a list the language would write. */
function sideNames(sides: readonly CoverSide[]): string {
  const names = sides.map((side) => t(`hud.cover.${side}`));
  if (names.length === 1) return names[0];

  return `${names.slice(0, -1).join(', ')}${t('hud.cover.and')}${names[names.length - 1]}`;
}

/** The words written over the unit's head, in the player's language, or null for no badge. */
export function coverSentence(board: Board, position: Position): string | null {
  const sides = coverSides(board, position);
  if (sides.length === 0) return null;

  return t('hud.cover.sides', { sides: sideNames(sides) });
}
