// Abilities as plain data (ADR 0016). The catalog is authored by the game-server and carried by the
// match, so this module knows no class and no ability name: it looks an id up, and it answers the cells
// an effect covers. That second answer is exported to the client, so the highlight and the rule that
// decides who is hit are the same function and cannot disagree (ADR 0016 §11).
import { inBounds } from './board';
import type { AbilityDefinition, PublicState, Position } from './types';

/**
 * The definition an id names, or undefined for an id no definition carries. The match always carries a
 * catalog, empty when the setup left one out, so a lookup never has to ask whether it is there.
 */
export function abilityById(
  catalog: readonly AbilityDefinition[],
  id: string,
): AbilityDefinition | undefined {
  return catalog.find((ability) => ability.id === id);
}

/**
 * Every cell the effect of `ability` covers when it is aimed at `to`, in bounds and `to` included
 * (ADR 0016 §11). A radius of 0 is the single cell; any other radius is a square in Chebyshev distance,
 * so its corners are inside it.
 *
 * An aim outside the board answers nothing: there is no area to paint and no unit to reach, which is the
 * same answer the attack area gives for a cell off the board. The caller refuses the use with
 * `out-of-bounds` long before this is asked.
 */
export function abilityCells(
  state: PublicState,
  to: Position,
  ability: AbilityDefinition,
): Position[] {
  if (!inBounds(state.board, to)) return [];

  const radius = ability.effect.radius;
  const cells: Position[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const cell = { x: to.x + dx, y: to.y + dy };
      // The board clips the box rather than the loop walking off it, so an effect at the edge covers
      // the cells that exist and nothing else.
      if (inBounds(state.board, cell)) cells.push(cell);
    }
  }

  return cells;
}
