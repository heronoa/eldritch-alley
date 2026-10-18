// Difficult terrain and prone (ADR 0023 § 4 and § 5): mud doubles the full step cost of the cell it is
// entered on, rolls 20 % per entering step, and a success stops the walk and ends the turn. The terrain is
// a layer of the match state, never an edit of the board.
import { describe, expect, it } from 'vitest';
import { applyEvent } from './events';
import { currentUnitId } from './initiative';
import { applyAction, applyEvents, hashState, newMatch } from './match';
import { DEFAULT_MOVEMENT_PROFILE, findPath, isDifficult, reachableCells, stepCost } from './movement';
import { createRng, nextInt } from './rng';
import type {
  AbilityDefinition,
  Action,
  ActionResult,
  Board,
  Event,
  MatchSetup,
  MatchState,
  Position,
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

/** Mud: a 3×3 square that lasts three rounds. The sight rule is the Wizard's own (ADR 0023 § 4). */
const MUD: AbilityDefinition = {
  id: 'mud',
  cost: 1,
  range: 3,
  needsSight: true,
  effect: { kind: 'terrain', radius: 1, durationRounds: 3 },
};

const CATALOG: readonly AbilityDefinition[] = [MUD];

function slot(abilityId: string | null): Unit['abilities'] {
  return { activeSets: [abilityId, null], reaction: null, movement: null, support: null };
}

/**
 * A flat field with the Wizard opening at (0,0), an allied mover at (1,0) and an enemy at (5,0). The
 * three speeds put the Wizard first, the mover second and the enemy last, so every case can reach each
 * unit's turn by passing the previous one.
 */
function field(seed = 1): MatchSetup {
  const units = [
    makeUnit({
      id: 'wizard',
      team: 'A',
      position: { x: 0, y: 0 },
      speed: 20,
      movement: 4,
      magazine: 10,
      resourceKind: 'mana',
      primaryClass: 'wizard',
      abilities: slot('mud'),
    }),
    makeUnit({ id: 'mover', team: 'A', position: { x: 1, y: 0 }, speed: 10, movement: 6 }),
    makeUnit({ id: 'enemy', team: 'B', position: { x: 5, y: 0 }, speed: 1, movement: 6 }),
  ];
  const team = (id: Team) => units.filter((unit) => unit.team === id);
  return { seed, map: makeBoard(), catalog: CATALOG, teams: [team('A'), team('B')] };
}

function play(state: MatchState, action: Action): ActionResult & { ok: true } {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`expected the action to be accepted, got ${result.reason}`);
  return result;
}

function unitAt(state: MatchState, id: string) {
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`no unit ${id}`);
  return unit;
}

function castMud(to: Position): Action {
  return { type: 'useAbility', actor: 'wizard', abilityId: 'mud', to };
}

function pass(state: MatchState): MatchState {
  return play(state, {
    type: 'endTurn',
    actor: currentUnitId(state),
    round: state.round,
  }).state;
}

/** Passes turns until the round is the one a case needs. */
function advanceToRound(state: MatchState, round: number): MatchState {
  let current = state;
  for (let guard = 0; guard < 64 && current.round < round; guard += 1) current = pass(current);
  if (current.round !== round) throw new Error(`the round never reached ${round}`);
  return current;
}

/** A seed whose next `count` rolls all land inside `(low, high]`. */
function seedWithRolls(low: number, high: number, count: number): number {
  for (let seed = 0; seed < 20000; seed += 1) {
    const rng = createRng(seed);
    let fits = true;
    for (let draw = 0; draw < count; draw += 1) {
      const roll = nextInt(rng, 1, 100);
      if (!(roll > low && roll <= high)) {
        fits = false;
        break;
      }
    }
    if (fits) return seed;
  }
  throw new Error(`no seed rolls ${count} times in (${low}, ${high}]`);
}

function cellsOf(cells: readonly Position[]): string[] {
  return cells.map((cell) => `${cell.x},${cell.y}`).sort();
}

/** What a case plays: the live state and every event it produced, for the replay assertion. */
function session(setup: MatchSetup) {
  let state = newMatch(setup);
  const events: Event[] = [];

  const run = (action: Action) => {
    const result = play(state, action);
    state = result.state;
    events.push(...result.events);
    return result;
  };

  return {
    run,
    pass() {
      return run({ type: 'endTurn', actor: currentUnitId(state), round: state.round });
    },
    state: () => state,
    events,
  };
}

describe('difficult terrain: the cast', () => {
  it('writes one cell per covered square, with the expiry three rounds ahead', () => {
    const state = newMatch(field());
    const result = play(state, castMud({ x: 3, y: 1 }));

    expect(cellsOf(result.state.difficultTerrain.map((cell) => cell.position))).toEqual(
      cellsOf([
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: 4, y: 0 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 4, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 4, y: 2 },
      ]),
    );
    expect(result.state.difficultTerrain.every((cell) => cell.expiresAtRound === 4)).toBe(true);
    // The cast is one event and nothing else: the ground does not roll and no unit is touched.
    expect(result.events.map((event) => event.type)).toEqual(['ability-used']);
    expect(unitAt(result.state, 'wizard').ammo).toBe(9);
    expect(result.state.hasActed).toBe(true);
  });

  it('clips the square at the edge of the board', () => {
    const result = play(newMatch(field()), castMud({ x: 0, y: 0 }));

    expect(cellsOf(result.state.difficultTerrain.map((cell) => cell.position))).toEqual([
      '0,0',
      '0,1',
      '1,0',
      '1,1',
    ]);
  });

  it('refreshes a covered cell in place and keeps a non-overlapping cast beside it', () => {
    let state = newMatch(field());
    state = play(state, castMud({ x: 3, y: 1 })).state;
    state = advanceToRound(state, 2);
    state = play(state, castMud({ x: 3, y: 1 })).state;

    expect(state.difficultTerrain).toHaveLength(9);
    expect(state.difficultTerrain.every((cell) => cell.expiresAtRound === 5)).toBe(true);

    state = advanceToRound(state, 3);
    // The Wizard's own corner is clear of the first square and inside its range.
    state = play(state, castMud({ x: 0, y: 0 })).state;

    expect(state.difficultTerrain).toHaveLength(13);
    expect(
      state.difficultTerrain.filter((cell) => cell.expiresAtRound === 6).map((cell) => cell.position),
    ).toEqual(expect.arrayContaining([{ x: 0, y: 0 }, { x: 1, y: 1 }]));
  });
});

describe('difficult terrain: the step cost', () => {
  it('doubles the full step, climbs included', () => {
    const flat = makeBoard();
    const climbOne = makeBoard({ '1,0': 1 });
    const climbTwo = makeBoard({ '1,0': 2 });
    const climber = { maxStepUp: 2, maxStepDown: 1, climbCost: 1 };

    expect(stepCost(DEFAULT_MOVEMENT_PROFILE, flat, { x: 0, y: 0 }, { x: 1, y: 0 }, true)).toBe(2);
    expect(stepCost(DEFAULT_MOVEMENT_PROFILE, climbOne, { x: 0, y: 0 }, { x: 1, y: 0 }, true)).toBe(4);
    expect(stepCost(climber, climbTwo, { x: 0, y: 0 }, { x: 1, y: 0 }, true)).toBe(6);
    // A step out of mud is read from its destination, which is ordinary ground.
    expect(stepCost(DEFAULT_MOVEMENT_PROFILE, flat, { x: 1, y: 0 }, { x: 1, y: 1 }, false)).toBe(1);
  });

  it('is read by the movement search and by the replay alike', () => {
    const seed = seedWithRolls(20, 100, 2);
    const game = session(field(seed));
    game.run(castMud({ x: 3, y: 1 }));
    game.pass();

    const view = game.state();
    expect(isDifficult(view, { x: 2, y: 0 })).toBe(true);
    expect(isDifficult(view, { x: 1, y: 0 })).toBe(false);
    expect(findPath(view, 'mover', { x: 2, y: 0 })).toEqual({
      path: [{ x: 2, y: 0 }],
      cost: 2,
    });
    expect(findPath(view, 'mover', { x: 3, y: 0 })).toEqual({
      path: [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
      cost: 4,
    });

    const walked = game.run({ type: 'move', actor: 'mover', to: { x: 3, y: 0 } });
    const moved = walked.events[0];
    if (moved.type !== 'moved') throw new Error('expected the walk first');

    expect(moved.path).toEqual([
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(moved.prone).toBe(false);
    expect(walked.state.movementLeft).toBe(2);
    expect(hashState(applyEvents(field(seed), game.events))).toBe(hashState(walked.state));
  });

  it('refuses a replayed path that does not pay the doubled step', () => {
    const state = play(newMatch(field()), castMud({ x: 3, y: 1 })).state;
    const atMud = { ...state, movementLeft: 1 };

    expect(() =>
      applyEvent(atMud, {
        type: 'moved',
        actor: 'mover',
        from: { x: 1, y: 0 },
        to: { x: 2, y: 0 },
        path: [{ x: 2, y: 0 }],
        rngState: atMud.rng.state,
        prone: false,
      }),
    ).toThrow(/the path costs more than the movement left/);
  });

  it('charges the caster, its allies and its enemies the same doubled cost', () => {
    let state = newMatch(field());
    state = play(state, castMud({ x: 3, y: 1 })).state;
    state = pass(state);

    // The ally enters mud at (2,0) from (1,0): 2.
    expect(findPath(state, 'mover', { x: 2, y: 0 })?.cost).toBe(2);
    state = pass(state);

    // The enemy enters mud at (4,0) from (5,0): 2.
    expect(findPath(state, 'enemy', { x: 4, y: 0 })?.cost).toBe(2);
    state = pass(state);

    // The caster itself, on its next turn, pays 1 for the free step and 2 for the muddy one.
    expect(findPath(state, 'wizard', { x: 2, y: 0 })?.cost).toBe(3);
  });

  it('lists every reachable cell at the doubled cost the walk pays', () => {
    const state = play(newMatch(field()), castMud({ x: 3, y: 1 })).state;
    const moverTurn = pass(state);

    for (const cell of reachableCells(moverTurn, 'mover')) {
      const path = findPath(moverTurn, 'mover', cell);
      if (path === null) throw new Error(`reachable cell ${cell.x},${cell.y} has no path`);
      expect(path.cost).toBeLessThanOrEqual(moverTurn.movementLeft);
    }
  });
});

describe('difficult terrain: prone', () => {
  it('stops the walk on the muddy cell, ends the turn and starts the next unit', () => {
    // The first roll enters (2,0) and lands under 20, so the walk stops there.
    const seed = seedWithRolls(0, 20, 1);
    const game = session(field(seed));
    game.run(castMud({ x: 3, y: 1 }));
    game.pass();

    const walked = game.run({ type: 'move', actor: 'mover', to: { x: 4, y: 0 } });
    const moved = walked.events[0];
    if (moved.type !== 'moved') throw new Error('expected the walk first');

    expect(moved.to).toEqual({ x: 2, y: 0 });
    expect(moved.path).toEqual([{ x: 2, y: 0 }]);
    expect(moved.prone).toBe(true);
    expect(typeof moved.rngState).toBe('number');
    expect(walked.events[1].type).toBe('turn-ended');
    expect(unitAt(walked.state, 'mover').position).toEqual({ x: 2, y: 0 });
    expect(unitAt(walked.state, 'mover').prone).toBe(true);
    expect(walked.state.pendingMove).toBeNull();
    expect(currentUnitId(walked.state)).toBe('enemy');
    expect(hashState(applyEvents(field(seed), game.events))).toBe(hashState(walked.state));
  });

  it('continues to the destination when every entering roll fails', () => {
    // Three muddy cells in a row, three rolls above 20.
    const seed = seedWithRolls(20, 100, 3);
    const game = session(field(seed));
    game.run(castMud({ x: 3, y: 1 }));
    game.pass();

    const walked = game.run({ type: 'move', actor: 'mover', to: { x: 4, y: 0 } });
    const moved = walked.events[0];
    if (moved.type !== 'moved') throw new Error('expected the walk first');

    expect(moved.path).toEqual([
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
    expect(moved.prone).toBe(false);
    expect(unitAt(walked.state, 'mover').prone).toBe(false);
    expect(walked.state.movementLeft).toBe(0);
    expect(currentUnitId(walked.state)).toBe('mover');
    expect(hashState(applyEvents(field(seed), game.events))).toBe(hashState(walked.state));
  });

  it('rolls nothing when a unit starts on mud and enters none', () => {
    // The cast covers the mover's own cell (2,0) but not (3,0), where it walks.
    const seed = seedWithRolls(0, 20, 1);
    const setup = field(seed);
    const units = [
      makeUnit({
        id: 'wizard',
        team: 'A',
        position: { x: 0, y: 0 },
        speed: 20,
        magazine: 10,
        resourceKind: 'mana',
        abilities: slot('mud'),
      }),
      makeUnit({ id: 'mover', team: 'A', position: { x: 2, y: 0 }, speed: 10, movement: 6 }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 5, y: 0 }, speed: 1, movement: 6 }),
    ];
    const muddy: MatchSetup = {
      ...setup,
      teams: [
        units.filter((unit) => unit.team === 'A'),
        units.filter((unit) => unit.team === 'B'),
      ],
    };

    const state = play(newMatch(muddy), castMud({ x: 1, y: 1 })).state;
    const moverTurn = pass(state);

    expect(isDifficult(moverTurn, { x: 2, y: 0 })).toBe(true);
    expect(isDifficult(moverTurn, { x: 3, y: 0 })).toBe(false);
    const result = play(moverTurn, { type: 'move', actor: 'mover', to: { x: 3, y: 0 } });
    const moved = result.events[0];
    if (moved.type !== 'moved') throw new Error('expected the walk first');

    expect(moved.path).toEqual([{ x: 3, y: 0 }]);
    expect(moved.prone).toBe(false);
    // No roll was made, so the random source is where the cast left it.
    expect(moved.rngState).toBe(moverTurn.rng.state);
  });

  it('stands the unit up on its next turn with half its movement and a normal action', () => {
    const seed = seedWithRolls(0, 20, 1);
    const game = session(field(seed));
    game.run(castMud({ x: 3, y: 1 }));
    game.pass();
    game.run({ type: 'move', actor: 'mover', to: { x: 4, y: 0 } });

    expect(unitAt(game.state(), 'mover').prone).toBe(true);

    // The fall already handed the turn to the enemy; the two passes bring it back to the mover.
    game.pass(); // enemy -> wizard
    const back = game.pass(); // wizard -> mover

    expect(currentUnitId(back.state)).toBe('mover');
    expect(unitAt(back.state, 'mover').prone).toBe(false);
    expect(back.state.movementLeft).toBe(3);
    expect(back.state.hasActed).toBe(false);
    expect(back.events.map((event) => event.type)).toContain('stood-up');
    expect(back.events.find((event) => event.type === 'stood-up')).toEqual({
      type: 'stood-up',
      actor: 'mover',
    });

    // Standing up is not a lost action: the unit can still walk off the mud.
    const walked = play(back.state, { type: 'move', actor: 'mover', to: { x: 1, y: 0 } });
    expect(walked.state.movementLeft).toBe(2);
  });

  it('clears prone when the unit is defeated', () => {
    const seed = seedWithRolls(0, 20, 1);
    let state = newMatch(field(seed));
    state = play(state, castMud({ x: 3, y: 1 })).state;
    state = pass(state);
    state = play(state, { type: 'move', actor: 'mover', to: { x: 4, y: 0 } }).state;
    expect(unitAt(state, 'mover').prone).toBe(true);

    const dead = applyEvent(state, { type: 'unit-defeated', target: 'mover' });

    expect(unitAt(dead, 'mover').defeated).toBe(true);
    expect(unitAt(dead, 'mover').prone).toBe(false);
  });
});

describe('difficult terrain: the expiry', () => {
  it('dries the cells on the round rise and charges the normal cost afterwards', () => {
    let state = newMatch(field());
    state = play(state, castMud({ x: 3, y: 1 })).state;
    const muddy = state.difficultTerrain.map((cell) => cell.position);

    let dried: Event | undefined;
    for (let guard = 0; guard < 16 && state.round < 4; guard += 1) {
      const result = play(state, {
        type: 'endTurn',
        actor: currentUnitId(state),
        round: state.round,
      });
      dried = result.events.find((event) => event.type === 'terrain-expired') ?? dried;
      state = result.state;
    }

    expect(state.round).toBe(4);
    expect(state.difficultTerrain).toEqual([]);
    expect(dried).toEqual({ type: 'terrain-expired', cells: muddy });
    // The cells are ordinary ground again: two flat steps to (2,0).
    expect(findPath(state, 'wizard', { x: 2, y: 0 })?.cost).toBe(2);
  });

  it('emits the expiry after stood-up and before regained when a prone stop wraps the round', () => {
    const seed = seedWithRolls(0, 20, 1);
    let state = newMatch(field(seed));
    state = play(state, castMud({ x: 3, y: 1 })).state;

    // Hand the last turn of round 3 to the enemy, one step west of the mud, and make the incoming
    // Wizard prone so the whole turn-end order is exercised in one event list.
    state = {
      ...state,
      round: 3,
      currentIndex: state.initiative.indexOf('enemy'),
      movementLeft: unitAt(state, 'enemy').movement,
      hasActed: false,
      units: state.units.map((unit) =>
        unit.id === 'wizard' ? { ...unit, prone: true } : unit,
      ),
    };
    state = {
      ...state,
      units: state.units.map((unit) =>
        unit.id === 'enemy' ? { ...unit, position: { x: 5, y: 0 } } : unit,
      ),
    };

    const result = play(state, { type: 'move', actor: 'enemy', to: { x: 3, y: 0 } });

    expect(result.events.map((event) => event.type)).toEqual([
      'moved',
      'turn-ended',
      'stood-up',
      'terrain-expired',
      'regained',
    ]);
    expect(result.state.round).toBe(4);
    expect(result.state.difficultTerrain).toEqual([]);
    expect(unitAt(result.state, 'wizard').prone).toBe(false);
  });

  it('replays a cast, a prone stop and an expiry to the same hash', () => {
    const seed = seedWithRolls(0, 20, 1);
    const game = session(field(seed));
    game.run(castMud({ x: 3, y: 1 }));
    game.pass();
    game.run({ type: 'move', actor: 'mover', to: { x: 4, y: 0 } });
    for (let guard = 0; guard < 16 && game.state().round < 4; guard += 1) game.pass();

    const live = game.state();
    expect(live.round).toBe(4);
    expect(live.difficultTerrain).toEqual([]);
    expect(hashState(applyEvents(field(seed), game.events))).toBe(hashState(live));
    expect(applyEvents(field(seed), game.events)).toEqual(live);
  });
});
