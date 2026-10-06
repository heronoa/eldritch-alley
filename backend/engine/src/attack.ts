// The area a unit can shoot from where it stands: every cell within its reach that it can see.
//
// It counts cells, not enemies. A cell another unit stands on is in the area like an empty one, and
// what a click on each of them means is the client's question (EA-5, EA-8). The reach is the unit's
// `range`, so ammunition does not shrink the area: the highlight does not move with the resource
// state, and the refusal of a shot nobody can pay for is answered on the click (EA-14).
import { distance, inBounds } from './board';
import { hasLineOfSight } from './sight';
import type { Position, PublicState, UnitState } from './types';

/**
 * Every cell `unit` could aim at from `from`, occupied or not. Pure: it reads the board and the
 * unit's reach, never whose turn it is and never what the unit has left to shoot with. A unit that
 * is out of the fight covers nothing.
 */
export function attackArea(state: PublicState, from: Position, unit: UnitState): Position[] {
  // A unit out of the fight covers nothing, and a cell off the board has no line of sight to read.
  if (unit.defeated || !inBounds(state.board, from)) return [];

  const cells: Position[] = [];
  for (let y = 0; y < state.board.height; y += 1) {
    for (let x = 0; x < state.board.width; x += 1) {
      const cell = { x, y };
      const away = distance(from, cell);
      // The cell it stands on is not a target, and the reach is a ceiling.
      if (away === 0 || away > unit.range) continue;
      // A cell it cannot see is not a target either. The eye of the unit is one level above the cell
      // it stands on, which is the rule `hasLineOfSight` applies (EA-1).
      if (!hasLineOfSight(state.board, from, cell)) continue;
      cells.push(cell);
    }
  }
  return cells;
}
