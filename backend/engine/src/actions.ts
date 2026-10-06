// Validation and event building for the three actions of M1. Nothing here changes the state: an
// accepted action is turned into events, and events.ts applies them.
import { distance, inBounds } from './board';
import { currentUnitId, isAlive, unitById } from './initiative';
import { findPath, movementProfile, stepAllowed } from './movement';
import { nextInt } from './rng';
import { hasLineOfSight } from './sight';
import type {
  Action,
  Event,
  MatchState,
  Position,
  RejectReason,
  Rng,
  Team,
  Unit,
  UnitId,
  UnitState,
} from './types';

type MoveAction = Extract<Action, { type: 'move' }>;
type AttackAction = Extract<Action, { type: 'attack' }>;
type ReloadAction = Extract<Action, { type: 'reload' }>;

/**
 * The single place a hit is decided. M1 reads the attacker's accuracy; Nerve, height and cover will
 * be folded in here later without changing the shape of the state.
 */
export function resolveHit(attacker: Unit, target: Unit, rng: Rng): boolean {
  return nextInt(rng, 1, 100) <= attacker.hitChance;
}

function teamHasUnits(state: MatchState, team: Team): boolean {
  return state.units.some((unit) => unit.team === team && isAlive(unit));
}

export function isGameOver(state: MatchState): boolean {
  return !teamHasUnits(state, 'A') || !teamHasUnits(state, 'B');
}

function occupantAt(state: MatchState, position: Position): UnitState | undefined {
  // A living unit and a body both occupy their tile; a permanently dead unit does not.
  return state.units.find(
    (unit) =>
      !unit.permanentlyDead && unit.position.x === position.x && unit.position.y === position.y,
  );
}

/**
 * Returns the reason to refuse the action, or null to accept it. The order of the checks is the
 * contract: game over, turn, then the geometry of a move or the target of an attack.
 */
export function validateAction(state: MatchState, action: Action): RejectReason | null {
  if (isGameOver(state)) return 'game-over';
  if (action.actor !== currentUnitId(state)) return 'not-your-turn';

  if (action.type === 'move') return validateMove(state, action);
  if (action.type === 'attack') return validateAttack(state, action);
  if (action.type === 'reload') return validateReload(state, action);
  return null;
}

/** A unit with a magazine that is empty attacks in melee: adjacent only. */
function isMelee(unit: UnitState): boolean {
  return unit.magazine !== null && unit.ammo === 0;
}

/** A unit with a magazine that still has rounds spends one round on each attack. */
function firesRound(unit: UnitState): boolean {
  return unit.magazine !== null && unit.ammo > 0;
}

/** Melee damage: half the attack, rounded down, as a shift so no division is used. */
function meleeDamage(attack: number): number {
  return attack >> 1;
}

function validateReload(state: MatchState, action: ReloadAction): RejectReason | null {
  const actor = unitById(state, action.actor);
  if (actor.magazine === null) return 'no-magazine';
  if (state.hasActed) return 'already-acted';
  if (actor.ammo >= actor.magazine) return 'magazine-full';
  return null;
}

/**
 * Whether the refusal is the step's own fault: a forbidden step onto a cell one step away is the
 * height rule (D3), while anything further away is a route the profile does not open.
 */
function isForbiddenStep(state: MatchState, actor: UnitState, to: Position): boolean {
  if (distance(actor.position, to) !== 1) return false;
  return !stepAllowed(movementProfile(actor), state.board, actor.position, to);
}

function validateMove(state: MatchState, action: MoveAction): RejectReason | null {
  const actor = unitById(state, action.actor);
  const to = action.to;

  if (!inBounds(state.board, to)) return 'out-of-bounds';
  if (occupantAt(state, to)) return 'cell-occupied';
  // The engine finds the walk: the action names the destination alone (ADR 0010, D1).
  if (findPath(state, actor.id, to) === null) {
    return isForbiddenStep(state, actor, to) ? 'height-step-too-high' : 'no-path';
  }
  // The turn is move first, then one action (plan section 2): no movement once the action is spent.
  if (state.hasActed) return 'already-acted';
  return null;
}

function validateAttack(state: MatchState, action: AttackAction): RejectReason | null {
  if (state.hasActed) return 'already-acted';

  const attacker = unitById(state, action.actor);
  const target = state.units.find((unit) => unit.id === action.target);

  if (!target || !isAlive(target)) return 'target-invalid';
  if (target.id === attacker.id || target.team === attacker.team) return 'target-invalid';
  const reach = isMelee(attacker) ? 1 : attacker.range;
  if (distance(attacker.position, target.position) > reach) return 'target-out-of-range';
  if (!hasLineOfSight(state.board, attacker.position, target.position)) return 'no-line-of-sight';
  return null;
}

/** The unit that takes the turn after the current one, wrapping to the start of the queue. */
function nextUnitId(state: MatchState): UnitId {
  return state.initiative[(state.currentIndex + 1) % state.initiative.length];
}

/**
 * Builds the events of an accepted action, in order. Only the attack draws from the rng, so a caller
 * that passes a copy of the generator leaves the original match untouched.
 */
export function buildEvents(state: MatchState, action: Action, rng: Rng): Event[] {
  if (action.type === 'endTurn') {
    const next = nextUnitId(state);
    // The round rises when the order wraps back to the first unit.
    const wraps = state.currentIndex + 1 >= state.initiative.length;
    const round = wraps ? state.round + 1 : state.round;

    const events: Event[] = [{ type: 'turn-ended', actor: action.actor, next, round }];
    // Bodies whose time is up are removed as the new round starts, in setup order.
    for (const unit of state.units) {
      if (
        unit.defeated &&
        !unit.permanentlyDead &&
        unit.corpseExpiresAtRound !== null &&
        unit.corpseExpiresAtRound <= round
      ) {
        events.push({ type: 'corpse-removed', target: unit.id });
      }
    }
    return events;
  }

  if (action.type === 'move') {
    const actor = unitById(state, action.actor);
    const walk = findPath(state, actor.id, action.to);
    // Validation walked the same state, so an accepted move always has a path.
    if (walk === null) {
      throw new RangeError(`no path to the destination of an accepted move: ${action.to.x},${action.to.y}`);
    }

    return [
      {
        type: 'moved',
        actor: actor.id,
        from: { x: actor.position.x, y: actor.position.y },
        to: { x: action.to.x, y: action.to.y },
        path: walk.path,
      },
    ];
  }

  if (action.type === 'reload') {
    return [{ type: 'reloaded', actor: action.actor }];
  }

  const attacker = unitById(state, action.actor);
  const target = unitById(state, action.target);
  const hit = resolveHit(attacker, target, rng);
  const damage = hit ? (isMelee(attacker) ? meleeDamage(attacker.attack) : attacker.attack) : 0;
  const events: Event[] = [
    {
      type: 'attacked',
      actor: attacker.id,
      target: target.id,
      hit,
      damage,
      rngState: rng.state,
      ammoSpent: firesRound(attacker),
    },
  ];

  if (target.health - damage <= 0) events.push({ type: 'unit-defeated', target: target.id });
  return events;
}
