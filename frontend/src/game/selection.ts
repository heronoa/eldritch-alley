// Click to intent. Pure: it reads the public state and answers what the click means, so the scene
// only has to draw the result. The server still decides whether the action is legal.
// The engine's own rules, imported rather than copied: the preview has to refuse exactly what the
// server refuses (EA-1 D1). The import goes through the engine's package entry, so the client sees
// only what `index.ts` exports; the engine ships no Node, so the bundle is safe.
import { abilityById, findPath, hasLineOfSight } from '@eldritch-alley/engine';
import type {
  AbilityDefinition,
  ClientAction,
  PublicState,
  RejectReason,
  Team,
  UnitId,
  UnitState,
} from '../protocol';
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
  /**
   * A target the engine would turn down (EA-8). It carries no action, so nothing can be sent from it:
   * it exists so the player is told why the enemy they pressed is not a target instead of nothing
   * happening, and the reason is the engine's own code, so the sentence is the one a refusal gets.
   */
  | { kind: 'refused'; reason: RejectReason }
  | { kind: 'send'; action: ClientAction };

export interface ClickInput {
  state: PublicState;
  /** The unit the player has selected, or null when nothing is selected. */
  selectedId: string | null;
  cell: Cell;
  /**
   * The unit whose figure the press landed on, when it landed on one (EA-8), or null for a press on
   * the floor. The figure stands over the cells behind it, so this is what the player aimed at where
   * the cell under the finger is what the press covered.
   */
  targetId?: UnitId | null;
  humanTeam: Team;
  /**
   * The mode the bar has armed (EA-7), or `inspect` when the caller asks the board its own question.
   * Only the ability mode changes what a press means: the other modes are filters `applyMode` puts on
   * top of the intent, and the click reads the same in all of them.
   */
  mode?: ActionMode;
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

/**
 * Why an attack nobody can pay for is refused, or null when the unit can pay (ADR 0011). The pool is
 * the unit's own kind, so the sentence the player is given names the resource to refill: a magazine
 * to reload, or energy to meditate.
 */
function resourceRefusal(unit: UnitState): RejectReason | null {
  if (unit.magazine === null || unit.ammo > 0) return null;
  return unit.resourceKind === 'mana' ? 'no-mana' : 'no-ammunition';
}

/**
 * Why the unit cannot pay `cost` points of its own pool for an ability, or null when it can (ADR 0011,
 * ADR 0016 §7). The pool is read with the same rule the engine reads it with, so the sentence the player
 * is given is the one the server would answer with.
 */
function poolRefusal(unit: UnitState, cost: number): RejectReason | null {
  if (unit.ammo >= cost) return null;
  return unit.resourceKind === 'mana' ? 'no-mana' : 'no-ammunition';
}

/**
 * The ability the unit carries in its first active set, resolved in the match's own catalog, or undefined
 * when the slots name none and when the catalog defines none of them (ADR 0016 §6).
 */
function carriedAbility(state: PublicState, unit: UnitState): AbilityDefinition | undefined {
  const id = unit.abilities.activeSets[0];
  if (id === null) return undefined;
  return abilityById(state.catalog, id);
}

/**
 * Why the ability cannot be aimed at `cell`, or null when it can. The rules, and the order they are asked
 * in, are the engine's own `validateUseAbility` (ADR 0016 §7): the pool that cannot pay the cost, the cell
 * off the board, the aim past the reach, and the one out of sight when the definition needs it.
 */
function aimRefusal(
  state: PublicState,
  caster: UnitState,
  ability: AbilityDefinition,
  cell: Cell,
): RejectReason | null {
  const unpaid = poolRefusal(caster, ability.cost);
  if (unpaid !== null) return unpaid;

  if (cell.x < 0 || cell.y < 0 || cell.x >= state.board.width || cell.y >= state.board.height) {
    return 'out-of-bounds';
  }
  if (chebyshev(caster.position, cell) > ability.range) return 'target-out-of-range';
  if (ability.needsSight && !hasLineOfSight(state.board, caster.position, cell)) {
    return 'no-line-of-sight';
  }

  return null;
}

/**
 * The unit a press may act with: the one selected, still standing, and the one whose turn it is. Every
 * branch that acts reads it here, so the three conditions are asked once and in one order. The client
 * only ever acts with the unit on turn — the server refuses anything else.
 */
function actingUnit(state: PublicState, selectedId: string | null): UnitState | undefined {
  if (selectedId === null) return undefined;

  const selected = state.units.find((unit) => unit.id === selectedId);
  if (!selected || selected.defeated) return undefined;

  return state.initiative[state.currentIndex] === selected.id ? selected : undefined;
}

/**
 * What a press means while an ability is armed: the cell the press covered is the aim, whatever stands on
 * it (ADR 0016 §5). It is read before the selection and the attack, because an area reaches every body it
 * covers — the ally a heal is thrown at, and the ally a blast will hurt, which is what an effect that
 * spares nobody means (D2). A press the ability cannot be aimed at is refused in the engine's own words.
 */
function aimAbility(state: PublicState, selectedId: string | null, cell: Cell): Intent {
  const caster = actingUnit(state, selectedId);
  if (caster === undefined) return { kind: 'none' };

  const ability = carriedAbility(state, caster);
  if (ability === undefined) return { kind: 'refused', reason: 'ability-unknown' };

  const refusal = aimRefusal(state, caster, ability, cell);
  if (refusal !== null) return { kind: 'refused', reason: refusal };

  return {
    kind: 'send',
    action: { type: 'useAbility', abilityId: ability.id, to: { x: cell.x, y: cell.y } },
  };
}

/**
 * The unit a press named, when it landed on a figure rather than on a cell (EA-8). A unit the state
 * has removed for good is not drawn, so a press cannot name it: the cell under the point answers.
 */
function namedUnit(state: PublicState, targetId: UnitId | null | undefined): UnitState | undefined {
  if (targetId === null || targetId === undefined) return undefined;
  return state.units.find((unit) => unit.id === targetId && !unit.permanentlyDead);
}

/** What a click on `cell` means, given what is selected and whose turn it is. */
export function resolveClick({
  state,
  selectedId,
  cell,
  targetId = null,
  humanTeam,
  mode = 'inspect',
}: ClickInput): Intent {
  // An armed ability is aimed first: the action names a cell, never a unit, so the aim is read before
  // anything else the press could mean and the `Atacar`/`Mover` rules below never see it (EA-7).
  if (mode === 'ability') return aimAbility(state, selectedId, cell);

  // The figure the press landed on decides first: only a press that covered no figure is read against
  // the cell under it, which is what keeps a walk onto a free cell working (EA-8).
  const occupant = namedUnit(state, targetId) ?? occupantOf(state, cell);

  if (occupant && !occupant.defeated && occupant.team === humanTeam) {
    return { kind: 'select', unitId: occupant.id };
  }

  const selected = actingUnit(state, selectedId);
  if (selected === undefined) return { kind: 'none' };

  if (occupant && !occupant.defeated && occupant.team !== humanTeam) {
    // The rules of the engine's own `validateAttack`, in its own order, so the reason the player is
    // given here is the reason the server would answer with (EA-1 D1). Distance never shortens the
    // reach and never halves the damage: an attack is refused only for the rules below (ADR 0011).
    // The distance and the sight are read of the target's own cell: the press may well have covered
    // another one (EA-8).
    const refusal = resourceRefusal(selected);
    if (refusal !== null) return { kind: 'refused', reason: refusal };
    if (chebyshev(selected.position, occupant.position) > selected.range) {
      return { kind: 'refused', reason: 'target-out-of-range' };
    }
    if (!hasLineOfSight(state.board, selected.position, occupant.position)) {
      return { kind: 'refused', reason: 'no-line-of-sight' };
    }
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
 * The action each armed mode lets through, so a mode narrows a click to its own action and invents
 * nothing (EA-7). `inspect` sends nothing at all, and the ability mode answers with the action the
 * ability is sent as, which is the one mode whose name is not already the name of its action.
 */
const ACTION_OF_MODE: Readonly<Record<ActionMode, ClientAction['type'] | null>> = {
  inspect: null,
  move: 'move',
  attack: 'attack',
  ability: 'useAbility',
};

/**
 * Whether the armed mode lets an intent through. Nothing is sent until its button is armed: with the
 * mode at `inspect` a click only selects or inspects, and a move, an attack or an ability needs `Mover`,
 * `Atacar` or `Habilidade` pressed first. The action bar and the click share this one rule, so the mode
 * a button shows armed is the mode a click obeys.
 */
export function allowsIntent(mode: ActionMode, intent: Intent): boolean {
  // Selecting and inspecting are how the player looks at the board, whatever the mode is.
  if (intent.kind === 'select' || intent.kind === 'inspect') return true;
  // A refusal is not an action: it is what the player is told about a press that aimed at nothing the
  // turn can use, and a mode that narrowed the press away is exactly the case that needs the sentence.
  if (intent.kind === 'refused') return true;
  if (intent.kind === 'send') return intent.action.type === ACTION_OF_MODE[mode];
  return false;
}
