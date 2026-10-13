// The single place where match state changes. Live play and replay both go through applyEvent, so a
// sequence of events always rebuilds the same state (ADR 0005).
import { corpseRounds } from './corpse';
import { distance, inBounds } from './board';
import { facingOf } from './facing';
import { advanceIndex, removeFromInitiative, unitById } from './initiative';
import { movementProfile, stepAllowed, stepCost } from './movement';
import type { Board, Event, MatchState, MovementProfile, Position } from './types';

function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    units: state.units.map((unit) => ({ ...unit, position: { ...unit.position } })),
    initiative: [...state.initiative],
    pendingMove:
      state.pendingMove === null
        ? null
        : { from: { ...state.pendingMove.from }, cost: state.pendingMove.cost },
    rng: { ...state.rng },
  };
}

/**
 * Refuses a `moved` path that is not a walk the unit can make: each step next to the one before it,
 * on the board, allowed by the profile, and paid for with the movement left. A replay reads stored
 * events, so a malformed path must fail here rather than move the unit to the wrong cell (DT-73).
 */
function requireWalk(
  board: Board,
  profile: MovementProfile,
  movementLeft: number,
  from: Position,
  to: Position,
  path: readonly Position[],
): void {
  if (path.length === 0) throw new Error('moved: the path is empty');
  const last = path[path.length - 1];
  if (last.x !== to.x || last.y !== to.y) {
    throw new Error('moved: the path does not end on the destination');
  }

  let previous = from;
  let cost = 0;
  path.forEach((step, index) => {
    const n = index + 1;
    if (!inBounds(board, step)) throw new Error(`moved: step ${n} is outside the board`);
    if (distance(previous, step) !== 1) {
      throw new Error(`moved: step ${n} is not next to the cell before it`);
    }
    if (!stepAllowed(profile, board, previous, step)) {
      throw new Error(`moved: step ${n} is not allowed by the movement profile`);
    }
    cost += stepCost(profile, board, previous, step);
    previous = step;
  });
  if (cost > movementLeft) throw new Error('moved: the path costs more than the movement left');
}

/** Applies one event and returns the next state. The state passed in is never changed. */
export function applyEvent(state: MatchState, event: Event): MatchState {
  const next = cloneState(state);
  // The run as it was before this event: a move extends it, a cancel gives it back.
  const run = state.pendingMove;
  // What commits a pending move is any event that is not another move (EA-5, D3): the attack, the
  // reload, the end of the turn, and the confirmation itself all close the run. It lives here, so a
  // replay rebuilds the same state from the events alone.
  if (event.type !== 'moved') next.pendingMove = null;

  switch (event.type) {
    case 'moved': {
      const actor = unitById(next, event.actor);
      const profile = movementProfile(actor);
      requireWalk(next.board, profile, next.movementLeft, event.from, event.to, event.path);
      // The walk pays for every step it takes, and the unit ends on the last cell of it. The
      // destination alone is the degenerate walk, for an event that carries no path.
      const steps: readonly Position[] = event.path.length > 0 ? event.path : [event.to];
      let previous = event.from;
      let cost = 0;
      for (const step of steps) {
        cost += stepCost(profile, next.board, previous, step);
        // The unit looks the way its last step went (ADR 0014), so a walk that turns a corner leaves
        // it facing the corner and not the walk as a whole. The last pass is the one that stays.
        actor.facing = facingOf(previous, step);
        previous = step;
      }

      next.movementLeft -= cost;
      actor.position = { x: previous.x, y: previous.y };
      // The walk either opens a run on the cell it started from, or grows the one already open. The
      // cost is what the run has spent, which is what a cancel gives back (D5).
      next.pendingMove =
        run === null
          ? { from: { x: event.from.x, y: event.from.y }, cost }
          : { from: { ...run.from }, cost: run.cost + cost };
      break;
    }

    case 'move-cancelled': {
      if (run === null) throw new Error('move-cancelled: there is no pending move to take back');
      // Back to where the run started, with the movement the run spent given back (D5).
      unitById(next, event.actor).position = { x: run.from.x, y: run.from.y };
      next.movementLeft += run.cost;
      break;
    }

    case 'move-committed': {
      if (run === null) throw new Error('move-committed: there is no pending move to confirm');
      // Nothing else: the movement stays spent and the unit stays where it stands (D4).
      break;
    }

    case 'attacked': {
      const attacker = unitById(next, event.actor);
      const target = unitById(next, event.target);
      target.health = Math.max(0, target.health - event.damage);
      if (event.resource !== null) attacker.ammo -= 1;
      // The shot leaves the shooter looking at what it aimed at (ADR 0014), which is where the next
      // shot of the match is read from.
      attacker.facing = facingOf(attacker.position, target.position);
      next.hasActed = true;
      // Take the random source as the live roll left it, so the next roll matches the live match.
      next.rng = { state: event.rngState };
      break;
    }

    case 'ability-used': {
      const caster = unitById(next, event.actor);
      const ability = next.catalog.find((definition) => definition.id === event.abilityId);
      // The cost is the definition's, and the definition is in the state, so a replay pays exactly what
      // the live match paid without the event carrying a number of its own (ADR 0016 §8.1).
      if (!ability) {
        throw new Error(`ability-used: the catalog has no definition for ${event.abilityId}`);
      }
      caster.ammo -= ability.cost;
      // The cast leaves the caster looking at the cell it aimed at, the way a shot leaves it looking at
      // its target (ADR 0014). An aim at its own cell turns nothing: there is no direction to read.
      if (event.to.x !== caster.position.x || event.to.y !== caster.position.y) {
        caster.facing = facingOf(caster.position, event.to);
      }
      next.hasActed = true;
      next.rng = { state: event.rngState };
      break;
    }

    case 'damaged': {
      const target = unitById(next, event.target);
      target.health = Math.max(0, target.health - event.damage);
      break;
    }

    case 'healed': {
      const target = unitById(next, event.target);
      // A body is not healed back onto its feet (ADR 0016 §10). The builder already skips it, and a
      // replay written by hand obeys the same rule rather than reviving it.
      if (target.defeated) break;
      target.health = Math.min(target.maxHealth, target.health + event.amount);
      break;
    }

    case 'faced': {
      // The turn the player asked for, which a walk and a shot would have written in their own event.
      unitById(next, event.actor).facing = event.facing;
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

    case 'regained': {
      // The point the rule handed the unit coming on turn (ADR 0017). The cap is the engine's own,
      // so a replay of an event that would break it lands on the ceiling rather than above it.
      const regaining = unitById(next, event.actor);
      regaining.ammo = Math.min(regaining.ammo + event.amount, regaining.magazine ?? 0);
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
