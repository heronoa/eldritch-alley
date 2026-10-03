import { describe, expect, it } from 'vitest';
import { newMatch, publicState } from './match';
import type { Board, MatchSetup, MatchState, Team, Unit } from './types';

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

function makeSetup(overrides: Partial<MatchSetup> = {}, units?: Unit[]): MatchSetup {
  const squad =
    units ??
    [
      makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 9, movement: 4 }),
      makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 5, movement: 3 }),
    ];
  const team = (id: Team) => squad.filter((unit) => unit.team === id);
  return { seed: 1, map: makeBoard(), teams: [team('A'), team('B')], ...overrides };
}

describe('newMatch', () => {
  it('builds the initial state', () => {
    const state = newMatch(makeSetup());
    expect(state.units.map((unit) => unit.id)).toEqual(['a1', 'b1']);
    expect(state.units.every((unit) => unit.defeated === false)).toBe(true);
    expect(state.initiative).toEqual(['a1', 'b1']);
    expect(state.currentIndex).toBe(0);
    expect(state.rng.state).toBe(1);
    expect(state.eventCount).toBe(0);
    expect(state.hasActed).toBe(false);
    expect(state.movementLeft).toBe(4);
    expect(state.board.levels).toHaveLength(64);
  });

  it('starts the turn with the movement budget of the current unit', () => {
    const state = newMatch(
      makeSetup({}, [
        makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 9, movement: 2 }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 5, movement: 6 }),
      ]),
    );
    expect(state.movementLeft).toBe(2);
  });

  it('keeps the unit data used by post-MVP progression', () => {
    const state = newMatch(
      makeSetup({}, [
        makeUnit({
          id: 'a1',
          team: 'A',
          position: { x: 0, y: 0 },
          nerve: 80,
          attunement: 40,
          primaryClass: 'adept',
          equipment: {
            armor: null,
            helmet: null,
            mainHand: 'blade',
            offHand: null,
            accessory1: null,
            accessory2: null,
          },
          abilities: { activeSets: ['fireball', null], reaction: 'counter', movement: 'dash', support: null },
        }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 } }),
      ]),
    );
    const unit = state.units[0];
    expect(unit.nerve).toBe(80);
    expect(unit.attunement).toBe(40);
    expect(unit.primaryClass).toBe('adept');
    expect(unit.equipment.mainHand).toBe('blade');
    expect(unit.abilities.activeSets).toEqual(['fireball', null]);
  });

  it('copies the board instead of aliasing the setup', () => {
    const setup = makeSetup();
    const state = newMatch(setup);
    expect(state.board.levels).toEqual(setup.map.levels);
    expect(state.board.levels).not.toBe(setup.map.levels);
  });
});

describe('newMatch validation', () => {
  const cases: { name: string; setup: MatchSetup }[] = [
    {
      name: 'duplicate positions',
      setup: makeSetup({}, [
        makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 } }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 0, y: 0 } }),
      ]),
    },
    {
      name: 'out-of-bounds positions',
      setup: makeSetup({}, [
        makeUnit({ id: 'a1', team: 'A', position: { x: 8, y: 0 } }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 } }),
      ]),
    },
    {
      name: 'a non-integer unit value',
      setup: makeSetup({}, [
        makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 1.5 }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 } }),
      ]),
    },
    {
      name: 'a non-integer position',
      setup: makeSetup({}, [
        makeUnit({ id: 'a1', team: 'A', position: { x: 0.5, y: 0 } }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 } }),
      ]),
    },
    {
      name: 'a nerve outside 0..100',
      setup: makeSetup({}, [
        makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, nerve: 101 }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 } }),
      ]),
    },
    {
      name: 'a non-integer height level',
      setup: makeSetup({ map: makeBoard({ '3,3': 1.5 }) }),
    },
    {
      name: 'an empty team',
      setup: makeSetup({}, [makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 } })]),
    },
    {
      name: 'two units with the same id',
      setup: makeSetup({}, [
        makeUnit({ id: 'x', team: 'A', position: { x: 0, y: 0 } }),
        makeUnit({ id: 'x', team: 'B', position: { x: 7, y: 7 } }),
      ]),
    },
    {
      name: 'a negative seed',
      setup: makeSetup({ seed: -1 }),
    },
    {
      name: 'a seed that is not an integer',
      setup: makeSetup({ seed: 1.5 }),
    },
    {
      name: 'a seed above the unsigned 32-bit range',
      setup: makeSetup({ seed: 0x100000000 }),
    },
  ];

  for (const testCase of cases) {
    it(`throws a RangeError for ${testCase.name}`, () => {
      expect(() => newMatch(testCase.setup)).toThrow(RangeError);
    });
  }
});

describe('publicState', () => {
  it('has no rng field and equals the state in every other field', () => {
    const state = newMatch(makeSetup());
    const view = publicState(state);

    expect('rng' in view).toBe(false);
    for (const key of Object.keys(state)) {
      if (key === 'rng') continue;
      expect(view[key as keyof typeof view]).toEqual(state[key as keyof MatchState]);
    }
  });

  it('is the same for two states that differ only in rng state', () => {
    const state = newMatch(makeSetup());
    const other: MatchState = { ...state, rng: { state: state.rng.state + 12345 } };

    expect(publicState(other)).toEqual(publicState(state));
  });
});
