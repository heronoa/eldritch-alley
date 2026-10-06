// Click to intent. Pure: it reads the public state and answers what the click means, so the scene
// only has to draw the result. The server still decides whether the action is legal.
// The engine's own rules, imported rather than copied: the preview has to refuse exactly what the
// server refuses (EA-1 D1). The import goes through the engine's package entry, so the client sees
// only what `index.ts` exports; the engine ships no Node, so the bundle is safe.
import { findPath, hasLineOfSight } from '@eldritch-alley/engine';
import type { ClientAction, PublicState, Team, UnitState } from '../protocol';
import type { Cell } from '../view/grid';
import type { ActionMode } from './actions';

export type Intent =
  | { kind: 'none' }
  | { kind: 'select'; unitId: string }
  /**
   * The secondary gesture on a unit (EA-6): the inspection names the unit it asks about and carries no
   * action at all, so it is neither a selection nor a preview of anything. It changes nothing.
   */
  | { kind: 'inspect'; unitId: string }
  | { kind: 'send'; action: ClientAction };

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
    // Any cell the unit reaches this turn is a destination: the move is sent, and it stays pending
    // until it is confirmed or an action closes it (EA-5). The walk is the engine's answer.
    if (findPath(state, selected.id, { x: cell.x, y: cell.y }) !== null) {
      return { kind: 'send', action: { type: 'move', to: { x: cell.x, y: cell.y } } };
    }
  }

  return { kind: 'none' };
}

/**
 * What the secondary gesture on `cell` means: the unit standing there, and nothing else (EA-6). A cell
 * nobody holds, and a unit out of the fight — which covers no cells to show — answer `none`, which is
 * what closes an inspection that was open.
 */
export function resolveInspect(state: PublicState, cell: Cell): Intent {
  const occupant = occupantOf(state, cell);
  if (occupant === undefined || occupant.defeated) return { kind: 'none' };

  return { kind: 'inspect', unitId: occupant.id };
}

/**
 * Whether the armed mode lets an intent through. Nothing is sent until its button is armed: with the
 * mode at `inspect` a click only selects or inspects, and a move or an attack needs `Mover` or
 * `Atacar` pressed first. The action bar and the click share this one rule, so the mode a button
 * shows armed is the mode a click obeys.
 */
export function allowsIntent(mode: ActionMode, intent: Intent): boolean {
  // Selecting and inspecting are how the player looks at the board, whatever the mode is.
  if (intent.kind === 'select' || intent.kind === 'inspect') return true;
  if (intent.kind === 'send') return intent.action.type === mode;
  return false;
}
