// The initiative queue, rotated so the unit whose turn it is comes first. Pure: the carousel draws
// the slots in the order it is handed them and nothing else.
import type { PublicState, Team, UnitState } from '../protocol';

export interface TurnSlot {
  unit: UnitState;
  /** True for the unit that is acting now. Only the first slot ever carries it. */
  isCurrent: boolean;
}

/** The queue as it will be played, starting at the current unit and wrapping to the end. */
export function turnOrder(state: PublicState): TurnSlot[] {
  const slots: TurnSlot[] = [];
  const total = state.initiative.length;

  for (let offset = 0; offset < total; offset += 1) {
    const id = state.initiative[(state.currentIndex + offset) % total];
    const unit = state.units.find((candidate) => candidate.id === id);
    if (unit) slots.push({ unit, isCurrent: offset === 0 });
  }

  return slots;
}

/**
 * The slot of the unit whose turn it is: the head of the queue `turnOrder` builds, without building
 * the rest of it. Null when nobody is on turn — an empty queue, an index past its end, or a queue
 * that names a unit the state does not carry.
 */
export function activeSlot(state: PublicState): TurnSlot | null {
  const id = state.initiative[state.currentIndex];
  if (id === undefined) return null;

  const unit = state.units.find((candidate) => candidate.id === id);
  if (unit === undefined) return null;

  return { unit, isCurrent: true };
}

/** Whether the unit on turn belongs to the team the person at the keyboard plays. */
export function isHumanTurn(state: PublicState, humanTeam: Team): boolean {
  return activeSlot(state)?.unit.team === humanTeam;
}
