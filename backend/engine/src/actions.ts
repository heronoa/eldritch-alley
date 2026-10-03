// Validation and event building for the three actions of M1. Nothing here changes the state: an
// accepted action is turned into events, and events.ts applies them.
import { distance, inBounds, levelAt } from './board';
import { currentUnitId, isAlive, unitById } from './initiative';
import { nextInt } from './rng';
import type {
  Action,
  Board,
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

/** A step costs 1, climbing one level adds 1, descending adds nothing. */
export function moveCost(board: Board, from: Position, to: Position): number {
  const climb = levelAt(board, to) - levelAt(board, from);
  return 1 + Math.max(0, climb);
}

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
  return state.units.find(
    (unit) => isAlive(unit) && unit.position.x === position.x && unit.position.y === position.y,
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
  return null;
}

function validateMove(state: MatchState, action: MoveAction): RejectReason | null {
  const actor = unitById(state, action.actor);
  const to = action.to;

  if (!inBounds(state.board, to)) return 'out-of-bounds';
  if (distance(actor.position, to) !== 1) return 'not-adjacent';
  if (occupantAt(state, to)) return 'cell-occupied';
  if (Math.abs(levelAt(state.board, to) - levelAt(state.board, actor.position)) > 1) {
    return 'height-step-too-high';
  }
  if (moveCost(state.board, actor.position, to) > state.movementLeft) return 'not-enough-movement';
  return null;
}

function validateAttack(state: MatchState, action: AttackAction): RejectReason | null {
  if (state.hasActed) return 'already-acted';

  const attacker = unitById(state, action.actor);
  const target = state.units.find((unit) => unit.id === action.target);

  if (!target || !isAlive(target)) return 'target-invalid';
  if (target.id === attacker.id || target.team === attacker.team) return 'target-invalid';
  if (distance(attacker.position, target.position) > attacker.range) return 'target-out-of-range';
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
    return [{ type: 'turn-ended', actor: action.actor, next: nextUnitId(state) }];
  }

  if (action.type === 'move') {
    const actor = unitById(state, action.actor);
    return [
      {
        type: 'moved',
        actor: actor.id,
        from: { x: actor.position.x, y: actor.position.y },
        to: { x: action.to.x, y: action.to.y },
      },
    ];
  }

  const attacker = unitById(state, action.actor);
  const target = unitById(state, action.target);
  const hit = resolveHit(attacker, target, rng);
  const damage = hit ? attacker.attack : 0;
  const events: Event[] = [
    { type: 'attacked', actor: attacker.id, target: target.id, hit, damage, rngState: rng.state },
  ];

  if (target.health - damage <= 0) events.push({ type: 'unit-defeated', unit: target.id });
  return events;
}
