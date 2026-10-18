// Who is in play and in what order (ADR 0001). Turn order follows speed, and a defeated unit leaves
// the queue for good, so the queue is also where "still in the match" lives.
import type { MatchState, PublicState, UnitId, UnitState } from './types';

/** A unit is in play until it is defeated. */
export function isAlive(unit: UnitState): boolean {
  return !unit.defeated;
}

// `PublicState` and not `MatchState`: reading who is in play is a question the client may ask too,
// and `MatchState` is assignable to it, so every caller in the engine is unaffected.
export function unitById(state: PublicState, id: UnitId): UnitState {
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit) throw new RangeError(`unknown unit: ${id}`);
  return unit;
}

/**
 * Orders the units still in play by speed, highest first. Ties break on the position in `units`,
 * which is setup order: team A before team B, then the order inside each squad.
 */
export function buildInitiativeQueue(units: readonly UnitState[]): UnitId[] {
  return units
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => isAlive(unit))
    .sort((left, right) => right.unit.speed - left.unit.speed || left.index - right.index)
    .map(({ unit }) => unit.id);
}

export function removeFromInitiative(queue: readonly UnitId[], unitId: UnitId): UnitId[] {
  return queue.filter((id) => id !== unitId);
}

/**
 * Puts a unit back into the queue by the same rule `buildInitiativeQueue` sorts it by: speed, highest
 * first, and a tie broken by the position in `units`, which is setup order (ADR 0023 §7). It returns
 * the index the unit took, which is what the caller compares with `currentIndex`: a slot at or before
 * the pointer has already passed this round.
 *
 * The state it receives is the one `applyEvent` has already cloned, so writing the queue here rebuilds
 * the same match a replay of the event would.
 */
export function insertIntoInitiative(state: MatchState, unitId: UnitId): number {
  const position = state.units.findIndex((unit) => unit.id === unitId);
  if (position < 0) throw new RangeError(`unknown unit: ${unitId}`);
  const unit = state.units[position];
  const slotOf = (id: UnitId): number =>
    state.units.findIndex((candidate) => candidate.id === id);

  let at = state.initiative.length;
  for (let index = 0; index < state.initiative.length; index += 1) {
    const otherPosition = slotOf(state.initiative[index]);
    const other = state.units[otherPosition];
    if (other.speed < unit.speed || (other.speed === unit.speed && otherPosition > position)) {
      at = index;
      break;
    }
  }

  state.initiative.splice(at, 0, unitId);
  return at;
}

export function currentUnitId(state: PublicState): UnitId {
  return state.initiative[state.currentIndex];
}

/**
 * The index of the unit that takes the turn after this one. `next` comes from the event, so a
 * replay follows exactly the same turns as live play.
 */
export function advanceIndex(state: MatchState, next: UnitId): number {
  const index = state.initiative.indexOf(next);
  return index >= 0 ? index : 0;
}
