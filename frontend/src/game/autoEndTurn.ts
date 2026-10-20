// Passing a turn nobody can use, on its own (EA-4).
//
// The machine is pure and knows nothing about Phaser or about time: the scene hands it the clock,
// and it answers with its new state and whether the turn should be handed over now. The server has no
// timer (decision D1), so the only protection against a late message is the round the action carries
// (ADR 0010): the engine refuses a command that names a round the match has left behind.
//
// The setting lives at the bottom of this file, in the browser only (decision D2): reading or writing
// it never throws, because a browser that blocks storage must still be able to play.
import { browserStorage, type KeyValueStorage } from '../storage/browser';
import type { ClientAction, PublicState } from '../protocol';

/** How long the player has to cancel before the turn passes on its own (decision of the plan). */
export const AUTO_END_TURN_MS = 2000;

/** The key the setting is saved under. Namespaced, so the origin's other keys do not collide. */
export const AUTO_END_TURN_KEY = 'eldritch-alley.autoEndTurn';

/** The rule a match plays under until the player says otherwise (decision D2). */
export const AUTO_END_TURN_DEFAULT = true;

/**
 * What the machine is doing:
 * - `idle` — the turn has something to do, or the player asked for it back;
 * - `counting` — nothing is left and the seconds are running;
 * - `hinting` — nothing is left and the setting is off, so the button points at itself;
 * - `sent` — the countdown reached zero and the turn was handed over.
 */
export type AutoEndPhase = 'idle' | 'counting' | 'hinting' | 'sent';

export interface AutoEndTurn {
  phase: AutoEndPhase;
  /** Whether the turn passes on its own. It mirrors the saved setting. */
  enabled: boolean;
  /** Whether the unit on turn has nothing left to do. */
  nothingLeft: boolean;
  /** Milliseconds left of the countdown, which is zero in every other phase. */
  remainingMs: number;
  /** Set by `cancel`: the turn stays in the player's hands until `nothingLeft` goes on again. */
  cancelled: boolean;
}

/** What the scene tells the machine. */
export type AutoEndTurnEvent =
  /** The unit on turn has just run out of things to do. */
  | { type: 'nothingLeftOn' }
  /** Something is available again: the player acted, or the turn changed. */
  | { type: 'nothingLeftOff' }
  | { type: 'tick'; ms: number }
  /** The player keeps this turn open. */
  | { type: 'cancel' }
  /** The player turns the whole feature off, from the countdown or from the settings panel. */
  | { type: 'disable' }
  | { type: 'settingChanged'; enabled: boolean }
  /** The server refused an action. Only matters right after `endTurn` went out (see `sent` below). */
  | { type: 'rejected' };

/** The machine after an event, and whether the turn should be handed over now. */
export interface AutoEndStep {
  machine: AutoEndTurn;
  send: boolean;
}

/** The machine a scene starts from, with the setting as last saved. */
export function initialAutoEndTurn(enabled: boolean = AUTO_END_TURN_DEFAULT): AutoEndTurn {
  return { phase: 'idle', enabled, nothingLeft: false, remainingMs: 0, cancelled: false };
}

/** The phase the machine falls into once nothing is left: counting, or hinting with the setting off. */
function settlePhase(machine: AutoEndTurn): AutoEndTurn {
  if (!machine.nothingLeft) return { ...machine, phase: 'idle', remainingMs: 0 };
  if (!machine.enabled) return { ...machine, phase: 'hinting', remainingMs: 0 };
  if (machine.cancelled) return { ...machine, phase: 'idle', remainingMs: 0 };
  return { ...machine, phase: 'counting', remainingMs: AUTO_END_TURN_MS };
}

/**
 * Applies one event. Only reaching zero on the countdown asks for the turn to be handed over, and
 * only once: a tick that arrives after that finds a machine that is no longer counting.
 */
export function stepAutoEndTurn(machine: AutoEndTurn, event: AutoEndTurnEvent): AutoEndStep {
  const stand = { machine, send: false };

  switch (event.type) {
    case 'nothingLeftOn':
      // A turn that was already passed is not passed again: the next one starts from `idle`.
      if (machine.phase === 'sent') return stand;
      return { machine: settlePhase({ ...machine, nothingLeft: true }), send: false };

    case 'nothingLeftOff':
      // The reason to cancel is gone with the situation that raised it, so the next turn counts.
      return {
        machine: { ...machine, nothingLeft: false, cancelled: false, phase: 'idle', remainingMs: 0 },
        send: false,
      };

    case 'rejected':
      // A refused `endTurn` leaves the turn where it was, with nothing to count down to: the player
      // is left with the hint and the button, and no second order goes out on its own.
      if (machine.phase !== 'sent') return stand;
      return {
        machine: { ...machine, phase: 'hinting', cancelled: true, remainingMs: 0 },
        send: false,
      };

    case 'cancel':
      if (machine.phase !== 'counting') return stand;
      return {
        machine: { ...machine, cancelled: true, phase: 'idle', remainingMs: 0 },
        send: false,
      };

    case 'disable':
      return { machine: settlePhase({ ...machine, enabled: false, cancelled: false }), send: false };

    case 'settingChanged':
      return {
        machine: settlePhase({ ...machine, enabled: event.enabled, cancelled: false }),
        send: false,
      };

    case 'tick': {
      if (machine.phase !== 'counting') return stand;

      const remainingMs = machine.remainingMs - event.ms;
      if (remainingMs > 0) return { machine: { ...machine, remainingMs }, send: false };
      return { machine: { ...machine, phase: 'sent', remainingMs: 0 }, send: true };
    }
  }
}

/**
 * The action the countdown sends. The round is the whole point: what the server checks the command
 * against, so a message that arrives after the match has moved on is refused instead of ending the
 * turn of whoever is up by then (ADR 0010).
 */
export function endTurnAction(state: PublicState): ClientAction {
  return { type: 'endTurn', round: state.round };
}

/** The saved setting, or the default when there is none, it is not a yes or a no, or storage fails. */
export function readAutoEndTurn(storage: KeyValueStorage | null = browserStorage()): boolean {
  try {
    const saved = storage?.getItem(AUTO_END_TURN_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return AUTO_END_TURN_DEFAULT;
  } catch {
    return AUTO_END_TURN_DEFAULT;
  }
}

/** Saves the setting, and does nothing when storage refuses it: the page still plays. */
export function saveAutoEndTurn(
  enabled: boolean,
  storage: KeyValueStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(AUTO_END_TURN_KEY, String(enabled));
  } catch {
    // Nothing to do: without storage the choice simply does not outlive the page.
  }
}
