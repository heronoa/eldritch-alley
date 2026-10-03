// What the human may do on this turn, and how the action bar narrows a click.
//
// A mode only ever filters the intent `resolveClick` produced: `selection.ts` stays the one place
// that knows the click rules. `reload` and `endTurn` have no board target and are sent straight
// from the button, so they never pass through here. The server still refuses anything illegal.
import type { PublicState, Team, UnitState } from '../protocol';
import { highlightedCells } from './highlight';
import type { Intent } from './selection';

export type ActionMode = 'inspect' | 'move' | 'attack';

/** The actions the engine would accept from the human right now. Hints for the pointer, not rules. */
export interface AvailableActions {
  canMove: boolean;
  canAttack: boolean;
  canReload: boolean;
  canEndTurn: boolean;
}

export interface ActionButton {
  id: 'move' | 'attack' | 'reload' | 'endTurn';
  /** Portuguese, because the player reads it. */
  label: string;
  enabled: boolean;
  /** The mode this button arms, or null for a button that sends at once. */
  mode: ActionMode | null;
}

/** The unit whose turn it is, or undefined in a match that is over. */
function actorOf(state: PublicState): UnitState | undefined {
  return state.units.find((unit) => unit.id === state.initiative[state.currentIndex]);
}

/** The action the acting unit is not allowed to take leaves the mode with nothing to do. */
export function settleMode(mode: ActionMode, available: AvailableActions): ActionMode {
  if (mode === 'move' && !available.canMove) return 'inspect';
  if (mode === 'attack' && !available.canAttack) return 'inspect';
  return mode;
}

/** Keeps only the intents the armed mode allows. A mode narrows, it never invents. */
export function applyMode(mode: ActionMode, intent: Intent): Intent {
  if (mode === 'inspect') return intent;
  if (intent.kind === 'select') return intent;
  if (intent.kind === 'send' && intent.action.type === mode) return intent;
  return { kind: 'none' };
}

export function availableActions(state: PublicState, humanTeam: Team): AvailableActions {
  const actor = actorOf(state);
  if (!actor || actor.defeated || actor.team !== humanTeam) {
    return { canMove: false, canAttack: false, canReload: false, canEndTurn: false };
  }

  const canAct = !state.hasActed;
  return {
    canMove: canAct && state.movementLeft > 0,
    // The button lights up exactly when the board would highlight a target.
    canAttack: canAct && highlightedCells({ state, selectedId: actor.id, mode: 'attack', humanTeam }).length > 0,
    canReload: canAct && actor.magazine !== null && actor.ammo < actor.magazine,
    // Ending the turn is always legal; it is how a player with nothing left to do passes.
    canEndTurn: true,
  };
}

export function actionButtons(state: PublicState, humanTeam: Team): ActionButton[] {
  const available = availableActions(state, humanTeam);

  return [
    { id: 'move', label: 'Mover', enabled: available.canMove, mode: 'move' },
    { id: 'attack', label: 'Atacar', enabled: available.canAttack, mode: 'attack' },
    { id: 'reload', label: 'Recarregar', enabled: available.canReload, mode: null },
    { id: 'endTurn', label: 'Terminar turno', enabled: available.canEndTurn, mode: null },
  ];
}
