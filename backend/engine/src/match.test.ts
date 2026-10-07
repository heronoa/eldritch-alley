import { describe, expect, it } from 'vitest';
import { newMatch, publicState } from './match';
import type { Board, MatchSetup, MatchState, Prop, Team, Unit } from './types';

function makeBoard(heights: Record<string, number> = {}, props: readonly Prop[] = []): Board {
  const levels = new Array<number>(64).fill(0);
  for (const [key, level] of Object.entries(heights)) {
    const [x, y] = key.split(',').map(Number);
    levels[y * 8 + x] = level;
  }
  return { width: 8, height: 8, levels, props };
}

function coverAt(x: number, y: number): Prop {
  return { position: { x, y }, kind: 'cover' };
}

function wallAt(x: number, y: number): Prop {
  return { position: { x, y }, kind: 'wall' };
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

  it('captures the health the setup declares as the maximum health of the unit', () => {
    const state = newMatch(
      makeSetup({}, [
        makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 9, health: 7 }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 5, health: 13 }),
      ]),
    );
    expect(state.units.map((unit) => unit.maxHealth)).toEqual([7, 13]);
    expect(state.units.map((unit) => unit.health)).toEqual([7, 13]);
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

  it('carries the props of the board, and answers an empty list when the setup left them out', () => {
    // The setup may leave `props` out, the way it may leave `movementProfile` out of a unit; the board
    // inside a match always carries one, the way `UnitState` always carries a profile.
    const bare: Board = { width: 8, height: 8, levels: new Array<number>(64).fill(0) };
    expect(newMatch(makeSetup({ map: bare })).board.props).toEqual([]);

    const props = [coverAt(3, 3), wallAt(5, 5)];
    expect(newMatch(makeSetup({ map: makeBoard({}, props) })).board.props).toEqual(props);
  });

  it('copies the props instead of aliasing the setup', () => {
    const setup = makeSetup({ map: makeBoard({}, [coverAt(3, 3)]) });
    const state = newMatch(setup);

    expect(state.board.props).toEqual(setup.map.props);
    expect(state.board.props).not.toBe(setup.map.props);
  });

  it('accepts a wall on the cell a unit stands on, which is the limit of the blocking rule', () => {
    // Only the cells strictly between the two ends block (`sight.ts`), so a wall under a unit is a
    // wall it stands on. That is a board the engine plays rather than a board it refuses.
    const setup = makeSetup({ map: makeBoard({}, [wallAt(0, 0)]) });

    expect(() => newMatch(setup)).not.toThrow();
    expect(newMatch(setup).board.props).toEqual([wallAt(0, 0)]);
  });

  it('opens every unit facing its own side of the map (decision D1)', () => {
    const state = newMatch(
      makeSetup({}, [
        makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 9 }),
        makeUnit({ id: 'a2', team: 'A', position: { x: 3, y: 5 }, speed: 7 }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 4, y: 0 }, speed: 5 }),
        makeUnit({ id: 'b2', team: 'B', position: { x: 7, y: 5 }, speed: 3 }),
      ]),
    );

    // The left half of the board looks east, towards the middle, and the right half looks west.
    expect(state.units.map((unit) => unit.facing)).toEqual(['E', 'E', 'W', 'W']);
  });

  it('reads the opening facing from the spawn alone, so the seed does not move it', () => {
    const units = [
      makeUnit({ id: 'a1', team: 'A', position: { x: 1, y: 4 }, speed: 9 }),
      makeUnit({ id: 'b1', team: 'B', position: { x: 6, y: 4 }, speed: 5 }),
    ];
    const openings = (seed: number) =>
      newMatch(makeSetup({ seed }, units)).units.map((unit) => unit.facing);

    expect(openings(1)).toEqual(['E', 'W']);
    expect(openings(999)).toEqual(openings(1));
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
    {
      name: 'a prop outside the board',
      setup: makeSetup({ map: makeBoard({}, [coverAt(8, 0)]) }),
    },
    {
      name: 'a prop on a cell that is not whole',
      setup: makeSetup({ map: makeBoard({}, [coverAt(1.5, 0)]) }),
    },
    {
      name: 'two props on the same cell',
      setup: makeSetup({ map: makeBoard({}, [coverAt(3, 3), wallAt(3, 3)]) }),
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

  it('returns an independent copy, so changing the view cannot change the state', () => {
    const state = newMatch(makeSetup());
    const view = publicState(state);

    view.units[0].position.x = 6;
    view.units[0].equipment.mainHand = 'changed';
    view.board.levels[0] = 9;
    view.initiative.push('ghost');

    expect(state.units[0].position.x).toBe(0);
    expect(state.units[0].equipment.mainHand).toBeNull();
    expect(state.board.levels[0]).toBe(0);
    expect(state.initiative).toEqual(['a1', 'b1']);
  });

  it('is the same for two states that differ only in rng state', () => {
    const state = newMatch(makeSetup());
    const other: MatchState = { ...state, rng: { state: state.rng.state + 12345 } };

    expect(publicState(other)).toEqual(publicState(state));
  });
});
