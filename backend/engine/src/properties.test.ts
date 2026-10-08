import { describe, expect, it } from 'vitest';
import { abilityById } from './abilities';
import { distance, inBounds } from './board';
import { currentUnitId, unitById } from './initiative';
import { applyAction, applyEvents, hashState, newMatch } from './match';
import { moveCost } from './movement';
import { createRng, nextInt } from './rng';
import type {
  AbilityDefinition,
  Action,
  Board,
  Event,
  Facing,
  MatchSetup,
  MatchState,
  Prop,
  Rng,
  Team,
  Unit,
} from './types';

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

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new Error(`${label} is not an integer: ${String(value)}`);
}

/**
 * The two definitions the property match carries: one area that hurts everybody standing in it and one
 * that heals them. They share a cost and a reach so neither is ever favoured by the shape alone.
 */
const PROPERTY_CATALOG: readonly AbilityDefinition[] = [
  {
    id: 'zap',
    cost: 1,
    range: 2,
    needsSight: true,
    effect: { kind: 'damage', amount: 2, radius: 1, ignoresCover: true },
  },
  {
    id: 'mend',
    cost: 1,
    range: 2,
    needsSight: false,
    effect: { kind: 'heal', amount: 2, radius: 1 },
  },
];

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
      // A magic class: the pool is what an ability is paid from, and it is also what its basic attack
      // spends, so the two costs meet on the same unit (ADR 0011, ADR 0016).
      magazine: 3,
      resourceKind: 'mana',
      abilities: { activeSets: ['mend', null], reaction: null, movement: null, support: null },
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
      magazine: 3,
      resourceKind: 'mana',
      abilities: { activeSets: ['zap', null], reaction: null, movement: null, support: null },
    }),
  ];
  const team = (id: Team) => units.filter((unit) => unit.team === id);
  return {
    seed: seed >>> 0,
    catalog: PROPERTY_CATALOG,
    // The props are part of the board a match plays on, so every property below is asked of a board
    // that carries them: a crate beside the units, a tower across the alley from them.
    map: makeBoard({ '2,2': 1, '3,3': 2, '6,6': 1 }, [
      coverAt(2, 3),
      coverAt(3, 2),
      wallAt(6, 2),
    ]),
    teams: [team('A'), team('B')],
  };
}

/** A two-unit match on flat ground carrying `props`, for the cases that read the board alone. */
function makeSetupWithProps(props: readonly Prop[]): MatchSetup {
  return {
    seed: 1,
    map: makeBoard({}, props),
    teams: [
      [makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 9 })],
      [makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 5 })],
    ],
  };
}

const FACINGS: Facing[] = ['N', 'S', 'E', 'W'];

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
  const candidates: Action[] = [
    { type: 'endTurn', actor, round: state.round },
    // A free action, so it is a candidate on every turn and the replay has to rebuild it too.
    { type: 'face', actor, facing: FACINGS[nextInt(rng, 0, FACINGS.length - 1)] },
  ];

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

  // An ability the unit carries and the match defines, aimed at the unit's own cell and at the cells of
  // the two nearest enemies: the places a unit is most likely to be standing, so the effect lands on
  // somebody and the roll of the resolution is exercised. It is a candidate on the same terms as an
  // attack, and a refused use is a rejection like any other.
  if (!state.hasActed) {
    const abilityId = current.abilities.activeSets[0];
    const ability = abilityId === null ? undefined : abilityById(state.catalog, abilityId);

    if (ability) {
      for (const to of [current.position, ...enemies.slice(0, 2).map((enemy) => enemy.position)]) {
        if (distance(current.position, to) <= ability.range) {
          candidates.push({ type: 'useAbility', actor, abilityId: ability.id, to });
        }
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
    let casts = 0;
    let damaged = 0;
    let healed = 0;

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
            if (event.type === 'ability-used') casts++;
            if (event.type === 'damaged') {
              assertInteger(event.damage, 'ability damage');
              damaged++;
            }
            if (event.type === 'healed') {
              assertInteger(event.amount, 'healing');
              healed++;
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
    // An ability rolls once per unit standing on the effect, so the replay property above only means
    // something about `rngState` if uses actually happened. The same goes for both kinds of effect.
    expect(casts).toBeGreaterThan(0);
    expect(damaged).toBeGreaterThan(0);
    expect(healed).toBeGreaterThan(0);
  }, 30_000);

  it('gives the same final state twice for the same seed and the same actions, props on the board', () => {
    for (let seed = 0; seed < 20; seed++) {
      const play = () => {
        const rng = createRng((seed * 104729 + 7) >>> 0);
        let state = newMatch(makePropertySetup(seed));

        for (let step = 0; step < 40; step++) {
          const result = applyAction(state, randomAction(state, rng));
          if (result.ok) state = result.state;
        }

        return hashState(state);
      };

      expect(play(), `seed ${seed}`).toBe(play());
    }
  });

  it('rebuilds the facings from the events alone, the explicit turn included', () => {
    const setup: MatchSetup = {
      seed: 7,
      map: makeBoard(),
      teams: [
        [makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 9, range: 2 })],
        [makeUnit({ id: 'b1', team: 'B', position: { x: 2, y: 0 }, speed: 5, range: 2, health: 30 })],
      ],
    };
    const play = (state: MatchState, action: Action) => {
      const result = applyAction(state, action);
      if (!result.ok) throw new Error(result.reason);
      return result;
    };

    let live = newMatch(setup);
    const events: Event[] = [];
    for (const action of [
      // A turn nobody would guess from the walk that follows it: the unit turns north and then walks
      // south, so only the event of the turn itself carries the answer.
      { type: 'face', actor: 'a1', facing: 'N' },
      { type: 'move', actor: 'a1', to: { x: 0, y: 2 } },
      { type: 'commitMove', actor: 'a1' },
      { type: 'endTurn', actor: 'a1', round: 1 },
      { type: 'face', actor: 'b1', facing: 'N' },
      { type: 'attack', actor: 'b1', target: 'a1' },
    ] as Action[]) {
      const result = play(live, action);
      live = result.state;
      events.push(...result.events);
    }

    // The walk left `a1` looking south and the shot left `b1` looking west, over the face it set.
    expect(live.units.map((unit) => unit.facing)).toEqual(['S', 'W']);
    expect(applyEvents(setup, events)).toEqual(live);
  });

  it('hashes the props of the board, so two boards that differ only in props differ', () => {
    // A replay that rebuilt the same terrain but lost the crates would otherwise compare equal.
    const bare = hashState(newMatch(makeSetupWithProps([coverAt(2, 3)])));
    const covered = hashState(newMatch(makeSetupWithProps([coverAt(3, 3)])));

    expect(bare).not.toBe(covered);
    expect(bare).toBe(hashState(newMatch(makeSetupWithProps([coverAt(2, 3)]))));
  });

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
      play(firstRoll.state, { type: 'endTurn', actor: 'a1', round: firstRoll.state.round }).state,
      { type: 'attack', actor: 'b1', target: 'a1' },
    );

    const rebuilt = applyEvents(setup, firstRoll.events);
    const replayed = play(
      play(rebuilt, { type: 'endTurn', actor: 'a1', round: rebuilt.round }).state,
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
