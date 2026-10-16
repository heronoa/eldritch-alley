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
