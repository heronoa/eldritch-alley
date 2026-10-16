// What the human may do on this turn, and how the action bar narrows a click.
//
// A mode only ever filters the intent `resolveClick` produced: `selection.ts` stays the one place
// that knows the click rules. `reload` and `endTurn` have no board target and are sent straight
// from the button, so they never pass through here. The server still refuses anything illegal.
//
// The labels come from the catalog, keyed by the button's own id, so a button cannot be added
// without a word for it.
import { abilityById, attackArea, canStillAct, reachableCells } from '@eldritch-alley/engine';
import { t } from '../i18n';
import type { AbilityDefinition, ClientAction, PublicState, Team, UnitState } from '../protocol';
import { allowsIntent, type Intent } from './selection';

export type ActionMode = 'inspect' | 'move' | 'attack' | 'ability';

/** The actions the engine would accept from the human right now. Hints for the pointer, not rules. */
export interface AvailableActions {
  canMove: boolean;
  canAttack: boolean;
  /**
   * Whether the unit on turn carries an ability its own slots name (ADR 0016). The button opens the menu
   * of what it carries, and the menu is where the cost is read: a pool that cannot pay dims the row and
   * not the button, so a player with an empty pool can still read what the ability does (EA-16, D3). The
   * aim that follows is refused in the engine's own words, so nothing illegal is ever offered.
   */
  canUseAbility: boolean;
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
  id: 'move' | 'attack' | 'ability' | 'reload' | 'endTurn';
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

/**
 * The ability the unit carries in its first active set, resolved in the match's own catalog, or
 * undefined when the slots name none and when the catalog defines none of them (ADR 0016 §6). Only
 * the first set is read: the second one, the reaction and the movement slots are unread this milestone.
 */
function carriedAbility(state: PublicState, unit: UnitState): AbilityDefinition | undefined {
  const id = unit.abilities.activeSets[0];
  if (id === null) return undefined;
  return abilityById(state.catalog, id);
}

/** The action the acting unit is not allowed to take leaves the mode with nothing to do. */
export function settleMode(mode: ActionMode, available: AvailableActions): ActionMode {
  if (mode === 'move' && !available.canMove) return 'inspect';
  if (mode === 'attack' && !available.canAttack) return 'inspect';
  if (mode === 'ability' && !available.canUseAbility) return 'inspect';
  return mode;
}

/** Keeps only the intents the armed mode allows. A mode narrows, it never invents. */
export function applyMode(mode: ActionMode, intent: Intent): Intent {
  return allowsIntent(mode, intent) ? intent : { kind: 'none' };
}

/**
 * Whether an escape/cancel gesture has anything to put down: an armed mode, or the ability menu left
 * open before a row was picked (EA-16) — which an armed mode alone does not cover, since the menu
 * opens before `mode` becomes `'ability'`.
 */
export function hasArmedAim(mode: ActionMode, menuOpen: boolean): boolean {
  return mode !== 'inspect' || menuOpen;
}

/** The answers already given for each state and team, by the state's identity (see `highlight.ts`). */
const answeredActions = new WeakMap<PublicState, Map<Team, AvailableActions>>();

/**
 * What the human may do now. A match asks this three times for every state (the handover, the
 * countdown and the action bar), so the answer is kept per state and team (DT-74).
 */
export function availableActions(state: PublicState, humanTeam: Team): AvailableActions {
  let byTeam = answeredActions.get(state);
  if (byTeam === undefined) {
    byTeam = new Map();
    answeredActions.set(state, byTeam);
  }

  const known = byTeam.get(humanTeam);
  if (known !== undefined) return known;

  const available = computeAvailableActions(state, humanTeam);
  byTeam.set(humanTeam, available);
  return available;
}

function computeAvailableActions(state: PublicState, humanTeam: Team): AvailableActions {
  const actor = actorOf(state);
  if (!actor || actor.defeated || actor.team !== humanTeam) {
    return {
      canMove: false,
      canAttack: false,
      canUseAbility: false,
      canReload: false,
      canEndTurn: false,
      nothingLeft: false,
    };
  }

  const canAct = !state.hasActed;
  const ability = carriedAbility(state, actor);
  return {
    // Movement needs a cell to end on, not only a budget: a walled-in unit has nothing to move.
    canMove: canAct && reachableCells(state, actor.id).length > 0,
    // The button opens the reach, so it is there whenever a cell can be shot at from here and somebody
    // is left to shoot at. Whether an enemy stands on one of those cells is what the click decides, and
    // arming the attack spends nothing.
    canAttack:
      canAct &&
      state.units.some((unit) => unit.team !== actor.team && !unit.defeated) &&
      attackArea(state, actor.position, actor).length > 0,
    // The ability the class carries, offered whether or not the pool can pay for it (EA-16, D3): the
    // menu it opens says what the use costs, and a row the pool cannot cover is the one that is dimmed.
    canUseAbility: canAct && ability !== undefined,
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
    button('ability', available.canUseAbility, 'ability'),
    button('reload', available.canReload, null),
    button('endTurn', available.canEndTurn, null),
  ];
}

/**
 * The action bar as the player actually presses it (M4 playtest fix, P3): `actionButtons` answers
 * what the rules allow, and this answers what a press does right now, on top of the rules. Locked
 * solid while a transition is still on screen — the whole bar, End Turn included, since nothing the
 * rules allow is safe to act on before the player has actually seen the turn it would act on. Short
 * of that, End Turn alone is relabelled to ask once whenever the unit on turn still has something it
 * could do instead, so a player is never one accidental click away from giving it up.
 */
export function presentButtons(
  buttons: readonly ActionButton[],
  options: { locked: boolean; confirmEndTurn: boolean },
): ActionButton[] {
  if (options.locked) return buttons.map((button) => ({ ...button, enabled: false }));
  if (!options.confirmEndTurn) return [...buttons];

  return buttons.map((button) =>
    button.id === 'endTurn' ? { ...button, label: t('action.confirmEndTurn') } : button,
  );
}

/** One of the two controls of a pending move: what it says, and the action it sends at once. */
export interface MoveChip {
  id: 'confirmMove' | 'cancelMove';
  label: string;
  action: ClientAction;
}

/**
 * The two controls of a pending move (EA-5, D4 and D6), offered only while a move waits to be
 * confirmed and only to the human: the bot neither cancels nor confirms its own runs (D7). They are
 * not buttons of the action bar — the bar is exactly full — so they float over the board above the
 * Move button, and the scene reads their rectangles the way it reads the bar's.
 */
export function moveChips(state: PublicState, humanTeam: Team): MoveChip[] {
  if (state.pendingMove === null) return [];

  const actor = actorOf(state);
  if (!actor || actor.team !== humanTeam) return [];

  return [
    { id: 'confirmMove', label: t('action.confirmMove'), action: { type: 'commitMove' } },
    { id: 'cancelMove', label: t('action.cancelMove'), action: { type: 'cancelMove' } },
  ];
}
