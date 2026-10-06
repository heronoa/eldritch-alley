// Click to intent. Pure: it reads the public state and answers what the click means, so the scene
// only has to draw the result. The server still decides whether the action is legal.
// The engine's own rules, imported rather than copied: the preview has to refuse exactly what the
// server refuses (EA-1 D1). The engine ships no Node and no package dependency, so the bundle is safe.
import { findPath } from '../../../backend/engine/src/movement';
import { hasLineOfSight } from '../../../backend/engine/src/sight';
import type { ClientAction, Position, PublicState, Team, UnitState } from '../protocol';
import type { Cell } from '../view/grid';
import type { ActionMode } from './actions';

export type Intent =
  | { kind: 'none' }
  | { kind: 'select'; unitId: string }
  | { kind: 'send'; action: ClientAction }
  /**
   * The first tap of a move: the destination the tap armed, the walk the engine found to it, and what
   * the walk costs. It sends nothing; a second tap on the same cell confirms it (EA-7).
   */
  | { kind: 'move-preview'; to: Cell; path: Position[]; cost: number };

export interface ClickInput {
  state: PublicState;
  /** The unit the player has selected, or null when nothing is selected. */
  selectedId: string | null;
  cell: Cell;
  humanTeam: Team;
}

/** The unit standing on a cell, living or a body. A cell with a body is not empty. */
function occupantOf(state: PublicState, cell: Cell): UnitState | undefined {
  return state.units.find(
    (unit) => !unit.permanentlyDead && unit.position.x === cell.x && unit.position.y === cell.y,
  );
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
    if (!hasLineOfSight(state.board, selected.position, cell)) return { kind: 'none' };
    return { kind: 'send', action: { type: 'attack', target: occupant.id } };
  }

  if (!occupant) {
    // Any cell the unit reaches this turn is a destination; the walk to it is the engine's answer.
    const walk = findPath(state, selected.id, { x: cell.x, y: cell.y });
    if (walk !== null) {
      return { kind: 'move-preview', to: { x: cell.x, y: cell.y }, path: walk.path, cost: walk.cost };
    }
  }

  return { kind: 'none' };
}

/**
 * Whether the armed mode lets an intent through: a mode narrows what a click means, it never invents.
 * The action bar and the highlight share this one answer, so the cells that light up are exactly the
 * cells a click would act on.
 */
export function allowsIntent(mode: ActionMode, intent: Intent): boolean {
  if (mode === 'inspect') return true;
  // Selecting a unit is how the player moves the selection around, whatever the mode is.
  if (intent.kind === 'select') return true;
  if (intent.kind === 'send') return intent.action.type === mode;
  // A move takes two taps, so the first one arms a destination instead of sending the action.
  return intent.kind === 'move-preview' && mode === 'move';
}

/**
 * The second tap of a move: a tap on the cell the first tap armed sends it, and any other intent is
 * handed back as it was, so the first tap only ever arms. One tap never moves a unit (EA-7).
 */
export function confirmMove(armed: Cell | null, intent: Intent): Intent {
  if (armed === null || intent.kind !== 'move-preview') return intent;
  if (armed.x !== intent.to.x || armed.y !== intent.to.y) return intent;

  return { kind: 'send', action: { type: 'move', to: { x: intent.to.x, y: intent.to.y } } };
}
