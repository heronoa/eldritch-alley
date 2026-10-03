// The single place where match state changes. Live play and replay both go through applyEvent, so a
// sequence of events always rebuilds the same state (ADR 0005).
import { moveCost } from './actions';
import { advanceIndex, removeFromInitiative, unitById } from './initiative';
import type { Event, MatchState } from './types';

function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    units: state.units.map((unit) => ({ ...unit, position: { ...unit.position } })),
    initiative: [...state.initiative],
    rng: { ...state.rng },
  };
}

/** Applies one event and returns the next state. The state passed in is never changed. */
export function applyEvent(state: MatchState, event: Event): MatchState {
  const next = cloneState(state);

  switch (event.type) {
    case 'moved': {
      const actor = unitById(next, event.actor);
      next.movementLeft -= moveCost(next.board, event.from, event.to);
      actor.position = { x: event.to.x, y: event.to.y };
      break;
    }

    case 'attacked': {
      const target = unitById(next, event.target);
      target.health = Math.max(0, target.health - event.damage);
      next.hasActed = true;
      // Take the random source as the live roll left it, so the next roll matches the live match.
      next.rng = { state: event.rngState };
      break;
    }

    case 'unit-defeated': {
      const removedAt = next.initiative.indexOf(event.target);
      unitById(next, event.target).defeated = true;
      next.initiative = removeFromInitiative(next.initiative, event.target);
      // A unit removed before the current one shifts the turn back by one slot. A queue that shrank
      // past the pointer, including an empty one, restarts at the head.
      if (removedAt >= 0 && removedAt < next.currentIndex) next.currentIndex -= 1;
      if (next.currentIndex >= next.initiative.length) next.currentIndex = 0;
      break;
    }

    case 'turn-ended': {
      next.currentIndex = advanceIndex(next, event.next);
      const current = next.initiative[next.currentIndex];
      next.movementLeft = current ? unitById(next, current).movement : 0;
      next.hasActed = false;
      break;
    }
  }

  next.eventCount = state.eventCount + 1;
  return next;
}
