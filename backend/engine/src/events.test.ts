import { describe, expect, it } from 'vitest';
import { applyEvent } from './events';
import { applyAction, applyEvents, hashState, newMatch } from './match';
import type { ActionResult, Board, Event, MatchSetup, Team, Unit } from './types';

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
    session.run({ type: 'endTurn', actor: 'a1' });
    session.run({ type: 'move', actor: 'b1', to: { x: 1, y: 1 } });
    session.run({ type: 'attack', actor: 'b1', target: 'a1' });
    session.run({ type: 'endTurn', actor: 'b1' });
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

    session.run({ type: 'endTurn', actor: 'a1' });
    session.run({ type: 'move', actor: 'b1', to: { x: 1, y: 1 } });

    const live = session.state();
    expect(hashState(applyEvents(setup, session.events))).toBe(hashState(live));
  });

  it('rebuilds a defeat from the event list', () => {
    const setup = makeSetup();
    const session = play(newMatch(setup));

    session.run({ type: 'move', actor: 'a1', to: { x: 1, y: 0 } });
    for (let i = 0; i < 4; i++) {
      const result = session.run({ type: 'attack', actor: 'a1', target: 'b1' });
      if (!result.ok) break;
      session.run({ type: 'endTurn', actor: 'a1' });
      session.run({ type: 'endTurn', actor: 'b1' });
    }

    const live = session.state();
    expect(live.units.find((unit) => unit.id === 'b1')?.defeated).toBe(true);
    expect(hashState(applyEvents(setup, session.events))).toBe(hashState(live));
  });
});
