import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../view/effects';
import type { AbilityDefinition, BoardState, Event, Position, PublicState } from '../protocol';
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
    resource: 'ammo',
    cover: false,
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
      rngState: 0,
      prone: false,
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
    const event: Event = { type: 'reloaded', actor: 'a', resource: 'ammo' };

    expect(presentationOf(event, snapshot({ a: unit({ magazine: 3 }) }))).toEqual([
      { kind: 'reload', unitId: 'a', from: 0, to: 3 },
    ]);
  });

  it('plays nothing for a reload of a class with no magazine', () => {
    const event: Event = { type: 'reloaded', actor: 'a', resource: null };

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
    presentationOf(
      {
        type: 'moved',
        actor: 'a',
        from: at(0, 0),
        to: at(1, 1),
        path: [at(1, 1)],
        rngState: 0,
        prone: false,
      },
      units,
    );
    presentationOf({ type: 'unit-defeated', target: 'b' }, units);

    expect(units).toEqual(untouched);
  });
});

/**
 * The impact of an ability (EA-16). The event names the ability and the cell; the match's catalog says
 * what the effect does there, and the engine says which cells it covers. The three abilities of the
 * roster are the three drawings, and this module never names one of them (ADR 0016 §13).
 */
describe('the impact of an ability', () => {
  const BOARD: BoardState = { width: 8, height: 8, levels: new Array<number>(64).fill(0), props: [] };

  const SHOT: AbilityDefinition = {
    id: 'piercing-shot',
    cost: 1,
    range: 4,
    needsSight: true,
    effect: { kind: 'damage', amount: 6, radius: 0, ignoresCover: true },
  };
  const FIREBALL: AbilityDefinition = {
    id: 'fireball',
    cost: 2,
    range: 3,
    needsSight: true,
    effect: { kind: 'damage', amount: 3, radius: 1, ignoresCover: true },
  };
  const HEAL: AbilityDefinition = {
    id: 'area-heal',
    cost: 2,
    range: 3,
    needsSight: false,
    effect: { kind: 'heal', amount: 3, radius: 1 },
  };

  function stateOf(catalog: readonly AbilityDefinition[], board: BoardState = BOARD): PublicState {
    return {
      seed: 1,
      board,
      catalog,
      units: [],
      initiative: [],
      currentIndex: 0,
      movementLeft: 0,
      round: 1,
      hasActed: false,
      eventCount: 0,
      pendingMove: null,
      difficultTerrain: [],
    };
  }

  /** The event of an ability used at `to`, as the engine emits it (ADR 0016 §8). */
  function used(abilityId: string, to: Position, actor = 'a'): Event {
    return { type: 'ability-used', actor, abilityId, to, rngState: 1, resource: 'mana' };
  }

  it('throws a shot of the caster\'s own class at the cell the aim named', () => {
    // A damage effect with no radius covers its own cell alone: the class's ranged effect is thrown,
    // and the heavier landing flash is what the scene adds on top of it.
    const units = snapshot({ a: unit({ position: at(0, 0) }) });
    const event = used('piercing-shot', at(2, 2));

    expect(presentationOf(event, units, stateOf([SHOT]))).toEqual([
      {
        kind: 'ability',
        actorId: 'a',
        cell: at(2, 2),
        impact: { kind: 'shot', cell: at(2, 2), effect: EFFECTS.sniper.ranged },
      },
    ]);
  });

  it('rings the aim of an area and covers every cell inside its radius', () => {
    // Three by three around the aim, listed in reading order, which is the order the flashes follow.
    const units = snapshot({ a: unit({ position: at(0, 0), primaryClass: 'wizard' }) });
    const event = used('fireball', at(3, 3));

    expect(presentationOf(event, units, stateOf([FIREBALL]))).toEqual([
      {
        kind: 'ability',
        actorId: 'a',
        cell: at(3, 3),
        impact: {
          kind: 'blast',
          cell: at(3, 3),
          cells: [
            at(2, 2), at(3, 2), at(4, 2),
            at(2, 3), at(3, 3), at(4, 3),
            at(2, 4), at(3, 4), at(4, 4),
          ],
          color: EFFECTS.wizard.ranged.color,
        },
      },
    ]);
  });

  it('clips the area at the edge of the board, so nothing is drawn off it', () => {
    // The board clips the box rather than the loop walking off it (ADR 0016 §11): a blast aimed at the
    // corner covers the four cells that exist.
    const units = snapshot({ a: unit({ position: at(0, 0), primaryClass: 'wizard' }) });

    const cues = presentationOf(used('fireball', at(0, 0)), units, stateOf([FIREBALL]));
    const impact = cues[0]?.kind === 'ability' ? cues[0].impact : null;

    expect(impact).toEqual({
      kind: 'blast',
      cell: at(0, 0),
      cells: [at(0, 0), at(1, 0), at(0, 1), at(1, 1)],
      color: EFFECTS.wizard.ranged.color,
    });
  });

  it('lifts a glow off the cells of a heal, which never flashes a body', () => {
    // A heal never rolls (ADR 0016 §10): there is nothing to hit, so the drawing is the light rising
    // off the cells and not an impact on them.
    const units = snapshot({ a: unit({ position: at(0, 0), primaryClass: 'priest' }) });

    const cues = presentationOf(used('area-heal', at(1, 1)), units, stateOf([HEAL]));
    const impact = cues[0]?.kind === 'ability' ? cues[0].impact : null;

    expect(impact).toEqual({
      kind: 'glow',
      cells: [
        at(0, 0), at(1, 0), at(2, 0),
        at(0, 1), at(1, 1), at(2, 1),
        at(0, 2), at(1, 2), at(2, 2),
      ],
      color: EFFECTS.priest.ranged.color,
    });
  });

  it('cues nothing without the state, which is where the catalog and the board come from', () => {
    // The cells an area covers are the engine's answer about the board, so a caller that hands no state
    // has nothing to ask it (EA-16): the log still shows the use.
    const units = snapshot({ a: unit() });

    expect(presentationOf(used('fireball', at(3, 3)), units)).toEqual([]);
  });

  it('cues nothing for an ability the match does not define', () => {
    const units = snapshot({ a: unit() });

    expect(presentationOf(used('time-stop', at(3, 3)), units, stateOf([FIREBALL]))).toEqual([]);
  });

  it('cues nothing for an actor the snapshot does not know, or a class with no art', () => {
    // A class the effect table does not carry draws nothing, the way its basic attack does not.
    const unknown = snapshot({ b: unit({ position: at(0, 0) }) });
    const noArt = snapshot({ a: unit({ primaryClass: 'initiate' }) });

    expect(presentationOf(used('fireball', at(3, 3), 'a'), unknown, stateOf([FIREBALL]))).toEqual([]);
    expect(presentationOf(used('fireball', at(3, 3)), noArt, stateOf([FIREBALL]))).toEqual([]);
  });
});
