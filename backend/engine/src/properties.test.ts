import { describe, expect, it } from 'vitest';
import { distance, inBounds } from './board';
import { currentUnitId, unitById } from './initiative';
import { applyAction, applyEvents, hashState, newMatch } from './match';
import { moveCost } from './movement';
import { createRng, nextInt } from './rng';
import type { Action, Board, Event, MatchSetup, MatchState, Rng, Team, Unit } from './types';

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

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new Error(`${label} is not an integer: ${String(value)}`);
}

/** A four-unit match whose numbers move with the seed, so the 200 runs are not clones of each other. */
function makePropertySetup(seed: number): MatchSetup {
  const units = [
    makeUnit({
      id: 'a1',
      team: 'A',
      position: { x: 2, y: 2 },
      speed: 6 + (seed % 5),
      health: 3 + (seed % 9),
      movement: 1 + (seed % 3),
      attack: 1 + (seed % 4),
      hitChance: 10 + (seed % 90),
      range: 1 + (seed % 2),
    }),
    makeUnit({
      id: 'a2',
      team: 'A',
      position: { x: 1, y: 2 },
      speed: 2 + (seed % 4),
      health: 5 + (seed % 6),
      movement: 1 + ((seed + 1) % 3),
      attack: 2,
      hitChance: 40 + (seed % 50),
      range: 1,
    }),
    makeUnit({
      id: 'b1',
      team: 'B',
      position: { x: 3, y: 3 },
      speed: 3 + (seed % 4),
      health: 4 + (seed % 7),
      movement: 2,
      attack: 2,
      hitChance: 30 + (seed % 60),
      range: 1,
    }),
    makeUnit({
      id: 'b2',
      team: 'B',
      position: { x: 4, y: 3 },
      speed: 1 + (seed % 3),
      health: 6,
      movement: 2,
      attack: 1,
      hitChance: 90,
      range: 2,
    }),
  ];
  const team = (id: Team) => units.filter((unit) => unit.team === id);
  return {
    seed: seed >>> 0,
    map: makeBoard({ '2,2': 1, '3,3': 2, '6,6': 1 }),
    teams: [team('A'), team('B')],
  };
}

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Mostly picks among the actions that are legal for the current unit, so attacks and moves actually
 * happen. Now and then it picks a random action, which may be rejected: rejections must leave no trace.
 */
function randomAction(state: MatchState, rng: Rng): Action {
  const actor = currentUnitId(state);
  if (nextInt(rng, 0, 9) === 0) {
    const any = state.units[nextInt(rng, 0, state.units.length - 1)].id;
    return { type: 'move', actor: any, to: { x: nextInt(rng, -1, 8), y: nextInt(rng, -1, 8) } };
  }

  const current = unitById(state, actor);
  const enemies = state.units.filter((unit) => unit.team !== current.team && !unit.defeated);
  const candidates: Action[] = [{ type: 'endTurn', actor }];

  for (const [dx, dy] of DIRECTIONS) {
    const to = { x: current.position.x + dx, y: current.position.y + dy };
    if (inBounds(state.board, to)) candidates.push({ type: 'move', actor, to });
  }

  // One step towards the nearest enemy, so units meet often enough for attacks to happen.
  if (enemies.length > 0) {
    const nearest = enemies.reduce((best, unit) =>
      distance(current.position, unit.position) < distance(current.position, best.position) ? unit : best,
    );
    const to = {
      x: current.position.x + Math.sign(nearest.position.x - current.position.x),
      y: current.position.y + Math.sign(nearest.position.y - current.position.y),
    };
    if (inBounds(state.board, to)) candidates.push({ type: 'move', actor, to });
  }

  // Only attacks that can land, so the roll is exercised; out-of-range attacks come from the random branch.
  if (!state.hasActed) {
    for (const enemy of enemies) {
      if (distance(current.position, enemy.position) <= current.range) {
        candidates.push({ type: 'attack', actor, target: enemy.id });
      }
    }
  }
  return candidates[nextInt(rng, 0, candidates.length - 1)];
}

describe('properties', () => {
  it('replays every accepted sequence to the same hash and leaves the hash unchanged on rejection', () => {
    let accepted = 0;
    let rejected = 0;
    let attacks = 0;
    let hits = 0;

    for (let seed = 0; seed < 200; seed++) {
      const setup = makePropertySetup(seed);
      const rng = createRng((seed * 7919 + 13) >>> 0);
      const events: Event[] = [];
      let state = newMatch(setup);

      for (let step = 0; step < 40; step++) {
        const hashBefore = hashState(state);
        const result = applyAction(state, randomAction(state, rng));

        if (result.ok) {
          state = result.state;
          events.push(...result.events);
          accepted++;
          for (const event of result.events) {
            if (event.type === 'attacked') {
              assertInteger(event.damage, 'damage');
              attacks++;
              if (event.hit) hits++;
            }
          }
        } else {
          if (hashState(state) !== hashBefore) {
            throw new Error(`a rejected action changed the state at seed ${seed}, step ${step}`);
          }
          rejected++;
        }

        assertInteger(hashState(state), 'hash');
        assertInteger(state.movementLeft, 'movementLeft');
        for (const unit of state.units) {
          assertInteger(unit.health, 'health');
          assertInteger(unit.maxHealth, 'maxHealth');
          assertInteger(unit.position.x, 'position.x');
          assertInteger(unit.position.y, 'position.y');
          if (unit.health < 0) throw new Error(`health went below zero: ${unit.health}`);
          if (unit.health > unit.maxHealth) {
            throw new Error(`health rose above the maximum: ${unit.health} > ${unit.maxHealth}`);
          }
        }
      }

      // The whole state must match, random source included. The hash leaves the rng out on purpose,
      // so comparing only hashes would hide a replay that rolls differently from the live match.
      const replayed = applyEvents(setup, events);
      expect(replayed, `replay diverged from the live state at seed ${seed}`).toEqual(state);
    }

    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
    // The random source is only exercised by attacks, so the replay property needs them.
    expect(attacks).toBeGreaterThan(100);
    expect(hits).toBeGreaterThan(0);
    expect(attacks - hits).toBeGreaterThan(0);
  }, 30_000);

  it('a rebuilt match rolls the same numbers as the live match after the replay', () => {
    const setup: MatchSetup = {
      seed: 99,
      map: makeBoard(),
      teams: [
        [makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 9, hitChance: 50 })],
        [makeUnit({ id: 'b1', team: 'B', position: { x: 0, y: 1 }, speed: 5, hitChance: 50 })],
      ],
    };
    const play = (state: MatchState, action: Action) => {
      const result = applyAction(state, action);
      if (!result.ok) throw new Error(result.reason);
      return result;
    };

    // The live match rolls twice; the replay rebuilds from the events of the first roll only.
    const firstRoll = play(newMatch(setup), { type: 'attack', actor: 'a1', target: 'b1' });
    const live = play(
      play(firstRoll.state, { type: 'endTurn', actor: 'a1' }).state,
      { type: 'attack', actor: 'b1', target: 'a1' },
    );

    const rebuilt = applyEvents(setup, firstRoll.events);
    const replayed = play(
      play(rebuilt, { type: 'endTurn', actor: 'a1' }).state,
      { type: 'attack', actor: 'b1', target: 'a1' },
    );

    expect(replayed.events).toEqual(live.events);
    expect(replayed.state).toEqual(live.state);
  });

  it('returns integers for distance and move cost over the whole board', () => {
    const board = makeBoard({ '0,0': 2, '1,0': 1, '2,2': 1, '3,3': 2 });
    const steps = [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 0],
      [0, -1],
      [-1, -1],
    ];

    for (let x = 0; x <= 7; x++) {
      for (let y = 0; y <= 7; y++) {
        assertInteger(distance({ x, y }, { x: 0, y: 0 }), 'distance');
        for (const [dx, dy] of steps) {
          const to = { x: x + dx, y: y + dy };
          if (!inBounds(board, to)) continue;
          assertInteger(moveCost(board, { x, y }, to), 'moveCost');
        }
      }
    }
  });
});
