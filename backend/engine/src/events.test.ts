import { describe, expect, it } from 'vitest';
import { applyEvent } from './events';
import { applyAction, applyEvents, hashState, newMatch, publicState } from './match';
import { findPath, reachableCells } from './movement';
import type {
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

function makeSetup(): MatchSetup {
  const units = [
    makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 10, movement: 2, attack: 3 }),
    makeUnit({ id: 'b1', team: 'B', position: { x: 0, y: 1 }, speed: 5, movement: 4, attack: 3 }),
  ];
  const team = (id: Team) => units.filter((unit) => unit.team === id);
  return { seed: 1, map: makeBoard(), teams: [team('A'), team('B')] };
}

function accepted(result: ActionResult) {
  if (!result.ok) throw new Error(`expected the action to be accepted, got ${result.reason}`);
  return result;
}

describe('applyEvent', () => {
  it('moves a unit and spends its movement', () => {
    const state = newMatch(makeSetup());
    const next = applyEvent(state, {
      type: 'moved',
      actor: 'a1',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      path: [{ x: 1, y: 0 }],
      rngState: state.rng.state,
      prone: false,
    });

    expect(next.units.find((unit) => unit.id === 'a1')?.position).toEqual({ x: 1, y: 0 });
    expect(next.movementLeft).toBe(1);
    expect(next.eventCount).toBe(1);
    expect(state.movementLeft).toBe(2);
    expect(state.units.find((unit) => unit.id === 'a1')?.position).toEqual({ x: 0, y: 0 });
  });

  it('marks a defeated unit and drops it from the queue', () => {
    const state = newMatch(makeSetup());
    const next = applyEvent(state, { type: 'unit-defeated', target: 'b1' });

    expect(next.units).toHaveLength(2);
    expect(next.units.find((unit) => unit.id === 'b1')?.defeated).toBe(true);
    expect(next.initiative).toEqual(['a1']);
    expect(state.initiative).toEqual(['a1', 'b1']);
  });

  /**
   * A move opens a run on the cell it started from (EA-5), and the run closes on the first event that
   * is not another move: the commit lives here, so a replay rebuilds the same state as live play.
   */
  it('opens a run on the cell a move started from, and closes it on any other event', () => {
    const state = newMatch(makeSetup());
    const walked = applyEvent(state, {
      type: 'moved',
      actor: 'a1',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      path: [{ x: 1, y: 0 }],
      rngState: state.rng.state,
      prone: false,
    });

    expect(walked.pendingMove).toEqual({ from: { x: 0, y: 0 }, cost: 1 });
    expect(state.pendingMove).toBeNull();

    const ended = applyEvent(walked, { type: 'turn-ended', actor: 'a1', next: 'b1', round: 1 });
    expect(ended.pendingMove).toBeNull();
  });
});

describe('events and replay', () => {
  function play(state = newMatch(makeSetup())) {
    const events: Event[] = [];
    let current = state;

    const run = (action: Parameters<typeof applyAction>[1]) => {
      const result = applyAction(current, action);
      if (result.ok) {
        current = result.state;
        events.push(...result.events);
      }
      return result;
    };

    return { run, events, state: () => current };
  }

  it('rebuilds the live state from the accepted events alone', () => {
    const setup = makeSetup();
    const session = play(newMatch(setup));

    session.run({ type: 'move', actor: 'a1', to: { x: 1, y: 0 } });
    session.run({ type: 'attack', actor: 'a1', target: 'b1' });
    // An endTurn names the round it was decided on, so each one reads the round of its own moment.
    session.run({ type: 'endTurn', actor: 'a1', round: session.state().round });
    session.run({ type: 'move', actor: 'b1', to: { x: 1, y: 1 } });
    session.run({ type: 'attack', actor: 'b1', target: 'a1' });
    session.run({ type: 'endTurn', actor: 'b1', round: session.state().round });
    session.run({ type: 'move', actor: 'a1', to: { x: 2, y: 0 } });

    const live = session.state();
    expect(session.events.length).toBeGreaterThan(0);
    expect(hashState(applyEvents(setup, session.events))).toBe(hashState(live));
  });

  it('keeps a rejected action out of the event list and still replays', () => {
    const setup = makeSetup();
    const session = play(newMatch(setup));

    session.run({ type: 'move', actor: 'a1', to: { x: 1, y: 0 } });
    session.run({ type: 'attack', actor: 'a1', target: 'b1' });

    const eventsBefore = session.events.length;
    const rejected = session.run({ type: 'move', actor: 'a1', to: { x: 4, y: 4 } });
    expect(rejected.ok).toBe(false);
    expect(session.events).toHaveLength(eventsBefore);

    session.run({ type: 'endTurn', actor: 'a1', round: session.state().round });
    session.run({ type: 'move', actor: 'b1', to: { x: 1, y: 1 } });

    const live = session.state();
    expect(hashState(applyEvents(setup, session.events))).toBe(hashState(live));
  });

  it('rebuilds a turn with a pending move, a cancel and a confirmation from the events alone', () => {
    const setup = makeSetup();
    const session = play(newMatch(setup));

    session.run({ type: 'move', actor: 'a1', to: { x: 1, y: 0 } });
    session.run({ type: 'cancelMove', actor: 'a1' });
    session.run({ type: 'move', actor: 'a1', to: { x: 2, y: 0 } });
    session.run({ type: 'commitMove', actor: 'a1' });

    const live = session.state();
    expect(live.pendingMove).toBeNull();
    expect(live.movementLeft).toBe(0);
    expect(applyEvents(setup, session.events)).toEqual(live);
    expect(hashState(applyEvents(setup, session.events))).toBe(hashState(live));
  });

  it('rebuilds a defeat from the event list', () => {
    const setup = makeSetup();
    const session = play(newMatch(setup));

    session.run({ type: 'move', actor: 'a1', to: { x: 1, y: 0 } });
    for (let i = 0; i < 4; i++) {
      const result = session.run({ type: 'attack', actor: 'a1', target: 'b1' });
      if (!result.ok) break;
      session.run({ type: 'endTurn', actor: 'a1', round: session.state().round });
      session.run({ type: 'endTurn', actor: 'b1', round: session.state().round });
    }

    const live = session.state();
    expect(live.units.find((unit) => unit.id === 'b1')?.defeated).toBe(true);
    expect(hashState(applyEvents(setup, session.events))).toBe(hashState(live));
  });
});

describe('applyEvent refuses a malformed moved path (DT-73)', () => {
  /** a1 starts at (0,0) with the given movement; b1 sits in the far corner so it blocks nothing. */
  function stateWith(heights: Record<string, number>, overrides: Partial<Unit> = {}) {
    const units = [
      makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 10, movement: 4, ...overrides }),
      makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 5, movement: 4 }),
    ];
    return newMatch({
      seed: 1,
      map: makeBoard(heights),
      teams: [units.filter((unit) => unit.team === 'A'), units.filter((unit) => unit.team === 'B')],
    });
  }

  function moved(
    state: MatchState,
    path: Position[],
    to: Position = path[path.length - 1],
    from = { x: 0, y: 0 },
  ): Event {
    return { type: 'moved', actor: 'a1', from, to, path, rngState: state.rng.state, prone: false };
  }

  it('accepts a two-step path and charges the climb it makes', () => {
    const state = stateWith({ '1,0': 1 });
    // Climbing to level 1 costs 2; stepping back down is free, so the walk costs 3 of 4.
    const next = applyEvent(state, moved(state, [{ x: 1, y: 0 }, { x: 2, y: 0 }]));

    expect(next.units.find((unit) => unit.id === 'a1')?.position).toEqual({ x: 2, y: 0 });
    expect(next.movementLeft).toBe(1);
  });

  it('refuses an empty path', () => {
    const state = stateWith({});
    expect(() => applyEvent(state, moved(state, [], { x: 1, y: 0 }))).toThrow(/the path is empty/);
  });

  it('refuses a path that does not end on the destination', () => {
    const state = stateWith({});
    expect(() => applyEvent(state, moved(state, [{ x: 1, y: 0 }], { x: 2, y: 0 }))).toThrow(
      /does not end on the destination/,
    );
  });

  it('refuses a step outside the board', () => {
    const state = stateWith({});
    expect(() => applyEvent(state, moved(state, [{ x: -1, y: 0 }]))).toThrow(/step 1 is outside the board/);
  });

  it('refuses a step that is not next to the cell before it', () => {
    const state = stateWith({});
    expect(() => applyEvent(state, moved(state, [{ x: 2, y: 0 }]))).toThrow(
      /step 1 is not next to the cell before it/,
    );
  });

  it('refuses a step the movement profile forbids', () => {
    // The default profile climbs one level at most; the cell at (1,0) is two levels up.
    const state = stateWith({ '1,0': 2 });
    expect(() => applyEvent(state, moved(state, [{ x: 1, y: 0 }]))).toThrow(
      /step 1 is not allowed by the movement profile/,
    );
  });

  it('refuses a path that costs more than the movement left', () => {
    const state = stateWith({ '1,0': 1 }, { movement: 2 });
    // Climb (2) plus the step down (1) is 3, one more than the 2 points the unit has.
    expect(() => applyEvent(state, moved(state, [{ x: 1, y: 0 }, { x: 2, y: 0 }]))).toThrow(
      /the path costs more than the movement left/,
    );
  });

  it('leaves the state untouched when it refuses the event', () => {
    const state = stateWith({ '1,0': 2 });
    const before = structuredClone(state);

    expect(() => applyEvent(state, moved(state, [{ x: 1, y: 0 }]))).toThrow();
    expect(state).toEqual(before);
  });

  it('accepts every path the engine itself finds, for every cell it can reach', () => {
    const state = stateWith({ '1,0': 1, '2,1': 2, '3,3': 1, '1,2': 1 });
    const view = publicState(state);

    for (const cell of reachableCells(view, 'a1')) {
      const walk = findPath(view, 'a1', cell);
      if (walk === null) throw new Error(`reachable cell ${cell.x},${cell.y} has no path`);

      const next = applyEvent(state, moved(state, walk.path, cell));
      expect(next.units.find((unit) => unit.id === 'a1')?.position).toEqual(cell);
      expect(next.movementLeft).toBe(4 - walk.cost);
    }
  });
});

describe('applyEvent: statuses, terrain and resurrection', () => {
  /** a1 speed 10 at (0,0), b1 speed 5 at (7,7): room to give either one a status. */
  function stateOf(overrides: Partial<MatchState> = {}): MatchState {
    const units = [
      makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 10, movement: 4 }),
      makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 5, movement: 4 }),
    ];
    const team = (id: Team) => units.filter((unit) => unit.team === id);
    return {
      ...newMatch({ seed: 1, map: makeBoard(), teams: [team('A'), team('B')] }),
      ...overrides,
    };
  }

  function withUnit(
    state: MatchState,
    id: string,
    change: (unit: MatchState['units'][number]) => MatchState['units'][number],
  ): MatchState {
    return { ...state, units: state.units.map((unit) => (unit.id === id ? change(unit) : unit)) };
  }

  it('applies the rng state and the prone flag a truncated walk carries', () => {
    // The walk stopped on mud after one step: the path in the event is already the truncated one.
    const state = stateOf();
    const next = applyEvent(state, {
      type: 'moved',
      actor: 'a1',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      path: [{ x: 1, y: 0 }],
      rngState: 987654321,
      prone: true,
    });

    const actor = next.units.find((unit) => unit.id === 'a1');
    expect(actor?.position).toEqual({ x: 1, y: 0 });
    expect(actor?.prone).toBe(true);
    expect(next.movementLeft).toBe(3);
    // Replay takes the random source the roll left, so the next draw matches the live match.
    expect(next.rng.state).toBe(987654321);
    expect(state.rng.state).toBe(1);
  });

  it('removes exactly the cells a terrain-expired event names', () => {
    const state = stateOf({
      difficultTerrain: [
        { position: { x: 1, y: 0 }, expiresAtRound: 2 },
        { position: { x: 1, y: 1 }, expiresAtRound: 3 },
      ],
    });

    const next = applyEvent(state, { type: 'terrain-expired', cells: [{ x: 1, y: 0 }] });

    expect(next.difficultTerrain).toEqual([{ position: { x: 1, y: 1 }, expiresAtRound: 3 }]);
    // The state passed in is untouched.
    expect(state.difficultTerrain).toHaveLength(2);
  });

  it('clears the camouflage of the unit a camouflage-ended event names', () => {
    const marked = withUnit(withUnit(stateOf(), 'a1', (unit) => ({
      ...unit,
      camouflage: { turns: 1, breakChance: 30 },
    })), 'b1', (unit) => ({
      ...unit,
      camouflage: { turns: 3, breakChance: 10 },
    }));

    const broken = applyEvent(marked, {
      type: 'camouflage-ended',
      target: 'a1',
      reason: 'broken',
    });
    expect(broken.units.find((unit) => unit.id === 'a1')?.camouflage).toBeNull();
    expect(broken.units.find((unit) => unit.id === 'b1')?.camouflage).toEqual({
      turns: 3,
      breakChance: 10,
    });

    const expired = applyEvent(marked, {
      type: 'camouflage-ended',
      target: 'b1',
      reason: 'expired',
    });
    expect(expired.units.find((unit) => unit.id === 'b1')?.camouflage).toBeNull();
  });

  it('stands a prone unit up without touching the movement it was given', () => {
    const state = { ...withUnit(stateOf(), 'a1', (unit) => ({ ...unit, prone: true })), movementLeft: 2 };

    const next = applyEvent(state, { type: 'stood-up', actor: 'a1' });

    expect(next.units.find((unit) => unit.id === 'a1')?.prone).toBe(false);
    expect(next.movementLeft).toBe(2);
  });

  it('halves the incoming movement for a prone unit and counts the passing unit camouflage down', () => {
    const state = withUnit(
      { ...withUnit(stateOf(), 'b1', (unit) => ({ ...unit, prone: true })), movementLeft: 4 },
      'a1',
      (unit) => ({ ...unit, camouflage: { turns: 2, breakChance: 30 } }),
    );

    const next = applyEvent(state, { type: 'turn-ended', actor: 'a1', next: 'b1', round: 1 });

    expect(next.initiative[next.currentIndex]).toBe('b1');
    // b1 is prone, so it starts standing with half of its movement budget. The stood-up event clears
    // the flag; this event only pays the cost of the fall.
    expect(next.movementLeft).toBe(2);
    expect(next.units.find((unit) => unit.id === 'b1')?.prone).toBe(true);
    // a1's own turn ended, so its camouflage counts one turn down.
    expect(next.units.find((unit) => unit.id === 'a1')?.camouflage).toEqual({
      turns: 1,
      breakChance: 30,
    });
  });

  it('brings a fallen ally back and re-inserts it by speed', () => {
    const units = [
      makeUnit({ id: 'priest', team: 'A', position: { x: 0, y: 0 }, speed: 10, magazine: 10 }),
      makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 20, magazine: 10 }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
    ];
    const team = (id: Team) => units.filter((unit) => unit.team === id);
    const fallen = applyEvent(
      newMatch({ seed: 1, map: makeBoard(), teams: [team('A'), team('B')] }),
      { type: 'unit-defeated', target: 'fallen' },
    );
    const dead = withUnit(
      { ...fallen, units: fallen.units.map((unit) => (unit.id === 'fallen' ? { ...unit, health: 0, ammo: 5 } : unit)) },
      'fallen',
      (unit) => ({ ...unit, prone: true, camouflage: { turns: 2, breakChance: 30 } }),
    );
    expect(dead.initiative).toEqual(['priest', 'enemy']);

    const next = applyEvent(dead, { type: 'revived', target: 'fallen', to: { x: 2, y: 1 } });
    const brought = next.units.find((unit) => unit.id === 'fallen');

    expect(brought?.defeated).toBe(false);
    expect(brought?.permanentlyDead).toBe(false);
    expect(brought?.corpseExpiresAtRound).toBeNull();
    expect(brought?.health).toBe(brought?.maxHealth);
    expect(brought?.ammo).toBe(5);
    expect(brought?.position).toEqual({ x: 2, y: 1 });
    expect(brought?.prone).toBe(false);
    expect(brought?.camouflage).toBeNull();
    expect(next.initiative).toEqual(['fallen', 'priest', 'enemy']);
    // The revived slot is before the Priest's, so the pointer follows it and the Priest stays on turn.
    expect(next.initiative[next.currentIndex]).toBe('priest');
    expect(dead.initiative).toEqual(['priest', 'enemy']);
  });
});
