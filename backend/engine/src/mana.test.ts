import { describe, expect, it } from 'vitest';
import { applyAction, applyEvents, hashState, newMatch } from './match';
import type {
  Action,
  ActionResult,
  Board,
  Event,
  MatchSetup,
  MatchState,
  Unit,
} from './types';

function makeBoard(heights: Record<string, number> = {}): Board {
  const levels = new Array<number>(64).fill(0);
  for (const [key, level] of Object.entries(heights)) {
    const [x, y] = key.split(',').map(Number);
    levels[y * 8 + x] = level;
  }
  return { width: 8, height: 8, levels };
}

function makeUnit(overrides: Partial<Unit> & Pick<Unit, 'id' | 'team' | 'position'>): Unit {
  return {
    speed: 1,
    health: 10,
    attack: 3,
    hitChance: 100,
    range: 1,
    movement: 4,
    nerve: 50,
    magazine: null,
    attunement: 50,
    primaryClass: 'soldier',
    equipment: {
      armor: null,
      helmet: null,
      mainHand: null,
      offHand: null,
      accessory1: null,
      accessory2: null,
    },
    abilities: { activeSets: [null, null], reaction: null, movement: null, support: null },
    ...overrides,
  };
}

/**
 * A magic class (pool 3, reach 3) on A and one target on B, three cells away by default. The caster is
 * faster, so it has the turn. `heights` builds the walls a line of sight has to read.
 */
function casterSetup(
  caster: Partial<Unit> = {},
  target: Partial<Unit> = {},
  heights: Record<string, number> = {},
): MatchSetup {
  return {
    seed: 11,
    map: makeBoard(heights),
    teams: [
      [
        makeUnit({
          id: 'wizard',
          team: 'A',
          position: { x: 0, y: 0 },
          speed: 10,
          range: 3,
          magazine: 3,
          resourceKind: 'mana',
          attack: 3,
          primaryClass: 'wizard',
          ...caster,
        }),
      ],
      [makeUnit({ id: 'target', team: 'B', position: { x: 0, y: 3 }, speed: 1, ...target })],
    ],
  };
}

function play(state: MatchState, action: Action): ActionResult & { ok: true } {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`expected the action to be accepted, got ${result.reason}`);
  return result;
}

function rejectedReason(state: MatchState, action: Action): string {
  const result = applyAction(state, action);
  if (result.ok) throw new Error('expected the action to be rejected');
  return result.reason;
}

function unitAt(state: MatchState, id: string) {
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`no unit ${id}`);
  return unit;
}

/** The same pool the setup filled, emptied, without playing the turns that would empty it. */
function withEmptyPool(state: MatchState, id: string): MatchState {
  return {
    ...state,
    units: state.units.map((unit) => (unit.id === id ? { ...unit, ammo: 0 } : unit)),
  };
}

const STRIKE: Action = { type: 'attack', actor: 'wizard', target: 'target' };

describe('mana', () => {
  it('starts with a full pool', () => {
    const state = newMatch(casterSetup());

    expect(unitAt(state, 'wizard').ammo).toBe(3);
    expect(unitAt(state, 'wizard').resourceKind).toBe('mana');
  });

  it('spends one mana on a strike at range 1', () => {
    const state = newMatch(casterSetup({}, { position: { x: 0, y: 1 } }));
    const result = play(state, STRIKE);

    expect(result.events).toEqual([
      expect.objectContaining({ type: 'attacked', hit: true, damage: 3, resource: 'mana' }),
    ]);
    expect(unitAt(result.state, 'wizard').ammo).toBe(2);
  });

  it('spends one mana on a strike at range 3', () => {
    const state = newMatch(casterSetup());
    const result = play(state, STRIKE);

    expect(result.events).toEqual([
      expect.objectContaining({ type: 'attacked', resource: 'mana' }),
    ]);
    expect(unitAt(result.state, 'wizard').ammo).toBe(2);
  });

  it('deals the full attack at range 1 and at range 3, with no melee halving', () => {
    const near = play(newMatch(casterSetup({ attack: 5 }, { position: { x: 0, y: 1 } })), STRIKE);
    const far = play(newMatch(casterSetup({ attack: 5 })), STRIKE);

    // Half of 5 would be 2, which is what the melee fallback used to deal at an adjacent target.
    expect(near.events[0]).toEqual(expect.objectContaining({ damage: 5 }));
    expect(far.events[0]).toEqual(expect.objectContaining({ damage: 5 }));
  });

  it('refuses a strike with no mana, whatever the distance', () => {
    // 1 and 3 are inside the reach, 4 is outside it: the empty pool is answered before the reach is.
    for (const position of [{ x: 0, y: 1 }, { x: 0, y: 3 }, { x: 0, y: 4 }]) {
      const empty = withEmptyPool(newMatch(casterSetup({}, { position })), 'wizard');
      expect(rejectedReason(empty, STRIKE)).toBe('no-mana');
    }
  });

  it('refuses with no event and without touching the state', () => {
    const empty = withEmptyPool(newMatch(casterSetup({}, { position: { x: 0, y: 3 } })), 'wizard');
    const before = hashState(empty);

    expect(applyAction(empty, STRIKE)).toEqual({ ok: false, reason: 'no-mana' });
    expect(hashState(empty)).toBe(before);
  });

  it('meditation refills the pool and spends the action, not the movement', () => {
    const state = withEmptyPool(newMatch(casterSetup()), 'wizard');
    const result = play(state, { type: 'reload', actor: 'wizard' });

    expect(result.events).toEqual([{ type: 'reloaded', actor: 'wizard' }]);
    expect(unitAt(result.state, 'wizard').ammo).toBe(3);
    expect(result.state.hasActed).toBe(true);
    expect(result.state.movementLeft).toBe(state.movementLeft);
  });

  it('a second meditation in the same turn is already-acted', () => {
    const state = withEmptyPool(newMatch(casterSetup()), 'wizard');
    const meditated = play(state, { type: 'reload', actor: 'wizard' });

    expect(rejectedReason(meditated.state, { type: 'reload', actor: 'wizard' })).toBe(
      'already-acted',
    );
  });

  it('meditation with a full pool is magazine-full', () => {
    expect(rejectedReason(newMatch(casterSetup()), { type: 'reload', actor: 'wizard' })).toBe(
      'magazine-full',
    );
  });

  it('a priest reaches two cells and not three', () => {
    const priest: Partial<Unit> = { range: 2, resourceKind: 'mana', primaryClass: 'priest' };
    const inReach = play(newMatch(casterSetup(priest, { position: { x: 0, y: 2 } })), STRIKE);
    expect(inReach.ok).toBe(true);

    // Out of reach is still out of reach with a full pool: the reach is not the resource's business.
    expect(
      rejectedReason(newMatch(casterSetup(priest, { position: { x: 0, y: 3 } })), STRIKE),
    ).toBe('target-out-of-range');
  });

  it('a spell through a building has no line of sight', () => {
    const state = newMatch(casterSetup({}, { position: { x: 2, y: 0 } }, { '1,0': 5 }));

    expect(rejectedReason(state, STRIKE)).toBe('no-line-of-sight');
  });

  it('replays a match of strikes and meditation to the same state and the same hash', () => {
    const setup = casterSetup();
    const steps: Action[] = [
      STRIKE,
      { type: 'endTurn', actor: 'wizard', round: 1 },
      { type: 'endTurn', actor: 'target', round: 1 },
      // Round 2: the wizard has the turn again with two mana of three, so it meditates back to full.
      { type: 'reload', actor: 'wizard' },
    ];

    const run = () => {
      let state = newMatch(setup);
      const events: Event[] = [];
      for (const step of steps) {
        const result = play(state, step);
        events.push(...result.events);
        state = result.state;
      }
      return { state, events };
    };

    const first = run();
    const second = run();

    expect(hashState(first.state)).toBe(hashState(second.state));
    expect(hashState(applyEvents(setup, first.events))).toBe(hashState(first.state));
  });
});
