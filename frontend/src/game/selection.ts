// Click to intent. Pure: it reads the public state and answers what the click means, so the scene
// only has to draw the result. The server still decides whether the action is legal.
import type { ClientAction, PublicState, Team, UnitState } from '../protocol';
import type { Cell } from '../view/grid';

export type Intent =
  | { kind: 'none' }
  | { kind: 'select'; unitId: string }
  | { kind: 'send'; action: ClientAction }
  | { kind: 'move-preview'; to: Cell };

export interface ClickInput {
  state: PublicState;
  /** The unit the player has selected, or null when nothing is selected. */
  selectedId: string | null;
  cell: Cell;
  humanTeam: Team;
}

/** The unit standing on a cell, living or a body. A cell with a body is not empty. */
function occupantOf(state: PublicState, cell: Cell): UnitState | undefined {
  return state.units.find((unit) => unit.position.x === cell.x && unit.position.y === cell.y);
}

function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Reach of the unit's attack: a spent magazine turns the shot into a melee blow. */
function reachOf(unit: UnitState): number {
  return unit.magazine !== null && unit.ammo === 0 ? 1 : unit.range;
}

/** What a click on `cell` means, given what is selected and whose turn it is. */
export function resolveClick({ state, selectedId, cell, humanTeam }: ClickInput): Intent {
  const occupant = occupantOf(state, cell);

  if (occupant && !occupant.defeated && occupant.team === humanTeam) {
    return { kind: 'select', unitId: occupant.id };
  }

  if (selectedId === null) return { kind: 'none' };

  const selected = state.units.find((unit) => unit.id === selectedId);
  if (!selected || selected.defeated) return { kind: 'none' };

  // The client only ever acts with the unit whose turn it is. The server refuses anything else.
  if (state.initiative[state.currentIndex] !== selected.id) return { kind: 'none' };

  if (occupant && !occupant.defeated && occupant.team !== humanTeam) {
    if (chebyshev(selected.position, cell) > reachOf(selected)) return { kind: 'none' };
    return { kind: 'send', action: { type: 'attack', target: occupant.id } };
  }

  if (!occupant && chebyshev(selected.position, cell) === 1) {
    return { kind: 'send', action: { type: 'move', to: { x: cell.x, y: cell.y } } };
  }

  return { kind: 'none' };
}
