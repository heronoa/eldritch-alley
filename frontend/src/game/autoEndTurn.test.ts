import { describe, expect, it } from 'vitest';
import type { PublicState } from '../protocol';
import {
  AUTO_END_TURN_KEY,
  AUTO_END_TURN_MS,
  endTurnAction,
  initialAutoEndTurn,
  readAutoEndTurn,
  saveAutoEndTurn,
  stepAutoEndTurn,
  type AutoEndTurn,
  type AutoEndTurnEvent,
} from './autoEndTurn';

/** Only the round is read: the action names the turn it applies to and nothing else (ADR 0010). */
const STATE = { round: 3 } as PublicState;

/** Plays a run of events through the machine and remembers whether any of them asked to send. */
function run(machine: AutoEndTurn, ...events: AutoEndTurnEvent[]): { machine: AutoEndTurn; sent: boolean } {
  let current = machine;
  let sent = false;

  for (const event of events) {
    const step = stepAutoEndTurn(current, event);
    current = step.machine;
    sent = sent || step.send;
  }

  return { machine: current, sent };
}

/** A machine with the setting as given, before the turn has said what it has left. */
function machineWith(enabled: boolean): AutoEndTurn {
  return initialAutoEndTurn(enabled);
}

describe('the countdown', () => {
  it('starts at two seconds when nothing is left and the setting is on', () => {
    const { machine } = run(machineWith(true), { type: 'nothingLeftOn' });

    expect(AUTO_END_TURN_MS).toBe(2000);
    expect(machine.phase).toBe('counting');
    expect(machine.remainingMs).toBe(AUTO_END_TURN_MS);
  });

  it('sends the end of the turn, with the round, when the countdown reaches zero', () => {
    const { machine, sent } = run(
      machineWith(true),
      { type: 'nothingLeftOn' },
      { type: 'tick', ms: AUTO_END_TURN_MS },
    );

    expect(sent).toBe(true);
    expect(machine.phase).toBe('sent');
    expect(endTurnAction(STATE)).toEqual({ type: 'endTurn', round: 3 });
  });

  it('counts the seconds down and sends nothing while there is time left', () => {
    const ticking = run(machineWith(true), { type: 'nothingLeftOn' }, { type: 'tick', ms: 500 });

    expect(ticking.sent).toBe(false);
    expect(ticking.machine.phase).toBe('counting');
    expect(ticking.machine.remainingMs).toBe(1500);

    // A slow frame is one long tick, and a fast one is many short ticks: both reach zero.
    const finished = run(ticking.machine, { type: 'tick', ms: 1500 });
    expect(finished.sent).toBe(true);
    expect(finished.machine.phase).toBe('sent');
  });

  it('never sends twice, however many ticks arrive after the turn was passed', () => {
    const passed = run(machineWith(true), { type: 'nothingLeftOn' }, { type: 'tick', ms: AUTO_END_TURN_MS });

    expect(run(passed.machine, { type: 'tick', ms: 5000 }).sent).toBe(false);
    expect(run(passed.machine, { type: 'nothingLeftOn' }).machine.phase).toBe('sent');
  });

  it('is not started by a turn that still has something to do', () => {
    const { machine, sent } = run(machineWith(true), { type: 'tick', ms: 5000 });

    expect(sent).toBe(false);
    expect(machine.phase).toBe('idle');
  });
});

describe('cancelling', () => {
  it('keeps the turn open and sends nothing, however long the match waits', () => {
    const { machine, sent } = run(
      machineWith(true),
      { type: 'nothingLeftOn' },
      { type: 'cancel' },
      { type: 'tick', ms: 60_000 },
    );

    expect(sent).toBe(false);
    expect(machine.phase).toBe('idle');
    expect(machine.remainingMs).toBe(0);
  });

  it('starts counting again only once nothing is left went off and on again', () => {
    const cancelled = run(machineWith(true), { type: 'nothingLeftOn' }, { type: 'cancel' }).machine;

    // The turn still has nothing to do, and it stays in the player's hands.
    expect(run(cancelled, { type: 'nothingLeftOn' }).machine.phase).toBe('idle');
    expect(run(cancelled, { type: 'tick', ms: 5000 }).sent).toBe(false);

    const again = run(cancelled, { type: 'nothingLeftOff' }, { type: 'nothingLeftOn' });
    expect(again.machine.phase).toBe('counting');
    expect(again.machine.remainingMs).toBe(AUTO_END_TURN_MS);
  });

  it('stops the countdown when the unit finds something to do', () => {
    const { machine, sent } = run(
      machineWith(true),
      { type: 'nothingLeftOn' },
      { type: 'tick', ms: 1000 },
      { type: 'nothingLeftOff' },
      { type: 'tick', ms: 5000 },
    );

    expect(sent).toBe(false);
    expect(machine.phase).toBe('idle');
    expect(machine.remainingMs).toBe(0);
  });
});

describe('a refused end of turn', () => {
  it('hands the turn back with the hint, and sends nothing more on its own', () => {
    const sent = run(
      machineWith(true),
      { type: 'nothingLeftOn' },
      { type: 'tick', ms: AUTO_END_TURN_MS },
    );
    const refused = run(sent.machine, { type: 'rejected' });

    expect(refused.machine.phase).toBe('hinting');
    expect(refused.sent).toBe(false);
    // Nothing else happens until the state moves on: the same turn is not counted down again.
    const later = run(refused.machine, { type: 'tick', ms: AUTO_END_TURN_MS * 5 });
    expect(later.sent).toBe(false);
    expect(later.machine.phase).toBe('hinting');
  });

  it('is ignored when no end of turn is on its way', () => {
    const counting = run(machineWith(true), { type: 'nothingLeftOn' });
    const after = run(counting.machine, { type: 'rejected' });

    expect(after.machine).toEqual(counting.machine);
  });

  it('counts the next turn again once the state moves on', () => {
    const refused = run(
      machineWith(true),
      { type: 'nothingLeftOn' },
      { type: 'tick', ms: AUTO_END_TURN_MS },
      { type: 'rejected' },
      { type: 'nothingLeftOff' },
      { type: 'nothingLeftOn' },
    );

    expect(refused.machine.phase).toBe('counting');
  });
});

describe('the setting off', () => {
  it('sends nothing, and the button points at itself instead', () => {
    const { machine, sent } = run(
      machineWith(false),
      { type: 'nothingLeftOn' },
      { type: 'tick', ms: 60_000 },
    );

    expect(sent).toBe(false);
    expect(machine.phase).toBe('hinting');
    expect(machine.remainingMs).toBe(0);
  });

  it('starts the countdown when it is turned on with nothing left to do', () => {
    const hinting = run(machineWith(false), { type: 'nothingLeftOn' }).machine;

    const { machine } = run(hinting, { type: 'settingChanged', enabled: true });
    expect(machine.phase).toBe('counting');
    expect(machine.remainingMs).toBe(AUTO_END_TURN_MS);
  });

  it('drops the countdown when it is turned off from the countdown itself', () => {
    const { machine, sent } = run(
      machineWith(true),
      { type: 'nothingLeftOn' },
      { type: 'disable' },
      { type: 'tick', ms: 60_000 },
    );

    expect(sent).toBe(false);
    expect(machine.enabled).toBe(false);
    expect(machine.phase).toBe('hinting');
  });
});

describe('the setting in the browser', () => {
  const blocked = {
    getItem(): string | null {
      throw new Error('storage is blocked');
    },
    setItem(): void {
      throw new Error('storage is blocked');
    },
  };

  function memoryStorage() {
    const saved = new Map<string, string>();
    return {
      saved,
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    };
  }

  it('keeps the setting under its own namespaced key', () => {
    expect(AUTO_END_TURN_KEY).toBe('eldritch-alley.autoEndTurn');
  });

  it('is on when there is nothing saved and when there is no storage at all', () => {
    expect(readAutoEndTurn(memoryStorage())).toBe(true);
    expect(readAutoEndTurn(null)).toBe(true);
  });

  it('falls back to on when the storage refuses the read', () => {
    expect(readAutoEndTurn(blocked)).toBe(true);
  });

  it('reads back what it saved', () => {
    const storage = memoryStorage();

    saveAutoEndTurn(false, storage);
    expect(readAutoEndTurn(storage)).toBe(false);

    saveAutoEndTurn(true, storage);
    expect(readAutoEndTurn(storage)).toBe(true);
  });

  it('answers with the default on anything the storage hands back that is not a yes or a no', () => {
    const storage = memoryStorage();

    storage.saved.set(AUTO_END_TURN_KEY, 'perhaps');
    expect(readAutoEndTurn(storage)).toBe(true);
  });

  it('swallows a write the storage refuses, so a blocked browser still plays', () => {
    expect(() => saveAutoEndTurn(false, blocked)).not.toThrow();
  });
});
