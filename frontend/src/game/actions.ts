// What the human may do on this turn, and how the action bar narrows a click.
//
// A mode only ever filters the intent `resolveClick` produced: `selection.ts` stays the one place
// that knows the click rules. `reload` and `endTurn` have no board target and are sent straight
// from the button, so they never pass through here. The server still refuses anything illegal.
//
// The labels come from the catalog, keyed by the button's own id, so a button cannot be added
// without a word for it.
import { canStillAct } from '../../../backend/engine/src/actions';
import { reachableCells } from '../../../backend/engine/src/movement';
import { t } from '../i18n';
import type { PublicState, Team, UnitState } from '../protocol';
import { highlightedCells } from './highlight';
import { allowsIntent, type Intent } from './selection';

export type ActionMode = 'inspect' | 'move' | 'attack';

/** The actions the engine would accept from the human right now. Hints for the pointer, not rules. */
export interface AvailableActions {
  canMove: boolean;
  canAttack: boolean;
  canReload: boolean;
  canEndTurn: boolean;
  /**
   * Whether the unit on turn has nothing left to do, as the engine answers it (EA-4). It is the
   * question the automatic end of turn asks, and it is false on the bot's turn: what the bot has
   * left is the bot's business, and the player's countdown must never start for it.
   */
  nothingLeft: boolean;
}

export interface ActionButton {
  id: 'move' | 'attack' | 'reload' | 'endTurn';
  /** What the button says, in the language of the client. */
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
  return allowsIntent(mode, intent) ? intent : { kind: 'none' };
}

export function availableActions(state: PublicState, humanTeam: Team): AvailableActions {
  const actor = actorOf(state);
  if (!actor || actor.defeated || actor.team !== humanTeam) {
    return {
      canMove: false,
      canAttack: false,
      canReload: false,
      canEndTurn: false,
      nothingLeft: false,
    };
  }

  const canAct = !state.hasActed;
  return {
    // Movement needs a cell to end on, not only a budget: a walled-in unit has nothing to move.
    canMove: canAct && reachableCells(state, actor.id).length > 0,
    // The button lights up exactly when the board would highlight a target.
    canAttack: canAct && highlightedCells({ state, selectedId: actor.id, mode: 'attack', humanTeam }).length > 0,
    canReload: canAct && actor.magazine !== null && actor.ammo < actor.magazine,
    // Ending the turn is always legal; it is how a player with nothing left to do passes.
    canEndTurn: true,
    // The engine decides, so the countdown fires exactly when the server would have nothing to accept.
    nothingLeft: !canStillAct(state),
  };
}

export function actionButtons(state: PublicState, humanTeam: Team): ActionButton[] {
  const available = availableActions(state, humanTeam);

  const button = (id: ActionButton['id'], enabled: boolean, mode: ActionMode | null): ActionButton => ({
    id,
    label: t(`action.${id}`),
    enabled,
    mode,
  });

  return [
    button('move', available.canMove, 'move'),
    button('attack', available.canAttack, 'attack'),
    button('reload', available.canReload, null),
    button('endTurn', available.canEndTurn, null),
  ];
}
