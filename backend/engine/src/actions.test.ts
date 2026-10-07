import { describe, expect, it } from 'vitest';
import { canStillAct, resolveHit } from './actions';
import { COVER_HIT_PENALTY } from './cover';
import { DIRECTION_BONUS } from './facing';
import { heightBonus } from './height';
import { currentUnitId } from './initiative';
import { applyAction, hashState, newMatch } from './match';
import { moveCost } from './movement';
import { createRng, nextInt } from './rng';
import type {
  ActionResult,
  Action,
  Board,
  MatchSetup,
  MatchState,
  Position,
  Prop,
  RejectReason,
  Team,
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

function makeSetup(units: Unit[], heights: Record<string, number> = {}): MatchSetup {
  const team = (id: Team) => units.filter((unit) => unit.team === id);
  return { seed: 1, map: makeBoard(heights), teams: [team('A'), team('B')] };
}

function twoUnitSetup(
  a1: Partial<Unit> = {},
  b1: Partial<Unit> = {},
  heights: Record<string, number> = {},
): MatchSetup {
  return makeSetup(
    [
      makeUnit({
        id: 'a1',
        team: 'A',
        position: { x: 0, y: 0 },
        speed: 10,
        movement: 4,
        attack: 3,
        hitChance: 100,
        range: 1,
        ...a1,
      }),
      makeUnit({
        id: 'b1',
        team: 'B',
        position: { x: 7, y: 7 },
        speed: 1,
        health: 10,
        ...b1,
      }),
    ],
    heights,
  );
}

function accepted(result: ActionResult) {
  if (!result.ok) throw new Error(`expected the action to be accepted, got ${result.reason}`);
  return result;
}

function rejected(result: ActionResult) {
  if (result.ok) throw new Error('expected the action to be rejected');
  return result;
}

function unitAt(state: MatchState, id: string) {
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`no unit with id ${id}`);
  return unit;
}

/**
 * A two-unit match played up to the second turn of `a1`: the queue has wrapped, the round is 2, and
 * the unit with the turn is the one that already played. It is the state a late message arrives at.
 */
function backToA(state: MatchState): MatchState {
  const first = accepted(applyAction(state, { type: 'endTurn', actor: 'a1', round: state.round }));
  return accepted(
    applyAction(first.state, { type: 'endTurn', actor: 'b1', round: first.state.round }),
  ).state;
}

/**
 * The duel the direction and height cases are read from. `a1` shoots `b1` from one cell away, with a
 * fixed attack and a fixed accuracy, so nothing but the direction and the relief moves the shot.
 * `b1` stands on (3,3), the left half of the board, so it opens facing east (decision D1) unless the
 * case moves it.
 */
function duel(
  attackerAt: Position,
  overrides: Partial<Unit> = {},
  targetAt: Position = { x: 3, y: 3 },
  heights: Record<string, number> = {},
): MatchSetup {
  const units = [
    makeUnit({
      id: 'a1',
      team: 'A',
      position: attackerAt,
      speed: 10,
      movement: 0,
      attack: 3,
      hitChance: 100,
      range: 2,
      ...overrides,
    }),
    makeUnit({ id: 'b1', team: 'B', position: targetAt, speed: 1, movement: 0, health: 30 }),
  ];
  const team = (id: Team) => units.filter((unit) => unit.team === id);

  return { seed: 1, map: makeBoard(heights), teams: [team('A'), team('B')] };
}

/** The `attacked` event of the single shot a duel is built to take. */
function duelShot(setup: MatchSetup) {
  const result = accepted(
    applyAction(newMatch(setup), { type: 'attack', actor: 'a1', target: 'b1' }),
  );
  const event = result.events[0];
  if (event.type !== 'attacked') throw new Error(`expected an attack, got ${event.type}`);
  return event;
}

/** East of the duel's target, which looks east: a shot at its face. */
const FRONT: Position = { x: 4, y: 3 };
/** West of it: a shot at its back. */
const REAR: Position = { x: 2, y: 3 };
/** Over its shoulder, neither ahead nor behind: a flank shot. */
const FLANK: Position = { x: 3, y: 2 };

describe('move cost', () => {
  it('charges 1 per cell on flat ground', () => {
    const board = makeBoard();
    expect(moveCost(board, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1);
    expect(moveCost(board, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(1);
  });

  it('charges 1 extra for climbing one level and nothing extra for descending', () => {
    const climb = makeBoard({ '1,0': 1 });
    expect(moveCost(climb, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(2);

    const descend = makeBoard({ '0,0': 1 });
    expect(moveCost(descend, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1);
  });
});

describe('actions: move', () => {
  it('charges 1 for each step on flat ground and records the move', () => {
    const state = newMatch(twoUnitSetup());
    expect(state.movementLeft).toBe(4);

    const first = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 1, y: 0 } }));
    expect(first.events).toEqual([
      {
        type: 'moved',
        actor: 'a1',
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
        path: [{ x: 1, y: 0 }],
      },
    ]);
    expect(unitAt(first.state, 'a1').position).toEqual({ x: 1, y: 0 });
    expect(first.state.movementLeft).toBe(3);

    const second = accepted(
      applyAction(first.state, { type: 'move', actor: 'a1', to: { x: 2, y: 0 } }),
    );
    expect(second.state.movementLeft).toBe(2);
    expect(unitAt(second.state, 'a1').position).toEqual({ x: 2, y: 0 });
  });

  it('charges 1 extra for climbing a level', () => {
    const state = newMatch(twoUnitSetup({}, {}, { '0,1': 1 }));
    const result = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 0, y: 1 } }));
    expect(result.state.movementLeft).toBe(2);
  });

  it('charges nothing extra for descending a level', () => {
    const state = newMatch(twoUnitSetup({ position: { x: 0, y: 0 } }, {}, { '0,0': 1 }));
    const result = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 0, y: 1 } }));
    expect(result.state.movementLeft).toBe(3);
  });

  it('walks the cheapest path to a destination more than one step away', () => {
    const state = newMatch(twoUnitSetup({ movement: 4 }));
    const result = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 2, y: 0 } }));

    expect(result.events).toEqual([
      {
        type: 'moved',
        actor: 'a1',
        from: { x: 0, y: 0 },
        to: { x: 2, y: 0 },
        path: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
    ]);
    expect(unitAt(result.state, 'a1').position).toEqual({ x: 2, y: 0 });
    expect(result.state.movementLeft).toBe(2);
  });

  it('refuses a step of two levels with the height rule, which is what the step itself is', () => {
    const state = newMatch(twoUnitSetup({}, {}, { '0,1': 2 }));

    expect(rejected(applyAction(state, { type: 'move', actor: 'a1', to: { x: 0, y: 1 } })).reason).toBe(
      'height-step-too-high',
    );
  });

  it('refuses a destination whose only route needs a forbidden step with no-path', () => {
    // Buildings at (1,0) and (0,1) leave (1,1) as the only way out, and that step is two levels up:
    // the level is the obstacle, but the cell being stepped on is not the destination.
    const state = newMatch(twoUnitSetup({}, {}, { '1,0': 5, '0,1': 5, '1,1': 2 }));

    expect(rejected(applyAction(state, { type: 'move', actor: 'a1', to: { x: 2, y: 0 } })).reason).toBe(
      'no-path',
    );
  });

  it('refuses a climb with one point left, which is the case measured in the playtest', () => {
    // One step onto a cell one level up costs 2, so a unit with a single point left cannot take it.
    const state = newMatch(twoUnitSetup({ movement: 1 }, {}, { '0,1': 1 }));

    expect(rejected(applyAction(state, { type: 'move', actor: 'a1', to: { x: 0, y: 1 } })).reason).toBe(
      'no-path',
    );
  });

  it('rejects movement after the action is spent, because the turn is move first, then act', () => {
    const state = newMatch(twoUnitSetup({}, { position: { x: 0, y: 1 } }));
    const attacked = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    const result = rejected(
      applyAction(attacked.state, { type: 'move', actor: 'a1', to: { x: 1, y: 0 } }),
    );
    expect(result.reason).toBe('already-acted');
  });

  it('keeps the action available after moving', () => {
    const state = newMatch(twoUnitSetup({}, { position: { x: 1, y: 1 } }));
    const moved = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 0, y: 1 } }));
    expect(moved.state.hasActed).toBe(false);

    const attack = accepted(applyAction(moved.state, { type: 'attack', actor: 'a1', target: 'b1' }));
    expect(attack.state.hasActed).toBe(true);
  });
});

describe('actions: attack', () => {
  it('accepts a target at Chebyshev distance 1 and applies the damage', () => {
    const state = newMatch(twoUnitSetup({}, { position: { x: 0, y: 1 } }));
    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    // `a1` stands north of `b1`, which looks east: a flank shot, and the bonus of the table with it.
    expect(result.events).toEqual([
      {
        type: 'attacked',
        actor: 'a1',
        target: 'b1',
        hit: true,
        damage: 3 + DIRECTION_BONUS.flank.damage,
        rngState: expect.any(Number),
        resource: null,
        cover: false,
        direction: 'flank',
        stood: 0,
      },
    ]);
    expect(unitAt(result.state, 'b1').health).toBe(10 - 3 - DIRECTION_BONUS.flank.damage);
    expect(result.state.hasActed).toBe(true);
  });

  it('records a miss with no damage when the roll is above the hit chance', () => {
    const state = newMatch(twoUnitSetup({ hitChance: 0 }, { position: { x: 0, y: 1 } }));
    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    expect(result.events).toEqual([
      {
        type: 'attacked',
        actor: 'a1',
        target: 'b1',
        hit: false,
        damage: 0,
        rngState: expect.any(Number),
        resource: null,
        cover: false,
        direction: 'flank',
        stood: 0,
      },
    ]);
    expect(unitAt(result.state, 'b1').health).toBe(10);
    expect(result.state.hasActed).toBe(true);
  });

  it('lowers the health of the target and leaves its maximum health alone', () => {
    const state = newMatch(twoUnitSetup({ attack: 4 }, { position: { x: 0, y: 1 }, health: 10 }));
    const before = unitAt(state, 'b1');

    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    const after = unitAt(result.state, 'b1');
    // The damage is what the strike dealt, direction included: what this case is about is that the
    // ceiling of the target does not move with it.
    const damage = 4 + DIRECTION_BONUS.flank.damage;
    expect(after.health).toBe(before.health - damage);
    expect(after.maxHealth).toBe(before.maxHealth);
    expect(after.maxHealth).toBe(10);
  });

  it('marks a unit at zero health as defeated, keeps it in the state and drops it from the queue', () => {
    const state = newMatch(twoUnitSetup({ attack: 5 }, { position: { x: 0, y: 1 }, health: 5 }));
    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    const target = unitAt(result.state, 'b1');
    expect(target.health).toBe(0);
    expect(target.defeated).toBe(true);
    expect(result.state.units.map((unit) => unit.id)).toEqual(['a1', 'b1']);
    expect(result.state.initiative).toEqual(['a1']);
  });

  it('returns attacked followed by unit-defeated, in that order', () => {
    const state = newMatch(twoUnitSetup({ attack: 5 }, { position: { x: 0, y: 1 }, health: 1 }));
    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    expect(result.events.map((event) => event.type)).toEqual(['attacked', 'unit-defeated']);
    expect(result.events[1]).toEqual({ type: 'unit-defeated', target: 'b1' });
  });

  it('rejects a target at Chebyshev distance 2', () => {
    const state = newMatch(twoUnitSetup({}, { position: { x: 2, y: 0 } }));
    const result = rejected(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));
    expect(result.reason).toBe('target-out-of-range');
  });

  it('rejects an unknown target', () => {
    const state = newMatch(twoUnitSetup());
    const result = rejected(applyAction(state, { type: 'attack', actor: 'a1', target: 'ghost' }));
    expect(result.reason).toBe('target-invalid');
  });

  it('rejects a defeated target', () => {
    const setup = makeSetup([
      makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 10, attack: 5, range: 1 }),
      makeUnit({ id: 'a2', team: 'A', position: { x: 0, y: 2 }, speed: 9, range: 1 }),
      makeUnit({ id: 'b1', team: 'B', position: { x: 0, y: 1 }, speed: 5, health: 1 }),
      makeUnit({ id: 'b2', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
    ]);

    const killed = accepted(applyAction(newMatch(setup), { type: 'attack', actor: 'a1', target: 'b1' }));
    const passed = accepted(
      applyAction(killed.state, { type: 'endTurn', actor: 'a1', round: killed.state.round }),
    );
    expect(currentUnitId(passed.state)).toBe('a2');

    const result = rejected(applyAction(passed.state, { type: 'attack', actor: 'a2', target: 'b1' }));
    expect(result.reason).toBe('target-invalid');
  });

  it('rejects itself and its own team as a target', () => {
    const setup = makeSetup([
      makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 10, range: 1 }),
      makeUnit({ id: 'a2', team: 'A', position: { x: 0, y: 1 }, speed: 9, range: 1 }),
      makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
    ]);
    const state = newMatch(setup);

    expect(rejected(applyAction(state, { type: 'attack', actor: 'a1', target: 'a1' })).reason).toBe(
      'target-invalid',
    );
    expect(rejected(applyAction(state, { type: 'attack', actor: 'a1', target: 'a2' })).reason).toBe(
      'target-invalid',
    );
  });

  it('rejects a second action in the same turn', () => {
    const state = newMatch(twoUnitSetup({}, { position: { x: 0, y: 1 } }));
    const first = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));
    const second = rejected(applyAction(first.state, { type: 'attack', actor: 'a1', target: 'b1' }));
    expect(second.reason).toBe('already-acted');
  });
});

describe('actions: attack and line of sight', () => {
  /** A sniper on the ground, and a target two cells away with a building on the cell between them. */
  const throughABuilding = (sniper: Partial<Unit> = {}) =>
    twoUnitSetup({ range: 3, magazine: 3, ...sniper }, { position: { x: 2, y: 0 } }, { '1,0': 5 });

  it('rejects a shot through a building', () => {
    const result = rejected(
      applyAction(newMatch(throughABuilding()), { type: 'attack', actor: 'a1', target: 'b1' }),
    );

    expect(result.reason).toBe('no-line-of-sight');
  });

  it('accepts the shot when the same buildings are out of the line', () => {
    // The control for the case above: the same distance, the same reach, no building in between.
    const state = newMatch(
      twoUnitSetup({ range: 3, magazine: 3 }, { position: { x: 2, y: 0 } }, { '1,0': 0 }),
    );
    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    expect(result.events).toEqual([
      expect.objectContaining({ type: 'attacked', actor: 'a1', target: 'b1', resource: 'ammo' }),
    ]);
  });

  it('accepts the sniper shot across the rooftop gap: the playtest case', () => {
    // The playtest cells (5,2) to (7,2) of the roof map, levelled: the two roofs at 6, the gap between
    // them at 0. The gap is below the sight line, so it does not block.
    const state = newMatch(
      twoUnitSetup({ range: 3, magazine: 3 }, { position: { x: 2, y: 0 } }, { '0,0': 6, '2,0': 6 }),
    );
    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    expect(result.events).toEqual([
      expect.objectContaining({ type: 'attacked', actor: 'a1', target: 'b1', resource: 'ammo' }),
    ]);
  });

  it('refuses the same shot from an empty magazine, before the sight is read', () => {
    // The reach check no longer turns a spent magazine into a melee blow: the resource is answered
    // first, and the answer is the same whatever the line of sight says (EA-14, ADR 0011).
    const state = newMatch(throughABuilding());
    const empty = {
      ...state,
      units: state.units.map((unit) => (unit.id === 'a1' ? { ...unit, ammo: 0 } : unit)),
    };

    expect(rejected(applyAction(empty, { type: 'attack', actor: 'a1', target: 'b1' })).reason).toBe(
      'no-ammunition',
    );
  });

  it('a wizard at range 2 shoots across the rooftop gap (EA-14)', () => {
    const state = newMatch(
      twoUnitSetup(
        { range: 3, magazine: 3, resourceKind: 'mana' },
        { position: { x: 2, y: 0 } },
        { '0,0': 6, '2,0': 6 },
      ),
    );
    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    expect(result.events).toEqual([
      expect.objectContaining({ type: 'attacked', actor: 'a1', target: 'b1', resource: 'mana' }),
    ]);
    expect(unitAt(result.state, 'a1').ammo).toBe(2);
  });

  it('a priest at range 2 shoots across the rooftop gap (EA-14)', () => {
    const state = newMatch(
      twoUnitSetup(
        { range: 2, magazine: 3, resourceKind: 'mana' },
        { position: { x: 2, y: 0 } },
        { '0,0': 6, '2,0': 6 },
      ),
    );
    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    expect(result.events).toEqual([
      expect.objectContaining({ type: 'attacked', actor: 'a1', target: 'b1', resource: 'mana' }),
    ]);
    expect(unitAt(result.state, 'a1').ammo).toBe(2);
  });
});

describe('actions: attack and cover', () => {
  /**
   * The duel of the cover cases: `a1` on (4,3) shoots `b1` on (6,3), with the cell (5,3) between them
   * free for a prop. The board is flat, so nothing but a prop can change the shot.
   */
  function coverSetup(
    seed: number,
    props: readonly Prop[],
    overrides: Partial<Unit> = {},
  ): MatchSetup {
    const units = [
      makeUnit({
        id: 'a1',
        team: 'A',
        position: { x: 4, y: 3 },
        speed: 10,
        movement: 0,
        attack: 3,
        hitChance: 100,
        range: 2,
        ...overrides,
      }),
      makeUnit({ id: 'b1', team: 'B', position: { x: 6, y: 3 }, speed: 1, movement: 0 }),
    ];
    const team = (id: Team) => units.filter((unit) => unit.team === id);

    return { seed, map: { ...makeBoard(), props }, teams: [team('A'), team('B')] };
  }

  /** The `attacked` event of the single shot this match is built to take. */
  function shot(seed: number, props: readonly Prop[], overrides: Partial<Unit> = {}) {
    const state = newMatch(coverSetup(seed, props, overrides));
    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));
    const event = result.events[0];
    if (event.type !== 'attacked') throw new Error(`expected an attack, got ${event.type}`);
    return event;
  }

  /**
   * Seeds whose first roll of a match lands above `chance`, so the roll alone would hit and only the
   * cover penalty turns it into a miss. The shot is the first thing a match draws from its rng.
   */
  function seedsRollingAbove(chance: number): number[] {
    const seeds: number[] = [];

    for (let seed = 1; seed <= 400 && seeds.length < 5; seed += 1) {
      if (nextInt(createRng(seed), 1, 100) > chance) seeds.push(seed);
    }

    return seeds;
  }

  it('turns a hit into a miss when a crate stands between the two, on the same seed', () => {
    const seeds = seedsRollingAbove(100 - COVER_HIT_PENALTY);
    expect(seeds).toHaveLength(5);

    for (const seed of seeds) {
      expect(shot(seed, []).hit, `seed ${seed} with a clear line`).toBe(true);
      expect(shot(seed, [coverAt(5, 3)]).hit, `seed ${seed} behind a crate`).toBe(false);
    }
  });

  it('never lets the chance to hit fall below zero, and spends the shot all the same', () => {
    const state = newMatch(coverSetup(1, [coverAt(5, 3)], { hitChance: 10 }));
    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    expect(result.events).toEqual([
      {
        type: 'attacked',
        actor: 'a1',
        target: 'b1',
        hit: false,
        damage: 0,
        rngState: expect.any(Number),
        resource: null,
        cover: true,
        // The shooter stands west of a target looking west: dead ahead, so no bonus from the direction.
        direction: 'front',
        stood: 0,
      },
    ]);
    expect(unitAt(result.state, 'b1').health).toBe(10);
    expect(result.state.hasActed).toBe(true);
  });

  it('carries cover true exactly when the target stands behind a cover prop', () => {
    // The crate on the shooter's side of the target: cover. The same crate on the other flank, a
    // wall, and a crate across the map: none of them is cover.
    expect(shot(1, [coverAt(5, 3)]).cover).toBe(true);
    expect(shot(1, []).cover).toBe(false);
    expect(shot(1, [coverAt(6, 4)]).cover).toBe(false);
    expect(shot(1, [wallAt(5, 4)]).cover).toBe(false);
    expect(shot(1, [coverAt(2, 3)]).cover).toBe(false);
  });

  it('draws the same numbers with cover and without it, so a replay of either matches', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(shot(seed, [coverAt(5, 3)]).rngState, `seed ${seed}`).toBe(shot(seed, []).rngState);
    }
  });

  it('refuses the shot when a wall prop stands on the line', () => {
    const state = newMatch(coverSetup(1, [wallAt(5, 3)]));
    const result = rejected(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    expect(result.reason).toBe('no-line-of-sight');
  });
});

describe('resolveHit', () => {
  const attacker = makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, hitChance: 100 });
  const target = makeUnit({ id: 'b1', team: 'B', position: { x: 0, y: 1 } });
  // The roll reads the state for the board alone: these two stand on bare ground, so nothing modifies
  // their chance and what is measured here is the roll itself.
  const state = newMatch(twoUnitSetup({}, { position: { x: 0, y: 1 } }));

  it('turns a guaranteed chance into a hit and a zero chance into a miss on the same seed', () => {
    const hitRng = createRng(123);
    const missRng = createRng(123);
    expect(resolveHit(state, attacker, target, hitRng)).toBe(true);
    expect(resolveHit(state, { ...attacker, hitChance: 0 }, target, missRng)).toBe(false);
    expect(hitRng.state).toBe(missRng.state);
  });

  it('consults the roll for an accuracy in the middle of the range', () => {
    const outcomes = new Set<boolean>();
    for (let seed = 1; seed <= 200; seed++) {
      outcomes.add(resolveHit(state, { ...attacker, hitChance: 50 }, target, createRng(seed)));
    }
    expect([...outcomes].sort()).toEqual([false, true]);
  });

  it('does not change the shape of the state', () => {
    const hit = accepted(
      applyAction(
        newMatch(twoUnitSetup({}, { position: { x: 0, y: 1 } })),
        { type: 'attack', actor: 'a1', target: 'b1' },
      ),
    );
    const miss = accepted(
      applyAction(
        newMatch(twoUnitSetup({ hitChance: 0 }, { position: { x: 0, y: 1 } })),
        { type: 'attack', actor: 'a1', target: 'b1' },
      ),
    );

    expect(Object.keys(miss.state).sort()).toEqual(Object.keys(hit.state).sort());
    expect(Object.keys(miss.state.units[0]).sort()).toEqual(Object.keys(hit.state.units[0]).sort());
  });
});

describe('actions: endTurn', () => {
  it('ends the turn, hands it to the next unit and resets the turn budget', () => {
    const state = newMatch(twoUnitSetup({ movement: 4 }, { movement: 3 }));
    const moved = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 1, y: 0 } }));
    expect(moved.state.movementLeft).toBe(3);

    const ended = accepted(
      applyAction(moved.state, { type: 'endTurn', actor: 'a1', round: moved.state.round }),
    );
    expect(ended.events).toEqual([{ type: 'turn-ended', actor: 'a1', next: 'b1', round: 1 }]);
    expect(currentUnitId(ended.state)).toBe('b1');
    expect(ended.state.hasActed).toBe(false);
    expect(ended.state.movementLeft).toBe(3);
  });

  it('starts a new round when the last unit in the queue ends its turn', () => {
    const state = newMatch(twoUnitSetup({ movement: 4 }, { movement: 3 }));
    const first = accepted(
      applyAction(state, { type: 'endTurn', actor: 'a1', round: state.round }),
    );
    const second = accepted(
      applyAction(first.state, { type: 'endTurn', actor: 'b1', round: first.state.round }),
    );

    expect(currentUnitId(second.state)).toBe('a1');
    expect(second.state.movementLeft).toBe(4);
  });

  it('is available after the unit has acted', () => {
    const state = newMatch(twoUnitSetup({}, { position: { x: 0, y: 1 } }));
    const attacked = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));
    expect(attacked.state.hasActed).toBe(true);

    const ended = accepted(
      applyAction(attacked.state, { type: 'endTurn', actor: 'a1', round: attacked.state.round }),
    );
    expect(currentUnitId(ended.state)).toBe('b1');
  });

  /**
   * The round is what protects the next turn from a message that arrives late (ADR 0010, D5): the
   * countdown of EA-4 sends `endTurn` from the client, and the answer has to be about this turn.
   */
  it('names the round it applies to, and takes the current one', () => {
    const state = newMatch(twoUnitSetup());
    const ended = accepted(applyAction(state, { type: 'endTurn', actor: 'a1', round: 1 }));

    expect(currentUnitId(ended.state)).toBe('b1');
  });

  it('refuses an endTurn that names a round the match has left behind', () => {
    const state = backToA(newMatch(twoUnitSetup()));

    expect(state.round).toBe(2);
    expect(rejected(applyAction(state, { type: 'endTurn', actor: 'a1', round: 1 })).reason).toBe(
      'stale-turn',
    );
    expect(currentUnitId(state)).toBe('a1');
  });

  it('takes the endTurn of the new round, so the check is the round and not the unit', () => {
    const state = backToA(newMatch(twoUnitSetup()));

    const ended = accepted(applyAction(state, { type: 'endTurn', actor: 'a1', round: state.round }));
    expect(currentUnitId(ended.state)).toBe('b1');
  });

  it('answers not-your-turn before stale-turn, so a misdirected command is never blamed on the round', () => {
    const state = newMatch(twoUnitSetup());

    expect(rejected(applyAction(state, { type: 'endTurn', actor: 'b1', round: 99 })).reason).toBe(
      'not-your-turn',
    );
  });
});

/**
 * A move stays on the board, and can be taken back, until it is committed (EA-5, D3). The commit is
 * the first action that is not another move, and it is what makes the movement final.
 */
describe('actions: pending move', () => {
  /**
   * A turn of `a1` with a run already open: it walked two of its four points, and `b1` waits next to
   * the cell it ended on, so the unit has somebody to shoot from there.
   */
  function openRun(): MatchState {
    const state = newMatch(twoUnitSetup({ movement: 4 }, { position: { x: 2, y: 1 }, health: 50 }));
    return accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 2, y: 0 } })).state;
  }

  /** The same run, on a unit with a round to spare, so reloading is one of the ways to close it. */
  function openRunWithARoundToSpare(): MatchState {
    const state = openRun();
    return {
      ...state,
      units: state.units.map((unit) =>
        unit.id === 'a1' ? { ...unit, magazine: 3, ammo: 2 } : unit,
      ),
    };
  }

  it('opens a run on the cell the movement started on, and grows it with every move', () => {
    const state = newMatch(twoUnitSetup({ movement: 4 }));
    expect(state.pendingMove).toBeNull();

    const first = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 2, y: 0 } }));
    expect(first.state.pendingMove).toEqual({ from: { x: 0, y: 0 }, cost: 2 });

    const second = accepted(applyAction(first.state, { type: 'move', actor: 'a1', to: { x: 3, y: 0 } }));
    expect(second.state.pendingMove).toEqual({ from: { x: 0, y: 0 }, cost: 3 });

    // The state the second move was played on keeps its own run: a state is never changed in place.
    expect(first.state.pendingMove).toEqual({ from: { x: 0, y: 0 }, cost: 2 });
    expect(unitAt(first.state, 'a1').position).toEqual({ x: 2, y: 0 });
    expect(first.state.movementLeft).toBe(2);
  });

  it('takes the unit back to the origin and gives back the movement the run spent', () => {
    const moved = accepted(
      applyAction(newMatch(twoUnitSetup({ movement: 4 })), {
        type: 'move',
        actor: 'a1',
        to: { x: 2, y: 0 },
      }),
    );

    const cancelled = accepted(applyAction(moved.state, { type: 'cancelMove', actor: 'a1' }));

    expect(cancelled.events).toEqual([{ type: 'move-cancelled', actor: 'a1' }]);
    expect(unitAt(cancelled.state, 'a1').position).toEqual({ x: 0, y: 0 });
    expect(cancelled.state.movementLeft).toBe(4);
    expect(cancelled.state.pendingMove).toBeNull();
  });

  it('gives back what was spent: a run of two returns two of four, a run of four returns all four', () => {
    const setup = twoUnitSetup({ movement: 4 });

    const half = accepted(applyAction(newMatch(setup), { type: 'move', actor: 'a1', to: { x: 2, y: 0 } }));
    expect(half.state.movementLeft).toBe(2);
    const halfBack = accepted(applyAction(half.state, { type: 'cancelMove', actor: 'a1' }));
    expect(halfBack.state.movementLeft).toBe(4);

    const all = accepted(applyAction(newMatch(setup), { type: 'move', actor: 'a1', to: { x: 4, y: 0 } }));
    expect(all.state.movementLeft).toBe(0);
    const allBack = accepted(applyAction(all.state, { type: 'cancelMove', actor: 'a1' }));
    expect(allBack.state.movementLeft).toBe(4);
  });

  it('takes two moves back to the origin of the first one, with the cost of both given back', () => {
    const state = newMatch(twoUnitSetup({ movement: 4 }));
    const first = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 2, y: 0 } }));
    const second = accepted(applyAction(first.state, { type: 'move', actor: 'a1', to: { x: 3, y: 0 } }));
    expect(second.state.movementLeft).toBe(1);

    const cancelled = accepted(applyAction(second.state, { type: 'cancelMove', actor: 'a1' }));

    expect(unitAt(cancelled.state, 'a1').position).toEqual({ x: 0, y: 0 });
    expect(cancelled.state.movementLeft).toBe(4);
  });

  /** The actions that close a run from a state that has one open, with how that state is reached. */
  const commits: { action: Action; open: () => MatchState }[] = [
    { action: { type: 'attack', actor: 'a1', target: 'b1' }, open: openRun },
    { action: { type: 'reload', actor: 'a1' }, open: openRunWithARoundToSpare },
    { action: { type: 'commitMove', actor: 'a1' }, open: openRun },
  ];

  for (const { action, open } of commits) {
    it(`commits the run on ${action.type}, and refuses a cancel after it`, () => {
      const committed = accepted(applyAction(open(), action));

      expect(committed.state.pendingMove).toBeNull();
      expect(rejected(applyAction(committed.state, { type: 'cancelMove', actor: 'a1' })).reason).toBe(
        'no-pending-move',
      );
    });
  }

  it('closes the run when the turn ends, so the next turn starts with none of its own', () => {
    const ended = accepted(applyAction(openRun(), { type: 'endTurn', actor: 'a1', round: 1 }));

    expect(ended.state.pendingMove).toBeNull();
    expect(currentUnitId(ended.state)).toBe('b1');
    expect(rejected(applyAction(ended.state, { type: 'cancelMove', actor: 'b1' })).reason).toBe(
      'no-pending-move',
    );
  });

  it('confirms the movement without acting and without ending the turn', () => {
    const committed = accepted(applyAction(openRun(), { type: 'commitMove', actor: 'a1' }));

    expect(committed.events).toEqual([{ type: 'move-committed', actor: 'a1' }]);
    expect(unitAt(committed.state, 'a1').position).toEqual({ x: 2, y: 0 });
    expect(committed.state.movementLeft).toBe(2);
    expect(committed.state.hasActed).toBe(false);
    expect(committed.state.round).toBe(1);
    expect(currentUnitId(committed.state)).toBe('a1');
  });
});

/**
 * Whether the unit with the turn has anything left to do (EA-4). The client asks this question to
 * know when to pass the turn on its own, so it is the engine that answers it and the two sides agree
 * by construction. The engine never ends a turn by itself.
 */
describe('canStillAct', () => {
  /** A turn of `a1` with an empty chamber and nobody to shoot: only a reload is left. */
  function spentOneRound(): MatchState {
    const start = newMatch(
      twoUnitSetup(
        { magazine: 2, range: 1, movement: 0 },
        { position: { x: 0, y: 1 }, health: 50, movement: 4 },
      ),
    );

    const fired = accepted(applyAction(start, { type: 'attack', actor: 'a1', target: 'b1' }));
    const awayTurn = accepted(
      applyAction(fired.state, { type: 'endTurn', actor: 'a1', round: fired.state.round }),
    );
    // The enemy walks out of a reach of one, so nothing on the board is worth doing any more.
    const away = accepted(applyAction(awayTurn.state, { type: 'move', actor: 'b1', to: { x: 3, y: 3 } }));

    return accepted(
      applyAction(away.state, { type: 'endTurn', actor: 'b1', round: away.state.round }),
    ).state;
  }

  it('answers yes while a cell can still be walked to', () => {
    expect(canStillAct(newMatch(twoUnitSetup({ movement: 4 })))).toBe(true);
  });

  it('answers no when there is no cell, no target and nothing to reload', () => {
    const state = newMatch(twoUnitSetup({ movement: 0, magazine: 6 }));

    expect(unitAt(state, 'a1').ammo).toBe(6);
    expect(canStillAct(state)).toBe(false);
  });

  it('answers yes on a target in reach and in sight, even with nowhere to walk', () => {
    const state = newMatch(twoUnitSetup({ movement: 0 }, { position: { x: 0, y: 1 } }));

    expect(state.movementLeft).toBe(0);
    expect(canStillAct(state)).toBe(true);
  });

  it('answers no on a target that is in reach but out of sight', () => {
    // A wall two levels over the neighbouring cell: the shot is refused by the line of sight (EA-1).
    const state = newMatch(
      twoUnitSetup({ movement: 0, range: 2 }, { position: { x: 2, y: 0 } }, { '1,0': 5 }),
    );

    expect(canStillAct(state)).toBe(false);
  });

  it('answers no once the unit has acted, however much movement is left', () => {
    const state = newMatch(twoUnitSetup({ movement: 4 }, { position: { x: 0, y: 1 } }));
    const attacked = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    expect(attacked.state.hasActed).toBe(true);
    expect(attacked.state.movementLeft).toBe(4);
    expect(canStillAct(attacked.state)).toBe(false);
  });

  it('answers yes on an empty magazine with nobody in reach: reloading is a way to spend the turn', () => {
    const state = spentOneRound();

    expect(unitAt(state, 'a1').ammo).toBe(1);
    expect(unitAt(state, 'a1').magazine).toBe(2);
    expect(currentUnitId(state)).toBe('a1');
    expect(state.hasActed).toBe(false);
    expect(canStillAct(state)).toBe(true);
  });

  /**
   * A move that has not been committed is not a spent resource: the player still has to confirm it,
   * and until then the turn is not over (EA-5). The countdown of EA-4 waits with it.
   */
  it('answers yes while a move is waiting to be confirmed, however spent everything else is', () => {
    // One point of movement, no magazine and nobody in reach: the walk is all this turn has.
    const state = newMatch(twoUnitSetup({ movement: 1 }));
    const moved = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 1, y: 0 } }));

    expect(moved.state.movementLeft).toBe(0);
    expect(moved.state.pendingMove).toEqual({ from: { x: 0, y: 0 }, cost: 1 });
    expect(canStillAct(moved.state)).toBe(true);
  });

  it('answers no after the move is committed, when the turn really has nothing left', () => {
    const state = newMatch(twoUnitSetup({ movement: 1 }));
    const moved = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 1, y: 0 } }));
    const committed = accepted(applyAction(moved.state, { type: 'commitMove', actor: 'a1' }));

    expect(committed.state.pendingMove).toBeNull();
    expect(canStillAct(committed.state)).toBe(false);
  });

  it('answers no once the match is over', () => {
    const state = newMatch(twoUnitSetup({ attack: 5 }, { position: { x: 0, y: 1 }, health: 1 }));
    const killing = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    expect(canStillAct(killing.state)).toBe(false);
  });
});

describe('game over', () => {
  it('rejects every action once a team has no units left', () => {
    const state = newMatch(twoUnitSetup({ attack: 5 }, { position: { x: 0, y: 1 }, health: 1 }));
    const killing = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    for (const action of [
      { type: 'move', actor: 'a1', to: { x: 0, y: 1 } },
      { type: 'attack', actor: 'a1', target: 'b1' },
      { type: 'endTurn', actor: 'a1', round: 1 },
    ] as Action[]) {
      expect(rejected(applyAction(killing.state, action)).reason).toBe('game-over');
    }
  });
});

describe('rejections', () => {
  type RejectionCase = {
    reason: RejectReason;
    setup: MatchSetup;
    action: Action;
    prepare?: (state: MatchState) => MatchState;
  };

  const attackOnce = (state: MatchState): MatchState =>
    accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' })).state;

  /** A move played and then confirmed, so the turn has no run left to take back or to close. */
  const moveThenCommit = (state: MatchState): MatchState =>
    accepted(
      applyAction(
        accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 1, y: 0 } })).state,
        { type: 'commitMove', actor: 'a1' },
      ),
    ).state;

  /** The unit on turn with its pool emptied without spending it: what a strike cannot pay for. */
  const emptyResource = (state: MatchState): MatchState => ({
    ...state,
    units: state.units.map((unit) => (unit.id === 'a1' ? { ...unit, ammo: 0 } : unit)),
  });

  const cases: RejectionCase[] = [
    {
      reason: 'not-your-turn',
      setup: twoUnitSetup(),
      action: { type: 'move', actor: 'b1', to: { x: 6, y: 7 } },
    },
    {
      reason: 'out-of-bounds',
      setup: twoUnitSetup(),
      action: { type: 'move', actor: 'a1', to: { x: -1, y: 0 } },
    },
    {
      reason: 'no-path',
      setup: twoUnitSetup({ movement: 1 }),
      action: { type: 'move', actor: 'a1', to: { x: 2, y: 0 } },
    },
    {
      reason: 'cell-occupied',
      setup: twoUnitSetup({}, { position: { x: 0, y: 1 } }),
      action: { type: 'move', actor: 'a1', to: { x: 0, y: 1 } },
    },
    {
      reason: 'height-step-too-high',
      setup: twoUnitSetup({}, {}, { '0,1': 2 }),
      action: { type: 'move', actor: 'a1', to: { x: 0, y: 1 } },
    },
    {
      reason: 'already-acted',
      setup: twoUnitSetup({}, { position: { x: 0, y: 1 } }),
      action: { type: 'attack', actor: 'a1', target: 'b1' },
      prepare: attackOnce,
    },
    {
      reason: 'no-ammunition',
      setup: twoUnitSetup({ magazine: 3 }, { position: { x: 0, y: 1 } }),
      action: { type: 'attack', actor: 'a1', target: 'b1' },
      prepare: emptyResource,
    },
    {
      reason: 'no-mana',
      setup: twoUnitSetup({ magazine: 3, resourceKind: 'mana' }, { position: { x: 0, y: 1 } }),
      action: { type: 'attack', actor: 'a1', target: 'b1' },
      prepare: emptyResource,
    },
    {
      reason: 'target-out-of-range',
      setup: twoUnitSetup({}, { position: { x: 3, y: 3 } }),
      action: { type: 'attack', actor: 'a1', target: 'b1' },
    },
    {
      reason: 'target-invalid',
      setup: twoUnitSetup(),
      action: { type: 'attack', actor: 'a1', target: 'ghost' },
    },
    {
      reason: 'no-line-of-sight',
      setup: twoUnitSetup({ range: 2 }, { position: { x: 2, y: 0 } }, { '1,0': 5 }),
      action: { type: 'attack', actor: 'a1', target: 'b1' },
    },
    {
      reason: 'game-over',
      setup: twoUnitSetup({ attack: 5 }, { position: { x: 0, y: 1 }, health: 1 }),
      action: { type: 'endTurn', actor: 'a1', round: 1 },
      prepare: attackOnce,
    },
    {
      reason: 'stale-turn',
      setup: twoUnitSetup(),
      // Round 1 of a match that has already wrapped into round 2: the late message of EA-4.
      action: { type: 'endTurn', actor: 'a1', round: 1 },
      prepare: backToA,
    },
    {
      reason: 'no-pending-move',
      setup: twoUnitSetup(),
      // A move nobody played: there is no run to take back.
      action: { type: 'cancelMove', actor: 'a1' },
    },
    {
      reason: 'no-pending-move',
      setup: twoUnitSetup(),
      // Idle: a run can only be confirmed once one has been opened.
      action: { type: 'commitMove', actor: 'a1' },
    },
    {
      reason: 'no-pending-move',
      setup: twoUnitSetup(),
      // Committed: the run was closed by the confirmation, so there is nothing left to confirm.
      action: { type: 'commitMove', actor: 'a1' },
      prepare: moveThenCommit,
    },
    {
      reason: 'not-your-turn',
      setup: twoUnitSetup(),
      // The round is nonsense as well, and the turn is answered first: the order of the checks.
      action: { type: 'endTurn', actor: 'b1', round: 99 },
    },
  ];

  for (const testCase of cases) {
    it(`rejects with ${testCase.reason}, without an event and without touching the state`, () => {
      const start = testCase.prepare
        ? testCase.prepare(newMatch(testCase.setup))
        : newMatch(testCase.setup);
      const snapshot = JSON.parse(JSON.stringify(start)) as MatchState;
      const hashBefore = hashState(start);

      const result = applyAction(start, testCase.action);

      expect(result.ok).toBe(false);
      expect(rejected(result).reason).toBe(testCase.reason);
      expect('events' in result).toBe(false);
      expect('state' in result).toBe(false);
      expect(start).toEqual(snapshot);
      expect(hashState(start)).toBe(hashBefore);
    });
  }
});

describe('actions: face', () => {
  it('turns the unit without spending movement or the action, and without ending the turn', () => {
    const state = newMatch(twoUnitSetup());
    expect(unitAt(state, 'a1').facing).toBe('E');

    const turned = accepted(applyAction(state, { type: 'face', actor: 'a1', facing: 'S' }));

    expect(unitAt(turned.state, 'a1').facing).toBe('S');
    expect(turned.state.movementLeft).toBe(state.movementLeft);
    expect(turned.state.hasActed).toBe(state.hasActed);
    // Still the turn of the unit that turned: nothing was passed.
    expect(currentUnitId(turned.state)).toBe('a1');
    expect(turned.state.round).toBe(state.round);
  });

  it('records the turn as an event of its own, so a replay turns the unit too', () => {
    const state = newMatch(twoUnitSetup());
    const result = accepted(applyAction(state, { type: 'face', actor: 'a1', facing: 'N' }));

    expect(result.events).toEqual([{ type: 'faced', actor: 'a1', facing: 'N' }]);
  });

  it('is accepted after the unit has spent its action and its movement', () => {
    const state = newMatch(twoUnitSetup({}, { position: { x: 0, y: 1 } }));
    const spent = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' })).state;
    expect(spent.hasActed).toBe(true);
    expect(spent.movementLeft).toBe(4);

    const turned = accepted(applyAction(spent, { type: 'face', actor: 'a1', facing: 'W' }));

    expect(unitAt(turned.state, 'a1').facing).toBe('W');
    expect(turned.state.hasActed).toBe(true);
  });

  it('is refused for a unit that is not on turn', () => {
    const state = newMatch(twoUnitSetup());
    const result = rejected(applyAction(state, { type: 'face', actor: 'b1', facing: 'N' }));

    expect(result.reason).toBe('not-your-turn');
  });

  it('is refused in a match that is over', () => {
    const state = newMatch(twoUnitSetup({ attack: 5 }, { position: { x: 0, y: 1 }, health: 1 }));
    const over = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' })).state;

    const result = rejected(applyAction(over, { type: 'face', actor: 'a1', facing: 'N' }));

    expect(result.reason).toBe('game-over');
  });
});

describe('actions: move and facing', () => {
  it('leaves the unit facing the way its step went', () => {
    const state = newMatch(twoUnitSetup());

    const moved = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 0, y: 3 } }));

    expect(unitAt(moved.state, 'a1').facing).toBe('S');
  });

  it('breaks a diagonal step to the horizontal, through a walk of the match', () => {
    const state = newMatch(twoUnitSetup());

    const moved = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 1, y: 1 } }));

    expect(unitAt(moved.state, 'a1').facing).toBe('E');
  });
});

describe('actions: attack and facing', () => {
  /**
   * Seeds whose first roll of a match falls above the front chance and inside the rear one, so the
   * same roll is a miss at the face of the target and a hit at its back.
   */
  function seedsBetween(low: number, high: number): number[] {
    const seeds: number[] = [];

    for (let seed = 1; seed <= 2000 && seeds.length < 5; seed += 1) {
      const roll = nextInt(createRng(seed), 1, 100);
      if (roll > low && roll <= high) seeds.push(seed);
    }

    return seeds;
  }

  it('classifies the shot from where the attacker stands around the target', () => {
    expect(duelShot(duel(FRONT)).direction).toBe('front');
    expect(duelShot(duel(REAR)).direction).toBe('rear');
    expect(duelShot(duel(FLANK)).direction).toBe('flank');
  });

  it('reads the facing of the target, not the side of the board the attacker came from', () => {
    // The same relative geometry twice: the target on the left half looks east, the one on the right
    // half looks west, so a shot from the east is a shot at the face of one and at the back of the
    // other. What decides is where the target looks.
    expect(duelShot(duel({ x: 4, y: 3 })).direction).toBe('front');
    expect(duelShot(duel({ x: 5, y: 3 }, {}, { x: 4, y: 3 })).direction).toBe('rear');
  });

  it('hits from the rear on a roll the same shot from the front misses, on the same seed', () => {
    const front = 50;
    const seeds = seedsBetween(front, front + DIRECTION_BONUS.rear.hit);
    expect(seeds).toHaveLength(5);

    for (const seed of seeds) {
      const aimed = { hitChance: front };
      const frontShot = duelShot({ ...duel(FRONT, aimed), seed });
      const rearShot = duelShot({ ...duel(REAR, aimed), seed });

      expect(frontShot.hit, `seed ${seed} from the front`).toBe(false);
      expect(rearShot.hit, `seed ${seed} from the rear`).toBe(true);
    }
  });

  it('adds the direction bonus of the table to the damage, and nothing at all from the front', () => {
    expect(duelShot(duel(FRONT)).damage).toBe(3);
    expect(duelShot(duel(FLANK)).damage).toBe(3 + DIRECTION_BONUS.flank.damage);
    expect(duelShot(duel(REAR)).damage).toBe(3 + DIRECTION_BONUS.rear.damage);
  });

  it('turns the attacker to the target, whatever side of the map it opened on', () => {
    const state = newMatch(duel(FLANK));
    expect(unitAt(state, 'a1').facing).toBe('E');

    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    // The target stands south of it, so the shot leaves it looking south.
    expect(unitAt(result.state, 'a1').facing).toBe('S');
  });
});

describe('actions: attack and height advantage', () => {
  /**
   * Three cells across a flat row, so the distance is 3 and the reach a unit of range 2 has on its own
   * is 2. The relief is the only thing that can close the gap.
   */
  const SNIPER_AT: Position = { x: 0, y: 0 };
  const TARGET_AT: Position = { x: 3, y: 0 };
  const ROOF = { '0,0': 2 };

  it('reaches from above a cell the same unit cannot reach from the same level', () => {
    const above = newMatch(duel(SNIPER_AT, { range: 2 }, TARGET_AT, ROOF));
    const level = newMatch(duel(SNIPER_AT, { range: 2 }, TARGET_AT));

    expect(2 + heightBonus(2).range).toBe(3);
    expect(accepted(applyAction(above, { type: 'attack', actor: 'a1', target: 'b1' })).events[0].type).toBe(
      'attacked',
    );
    expect(rejected(applyAction(level, { type: 'attack', actor: 'a1', target: 'b1' })).reason).toBe(
      'target-out-of-range',
    );
  });

  it('takes the reach of a shot from below away from the table, and refuses what is left out', () => {
    // The same row the other way round: the target two levels up, and the reach shortened by the table.
    const up = newMatch(duel(SNIPER_AT, { range: 2 }, TARGET_AT, { '3,0': 2 }));

    expect(2 + heightBonus(-2).range).toBe(1);
    expect(rejected(applyAction(up, { type: 'attack', actor: 'a1', target: 'b1' })).reason).toBe(
      'target-out-of-range',
    );
  });

  it('never changes the damage, whatever the difference in levels', () => {
    // A reach that carries the three cells at either end of the relief, so the only thing that moves
    // between the three shots is the height.
    const reach = { range: 4 };
    const level = duelShot(duel(SNIPER_AT, reach, TARGET_AT));
    const above = duelShot(duel(SNIPER_AT, reach, TARGET_AT, ROOF));
    const below = duelShot(duel(SNIPER_AT, reach, TARGET_AT, { '3,0': 2 }));

    expect(above.hit).toBe(true);
    expect(below.hit).toBe(true);
    expect(above.damage).toBe(level.damage);
    expect(below.damage).toBe(level.damage);
  });

  it('carries the direction and the height difference the roll used', () => {
    const reach = { range: 4 };
    const level = duelShot(duel(SNIPER_AT, reach, TARGET_AT));
    const above = duelShot(duel(SNIPER_AT, reach, TARGET_AT, ROOF));
    const below = duelShot(duel(SNIPER_AT, reach, TARGET_AT, { '3,0': 2 }));

    expect(level.stood).toBe(0);
    expect(above.stood).toBe(2);
    expect(below.stood).toBe(-2);
    // The height is not the direction: the two answers are read apart.
    expect(above.direction).toBe(level.direction);
    expect(below.direction).toBe(level.direction);
  });
});

describe('facing in the fingerprint of a match', () => {
  it('gives the same seed and the same actions the same hash, facings included', () => {
    const play = () => {
      let state = newMatch(twoUnitSetup());
      state = accepted(applyAction(state, { type: 'face', actor: 'a1', facing: 'N' })).state;
      state = accepted(applyAction(state, { type: 'move', actor: 'a1', to: { x: 0, y: 2 } })).state;
      return accepted(applyAction(state, { type: 'commitMove', actor: 'a1' })).state;
    };

    // The turn and the walk both leave their mark, so the hash is not comparing two states that never
    // moved: the unit turned south with its step.
    expect(unitAt(play(), 'a1').facing).toBe('S');
    expect(hashState(play())).toBe(hashState(play()));
  });
});
