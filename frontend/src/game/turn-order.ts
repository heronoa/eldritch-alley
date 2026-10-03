// The initiative queue, rotated so the unit whose turn it is comes first. Pure: the carousel draws
// the slots in the order it is handed them and nothing else.
import type { PublicState, UnitState } from '../protocol';

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
