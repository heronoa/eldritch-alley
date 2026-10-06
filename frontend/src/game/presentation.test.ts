import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../view/effects';
import type { Event, Position } from '../protocol';
import { presentationOf, type Snapshot } from './presentation';

function at(x: number, y: number): Position {
  return { x, y };
}

/** A unit of the snapshot. The sniper is the default because it has both effects. */
function unit(overrides: Partial<Snapshot> = {}): Snapshot {
  return { position: at(0, 0), primaryClass: 'sniper', magazine: 3, ...overrides };
}

function snapshot(entries: Record<string, Snapshot>): Map<string, Snapshot> {
  return new Map(Object.entries(entries));
}

function attacked(overrides: Partial<Extract<Event, { type: 'attacked' }>> = {}): Event {
  return {
    type: 'attacked',
    actor: 'a',
    target: 'b',
    hit: true,
    damage: 4,
    rngState: 1,
    ammoSpent: true,
    ...overrides,
  };
}

describe('presentationOf', () => {
  it('turns a move into the cue that walks the unit along the path the server sent', () => {
    const event: Event = {
      type: 'moved',
      actor: 'a',
      from: at(1, 1),
      to: at(2, 3),
      path: [at(1, 2), at(2, 2), at(2, 3)],
    };

    expect(presentationOf(event, snapshot({ a: unit() }))).toEqual([
      {
        kind: 'move',
        unitId: 'a',
        from: at(1, 1),
        to: at(2, 3),
        // Every cell of the walk, the one it leaves first, so the scene tweens step by step (EA-7).
        steps: [at(1, 1), at(1, 2), at(2, 2), at(2, 3)],
      },
    ]);
  });

  it('plays the melee effect when the target is adjacent', () => {
    const units = snapshot({ a: unit({ position: at(0, 0) }), b: unit({ position: at(1, 1) }) });

    expect(presentationOf(attacked(), units)).toEqual([
      {
        kind: 'attack',
        actorId: 'a',
        targetId: 'b',
        style: 'melee',
        hit: true,
        effect: EFFECTS.sniper.melee,
      },
    ]);
  });

  it('plays the ranged effect from two cells away', () => {
    const units = snapshot({ a: unit({ position: at(0, 0) }), b: unit({ position: at(4, 0) }) });
    const cues = presentationOf(attacked(), units);

    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ kind: 'attack', style: 'ranged' });
    expect(cues[0]).toHaveProperty('effect.kind', 'tracer');
  });

  it('takes the effect of the acting class, not of the target', () => {
    const units = snapshot({
      a: unit({ position: at(0, 0), primaryClass: 'wizard' }),
      b: unit({ position: at(3, 0), primaryClass: 'priest' }),
    });

    expect(presentationOf(attacked(), units)[0]).toHaveProperty('effect', EFFECTS.wizard.ranged);
  });

  it('keeps a miss a miss, so the target is not flashed', () => {
    const units = snapshot({ a: unit({ position: at(0, 0) }), b: unit({ position: at(1, 0) }) });

    expect(presentationOf(attacked({ hit: false }), units)[0]).toHaveProperty('hit', false);
  });

  it('plays nothing for a class the effect table does not carry', () => {
    const units = snapshot({ a: unit({ primaryClass: 'soldier' }), b: unit({ position: at(1, 0) }) });

    expect(presentationOf(attacked(), units)).toEqual([]);
  });

  it('plays nothing when the actor or the target is not in the snapshot', () => {
    const units = snapshot({ a: unit({ position: at(0, 0) }) });

    expect(presentationOf(attacked(), units)).toEqual([]);
    expect(presentationOf(attacked({ actor: 'ghost', target: 'a' }), units)).toEqual([]);
  });

  it('refills the magazine of the class that has one', () => {
    const event: Event = { type: 'reloaded', actor: 'a' };

    expect(presentationOf(event, snapshot({ a: unit({ magazine: 3 }) }))).toEqual([
      { kind: 'reload', unitId: 'a', from: 0, to: 3 },
    ]);
  });

  it('plays nothing for a reload of a class with no magazine', () => {
    const event: Event = { type: 'reloaded', actor: 'a' };

    expect(presentationOf(event, snapshot({ a: unit({ magazine: null }) }))).toEqual([]);
  });

  it('turns a defeat and the removal of the body into their own cues', () => {
    const units = snapshot({ a: unit() });

    expect(presentationOf({ type: 'unit-defeated', target: 'a' }, units)).toEqual([
      { kind: 'defeat', unitId: 'a' },
    ]);
    expect(presentationOf({ type: 'corpse-removed', target: 'a' }, units)).toEqual([
      { kind: 'remove', unitId: 'a' },
    ]);
  });

  it('cues nothing at the end of a turn', () => {
    const event: Event = { type: 'turn-ended', actor: 'a', next: 'b', round: 2 };

    expect(presentationOf(event, snapshot({ a: unit(), b: unit() }))).toEqual([]);
  });

  it('reads the snapshot without changing it', () => {
    const units = snapshot({ a: unit({ position: at(0, 0) }), b: unit({ position: at(1, 0) }) });
    const untouched = snapshot({ a: unit({ position: at(0, 0) }), b: unit({ position: at(1, 0) }) });

    presentationOf(attacked(), units);
    presentationOf({ type: 'moved', actor: 'a', from: at(0, 0), to: at(1, 1), path: [at(1, 1)] }, units);
    presentationOf({ type: 'unit-defeated', target: 'b' }, units);

    expect(units).toEqual(untouched);
  });
});
