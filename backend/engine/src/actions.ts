// Validation and event building for the actions of a turn. Nothing here changes the state: an
// accepted action is turned into events, and events.ts applies them.
import { distance, inBounds } from './board';
import { COVER_HIT_PENALTY, coverFor } from './cover';
import { DIRECTION_BONUS, attackDirection } from './facing';
import { effectiveRange, heightBonus, heightDifference } from './height';
import { currentUnitId, isAlive, unitById } from './initiative';
import { findPath, movementProfile, reachableCells, stepAllowed } from './movement';
import { nextInt } from './rng';
import { hasLineOfSight } from './sight';
import type {
  Action,
  Direction,
  Event,
  MatchState,
  Position,
  PublicState,
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

/** Everything the board says about one shot, read once for the roll and for the event alike. */
interface Shot {
  /** Whether a cover prop stands between the two (ADR 0012). */
  cover: boolean;
  /** Where the attacker stands around the target, against the target's own facing (ADR 0014). */
  direction: Direction;
  /** The levels the attacker stands above the target: positive from above, negative from below. */
  stood: number;
}

/**
 * The board's half of a shot, read in one place. The chance below and the `attacked` event both build
 * on it, so the number that was rolled and the number the log explains can never be two answers.
 */
function shotBetween(state: PublicState, attacker: UnitState, target: UnitState): Shot {
  return {
    cover: coverFor(state.board, target.position, attacker.position),
    direction: attackDirection(target, attacker),
    stood: heightDifference(state.board, attacker.position, target.position),
  };
}

/**
 * The chance this attacker has of hitting this target, out of 100. Every modifier of a shot meets
 * here: the accuracy of the weapon, the cover between the two (ADR 0012), where the attacker stands
 * around the target (ADR 0014) and how far above it it stands (ADR 0015). It is one expression, so
 * the client's preview and the server's roll cannot read two different sets of rules.
 *
 * Never below zero: a shooter whose accuracy is under the penalties still takes the shot, and always
 * misses. A chance above 100 is the same certainty as 100. The floor and the ceiling are rules about
 * the roll, not clamps on a number the player can see, so they move no other value.
 */
export function hitChanceFor(state: PublicState, attacker: UnitState, target: UnitState): number {
  const shot = shotBetween(state, attacker, target);
  const cover = shot.cover ? COVER_HIT_PENALTY : 0;
  const direction = DIRECTION_BONUS[shot.direction].hit;
  const height = heightBonus(shot.stood).hit;
  const chance = attacker.hitChance - cover + direction + height;

  return Math.max(0, Math.min(100, chance));
}

/** The single place a hit is decided. One roll whatever the modifiers, so a replay draws the same. */
export function resolveHit(
  state: PublicState,
  attacker: UnitState,
  target: UnitState,
  rng: Rng,
): boolean {
  return nextInt(rng, 1, 100) <= hitChanceFor(state, attacker, target);
}

function teamHasUnits(state: PublicState, team: Team): boolean {
  return state.units.some((unit) => unit.team === team && isAlive(unit));
}

export function isGameOver(state: PublicState): boolean {
  return !teamHasUnits(state, 'A') || !teamHasUnits(state, 'B');
}

function occupantAt(state: PublicState, position: Position): UnitState | undefined {
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
  // A command names the turn it was decided on, so one that arrives late ends nothing (ADR 0010).
  if (action.type === 'endTurn' && action.round !== state.round) return 'stale-turn';

  if (action.type === 'move') return validateMove(state, action);
  if (action.type === 'attack') return validateAttack(state, action);
  if (action.type === 'reload') return validateReload(state, action);
  if (action.type === 'cancelMove' || action.type === 'commitMove') return validatePendingMove(state);
  return null;
}

/**
 * The two controls of a pending move are accepted only while a run is open (EA-5, D3 and D4). The run
 * is in the state, so neither action has a field of its own to check.
 */
function validatePendingMove(state: PublicState): RejectReason | null {
  return state.pendingMove === null ? 'no-pending-move' : null;
}

/**
 * Why a strike cannot be paid for, or null when it can (ADR 0011). The pool is the unit's own kind,
 * so the answer names the resource the player has to refill: a magazine or a pool of mana.
 */
function resourceRefusal(unit: UnitState): RejectReason | null {
  if (unit.magazine === null || unit.ammo > 0) return null;
  return unit.resourceKind === 'mana' ? 'no-mana' : 'no-ammunition';
}

function validateReload(state: PublicState, action: ReloadAction): RejectReason | null {
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
function isForbiddenStep(state: PublicState, actor: UnitState, to: Position): boolean {
  if (distance(actor.position, to) !== 1) return false;
  return !stepAllowed(movementProfile(actor), state.board, actor.position, to);
}

function validateMove(state: PublicState, action: MoveAction): RejectReason | null {
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

function validateAttack(state: PublicState, action: AttackAction): RejectReason | null {
  if (state.hasActed) return 'already-acted';

  const attacker = unitById(state, action.actor);
  const target = state.units.find((unit) => unit.id === action.target);

  if (!target || !isAlive(target)) return 'target-invalid';
  if (target.id === attacker.id || target.team === attacker.team) return 'target-invalid';
  // The pool is answered before the reach, so a strike nobody can pay for is refused the same way
  // whatever the distance (ADR 0011). The reach is the unit's own `range`: an empty pool no longer
  // turns the shot into a melee blow, and distance never changes the damage.
  const unpaid = resourceRefusal(attacker);
  if (unpaid !== null) return unpaid;
  // The reach is the unit's own `range` read through the relief (ADR 0015), so a target two levels
  // below is inside it. The painted area reads the same function, cell by cell.
  const reach = effectiveRange(state.board, attacker, target.position);
  if (distance(attacker.position, target.position) > reach) return 'target-out-of-range';
  if (!hasLineOfSight(state.board, attacker.position, target.position)) return 'no-line-of-sight';
  return null;
}

/**
 * Whether the unit with the turn has anything left to do. The engine does not end the turn: it
 * answers the question, so the client that ends one on a countdown (EA-4) asks exactly the rule the
 * server would apply, and the two sides cannot disagree (EA-1 D1).
 *
 * A turn is spent by walking somewhere, by shooting somebody the rules allow, or by refilling the
 * pool — a reload for a weapon class, a meditation for a magic one, which is the same action and the
 * same rule (ADR 0011). A unit with none of the three in front of it is done. A move that has not
 * been confirmed yet is something left to do on its own (EA-5): the unit may still confirm it, take
 * it back or walk on.
 */
export function canStillAct(state: PublicState): boolean {
  if (isGameOver(state)) return false;
  // A move waiting to be confirmed is not an exhausted resource: the turn has not passed while the
  // run is open, whatever else has been spent (EA-5). The pass is answered again after the commit.
  if (state.pendingMove !== null) return true;
  if (state.hasActed) return false;

  const actor = state.units.find((unit) => unit.id === currentUnitId(state));
  // A match that is not over always has a unit on turn; the guard keeps the type honest.
  if (actor === undefined) return false;

  if (reachableCells(state, actor.id).length > 0) return true;

  const aimed = state.units.some(
    (target) => validateAttack(state, { type: 'attack', actor: actor.id, target: target.id }) === null,
  );
  if (aimed) return true;

  return validateReload(state, { type: 'reload', actor: actor.id }) === null;
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

    // The turn the unit receives opens with a point of mana (ADR 0017): one point, magic pools only,
    // capped at the capacity. A unit that does not come on turn never regenerates, so this is read
    // from the turn that was handed over and not from the one that passed.
    const incoming = unitById(state, next);
    if (incoming.resourceKind === 'mana' && incoming.ammo < (incoming.magazine ?? 0)) {
      events.push({ type: 'regained', actor: next, resource: 'mana', amount: 1 });
    }

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
    // One action for both kinds, and the event carries the pool it refilled, so the log can say the
    // reload of a magazine apart from the meditation of a magic class (ADR 0011).
    return [{ type: 'reloaded', actor: action.actor, resource: unitById(state, action.actor).resourceKind }];
  }

  if (action.type === 'cancelMove') {
    return [{ type: 'move-cancelled', actor: action.actor }];
  }

  if (action.type === 'commitMove') {
    return [{ type: 'move-committed', actor: action.actor }];
  }

  if (action.type === 'face') {
    // Nothing but the turn itself: no resource is spent and nothing else in the state moves.
    return [{ type: 'faced', actor: action.actor, facing: action.facing }];
  }

  const attacker = unitById(state, action.actor);
  const target = unitById(state, action.target);
  // Read before the roll, so the event and the roll are the same answer and the log can explain it.
  const shot = shotBetween(state, attacker, target);
  const hit = resolveHit(state, attacker, target, rng);
  // One damage for every distance: the strike frame spends the resource, it does not halve the blow.
  // Where the attacker stood around the target is the only thing that adds to it (ADR 0014); the
  // relief buys reach and accuracy, never damage (ADR 0015).
  const damage = hit ? attacker.attack + DIRECTION_BONUS[shot.direction].damage : 0;
  const events: Event[] = [
    {
      type: 'attacked',
      actor: attacker.id,
      target: target.id,
      hit,
      damage,
      rngState: rng.state,
      // The pool the strike spends, so a replay takes the unit out of the same one the live match did.
      resource: attacker.resourceKind,
      cover: shot.cover,
      direction: shot.direction,
      stood: shot.stood,
    },
  ];

  if (target.health - damage <= 0) events.push({ type: 'unit-defeated', target: target.id });
  return events;
}
