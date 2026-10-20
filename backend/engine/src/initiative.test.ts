import { describe, expect, it } from 'vitest';
import { applyEvent } from './events';
import { currentUnitId, insertIntoInitiative } from './initiative';
import { applyAction, newMatch } from './match';
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

function makeSetup(units: Unit[]): MatchSetup {
  const team = (id: Team) => units.filter((unit) => unit.team === id);
  return { seed: 1, map: makeBoard(), teams: [team('A'), team('B')] };
}

describe('initiative', () => {
  it('puts the higher speed first', () => {
    const setup = makeSetup([
      makeUnit({ id: 'slow', team: 'A', position: { x: 0, y: 0 }, speed: 3 }),
      makeUnit({ id: 'fast', team: 'B', position: { x: 7, y: 7 }, speed: 9 }),
      makeUnit({ id: 'middle', team: 'A', position: { x: 1, y: 0 }, speed: 5 }),
    ]);
    const state = newMatch(setup);
    expect(state.initiative).toEqual(['fast', 'middle', 'slow']);
    expect(currentUnitId(state)).toBe('fast');
  });

  it('breaks speed ties by team and then by squad list position', () => {
    const setup = makeSetup([
      makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 5 }),
      makeUnit({ id: 'a2', team: 'A', position: { x: 1, y: 0 }, speed: 5 }),
      makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 5 }),
      makeUnit({ id: 'b2', team: 'B', position: { x: 6, y: 7 }, speed: 5 }),
    ]);
    expect(newMatch(setup).initiative).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  it('leaves the queue when a unit is defeated, and skips it on the next turn', () => {
    const setup = makeSetup([
      makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 9, attack: 5, range: 1 }),
      makeUnit({ id: 'b1', team: 'B', position: { x: 0, y: 1 }, speed: 5, health: 1 }),
      makeUnit({ id: 'c1', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
    ]);
    const start = newMatch(setup);
    expect(start.initiative).toEqual(['a1', 'b1', 'c1']);
    expect(currentUnitId(start)).toBe('a1');

    const attack = applyAction(start, { type: 'attack', actor: 'a1', target: 'b1' });
    if (!attack.ok) throw new Error(`expected the attack to be accepted: ${attack.reason}`);
    expect(attack.state.initiative).toEqual(['a1', 'c1']);
    expect(currentUnitId(attack.state)).toBe('a1');

    const endTurn = applyAction(attack.state, {
      type: 'endTurn',
      actor: 'a1',
      round: attack.state.round,
    });
    if (!endTurn.ok) throw new Error(`expected endTurn to be accepted: ${endTurn.reason}`);
    expect(currentUnitId(endTurn.state)).toBe('c1');
  });
});

describe('insertIntoInitiative', () => {
  /** The state after `fallen` was defeated: it is out of the queue, the way a revive finds it. */
  function withoutFallen(units: Unit[]): MatchState {
    const team = (id: Team) => units.filter((unit) => unit.team === id);
    const start = newMatch({ seed: 1, map: makeBoard(), teams: [team('A'), team('B')] });
    return applyEvent(start, { type: 'unit-defeated', target: 'fallen' });
  }

  it('inserts by speed and returns the slot it took', () => {
    const state = withoutFallen([
      makeUnit({ id: 'priest', team: 'A', position: { x: 0, y: 0 }, speed: 10 }),
      makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 20 }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
    ]);
    expect(state.initiative).toEqual(['priest', 'enemy']);

    expect(insertIntoInitiative(state, 'fallen')).toBe(0);
    expect(state.initiative).toEqual(['fallen', 'priest', 'enemy']);
  });

  it('breaks a speed tie by the setup order the units keep', () => {
    const state = withoutFallen([
      makeUnit({ id: 'alive', team: 'A', position: { x: 0, y: 0 }, speed: 10 }),
      makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 10 }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
    ]);

    // The two are tied on speed; the revived unit was authored second, so it goes after the first.
    expect(insertIntoInitiative(state, 'fallen')).toBe(1);
    expect(state.initiative).toEqual(['alive', 'fallen', 'enemy']);
  });

  it('appends a unit slower than every slot already in the queue', () => {
    const state = withoutFallen([
      makeUnit({ id: 'fast', team: 'A', position: { x: 0, y: 0 }, speed: 20 }),
      makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 1 }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 10 }),
    ]);

    expect(insertIntoInitiative(state, 'fallen')).toBe(2);
    expect(state.initiative).toEqual(['fast', 'enemy', 'fallen']);
  });
});
