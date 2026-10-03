import { describe, expect, it } from 'vitest';
import { canonicalize, fnv1a } from './hash';
import { hashState, newMatch } from './match';
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

function makeSetup(): MatchSetup {
  const units = [
    makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 9 }),
    makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 5 }),
  ];
  const team = (id: Team) => units.filter((unit) => unit.team === id);
  return { seed: 1, map: makeBoard(), teams: [team('A'), team('B')] };
}

describe('fnv1a', () => {
  it('matches the reference vectors for known strings', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
    expect(fnv1a('hello')).toBe(0x4f9f2cab);
  });

  it('returns an unsigned 32-bit integer', () => {
    for (const input of ['', 'a', 'eldritch-alley', 'x'.repeat(1000)]) {
      const hash = fnv1a(input);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('canonicalize', () => {
  it('sorts object keys in a fixed order', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it('keeps array order, because it is state', () => {
    expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]));
  });
});

describe('hashState', () => {
  it('changes when one unit health changes', () => {
    const state = newMatch(makeSetup());
    const damaged: MatchState = {
      ...state,
      units: state.units.map((unit) =>
        unit.id === 'b1' ? { ...unit, health: unit.health - 1 } : unit,
      ),
    };
    expect(hashState(damaged)).not.toBe(hashState(state));
  });

  it('does not change with object key order', () => {
    const state = newMatch(makeSetup());

    const reorderedUnits = state.units.map((unit) => ({
      defeated: unit.defeated,
      abilities: {
        support: unit.abilities.support,
        movement: unit.abilities.movement,
        reaction: unit.abilities.reaction,
        activeSets: unit.abilities.activeSets,
      },
      equipment: {
        accessory2: unit.equipment.accessory2,
        accessory1: unit.equipment.accessory1,
        offHand: unit.equipment.offHand,
        mainHand: unit.equipment.mainHand,
        helmet: unit.equipment.helmet,
        armor: unit.equipment.armor,
      },
      primaryClass: unit.primaryClass,
      attunement: unit.attunement,
      nerve: unit.nerve,
      movement: unit.movement,
      range: unit.range,
      hitChance: unit.hitChance,
      attack: unit.attack,
      health: unit.health,
      speed: unit.speed,
      position: { y: unit.position.y, x: unit.position.x },
      team: unit.team,
      id: unit.id,
    }));

    const reordered: MatchState = {
      eventCount: state.eventCount,
      rng: state.rng,
      hasActed: state.hasActed,
      movementLeft: state.movementLeft,
      currentIndex: state.currentIndex,
      initiative: state.initiative,
      units: reorderedUnits,
      board: state.board,
      seed: state.seed,
    };

    expect(hashState(reordered)).toBe(hashState(state));
  });

  it('changes when the unit order changes, because that order breaks speed ties', () => {
    const state = newMatch(makeSetup());
    const swapped: MatchState = { ...state, units: [...state.units].reverse() };
    expect(hashState(swapped)).not.toBe(hashState(state));
  });

  it('returns an unsigned 32-bit integer', () => {
    const hash = hashState(newMatch(makeSetup()));
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });
});
