// The single place where match state changes. Live play and replay both go through applyEvent, so a
// sequence of events always rebuilds the same state (ADR 0005).
import { corpseRounds } from './corpse';
import { advanceIndex, removeFromInitiative, unitById } from './initiative';
import { movementProfile, stepCost } from './movement';
import type { Event, MatchState, Position } from './types';

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
      const profile = movementProfile(actor);
      // The walk pays for every step it takes, and the unit ends on the last cell of it. The
      // destination alone is the degenerate walk, for an event that carries no path.
      const steps: readonly Position[] = event.path.length > 0 ? event.path : [event.to];
      let previous = event.from;
      let cost = 0;
      for (const step of steps) {
        cost += stepCost(profile, next.board, previous, step);
        previous = step;
      }

      next.movementLeft -= cost;
      actor.position = { x: previous.x, y: previous.y };
      break;
    }

    case 'attacked': {
      const target = unitById(next, event.target);
      target.health = Math.max(0, target.health - event.damage);
      if (event.ammoSpent) unitById(next, event.actor).ammo -= 1;
      next.hasActed = true;
      // Take the random source as the live roll left it, so the next roll matches the live match.
      next.rng = { state: event.rngState };
      break;
    }

    case 'unit-defeated': {
      const removedAt = next.initiative.indexOf(event.target);
      const fallen = unitById(next, event.target);
      fallen.defeated = true;
      fallen.corpseExpiresAtRound = next.round + corpseRounds(fallen.nerve);
      next.initiative = removeFromInitiative(next.initiative, event.target);
      // A unit removed before the current one shifts the turn back by one slot. A queue that shrank
      // past the pointer, including an empty one, restarts at the head.
      if (removedAt >= 0 && removedAt < next.currentIndex) next.currentIndex -= 1;
      if (next.currentIndex >= next.initiative.length) next.currentIndex = 0;
      break;
    }

    case 'reloaded': {
      const reloading = unitById(next, event.actor);
      reloading.ammo = reloading.magazine ?? 0;
      next.hasActed = true;
      break;
    }

    case 'corpse-removed': {
      // The body is gone and the death is permanent. The tile is free because occupancy ignores
      // permanently dead units.
      unitById(next, event.target).permanentlyDead = true;
      break;
    }

    case 'turn-ended': {
      next.round = event.round;
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
