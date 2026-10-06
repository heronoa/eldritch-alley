import { describe, expect, it } from 'vitest';
import { canStillAct, resolveHit } from './actions';
import { currentUnitId } from './initiative';
import { applyAction, hashState, newMatch } from './match';
import { moveCost } from './movement';
import { createRng } from './rng';
import type {
  ActionResult,
  Action,
  Board,
  MatchSetup,
  MatchState,
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

    expect(result.events).toEqual([
      { type: 'attacked', actor: 'a1', target: 'b1', hit: true, damage: 3, rngState: expect.any(Number), ammoSpent: false },
    ]);
    expect(unitAt(result.state, 'b1').health).toBe(7);
    expect(result.state.hasActed).toBe(true);
  });

  it('records a miss with no damage when the roll is above the hit chance', () => {
    const state = newMatch(twoUnitSetup({ hitChance: 0 }, { position: { x: 0, y: 1 } }));
    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    expect(result.events).toEqual([
      { type: 'attacked', actor: 'a1', target: 'b1', hit: false, damage: 0, rngState: expect.any(Number), ammoSpent: false },
    ]);
    expect(unitAt(result.state, 'b1').health).toBe(10);
    expect(result.state.hasActed).toBe(true);
  });

  it('lowers the health of the target and leaves its maximum health alone', () => {
    const state = newMatch(twoUnitSetup({ attack: 4 }, { position: { x: 0, y: 1 }, health: 10 }));
    const before = unitAt(state, 'b1');

    const result = accepted(applyAction(state, { type: 'attack', actor: 'a1', target: 'b1' }));

    const after = unitAt(result.state, 'b1');
    expect(after.health).toBe(before.health - 4);
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
      expect.objectContaining({ type: 'attacked', actor: 'a1', target: 'b1', ammoSpent: true }),
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
      expect.objectContaining({ type: 'attacked', actor: 'a1', target: 'b1', ammoSpent: true }),
    ]);
  });

  it('refuses the same shot from an empty magazine, as melee reach 1', () => {
    // The reach check comes before sight, and a spent magazine turns the sniper into melee. EA-14
    // replaces this answer with `no-ammunition`; this test changes with it.
    const state = newMatch(throughABuilding());
    const empty = {
      ...state,
      units: state.units.map((unit) => (unit.id === 'a1' ? { ...unit, ammo: 0 } : unit)),
    };

    expect(rejected(applyAction(empty, { type: 'attack', actor: 'a1', target: 'b1' })).reason).toBe(
      'target-out-of-range',
    );
  });

  it.todo('a wizard at range 2 shoots across the rooftop gap (EA-14)');
  it.todo('a priest at range 2 shoots across the rooftop gap (EA-14)');
});

describe('resolveHit', () => {
  const attacker = makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, hitChance: 100 });
  const target = makeUnit({ id: 'b1', team: 'B', position: { x: 0, y: 1 } });

  it('turns a guaranteed chance into a hit and a zero chance into a miss on the same seed', () => {
    const hitRng = createRng(123);
    const missRng = createRng(123);
    expect(resolveHit(attacker, target, hitRng)).toBe(true);
    expect(resolveHit({ ...attacker, hitChance: 0 }, target, missRng)).toBe(false);
    expect(hitRng.state).toBe(missRng.state);
  });

  it('consults the roll for an accuracy in the middle of the range', () => {
    const outcomes = new Set<boolean>();
    for (let seed = 1; seed <= 200; seed++) {
      outcomes.add(resolveHit({ ...attacker, hitChance: 50 }, target, createRng(seed)));
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
