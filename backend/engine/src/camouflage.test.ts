// Camouflage (ADR 0023 § 6): a status the Sniper puts on itself, which basic attacks cannot target, which
// lasts three of its own turns and which its own attacks can break. Every roll is carried by an event, so
// a replay lands on the same state as the live match.
import { describe, expect, it } from 'vitest';
import { applyEvent } from './events';
import { currentUnitId } from './initiative';
import { applyAction, applyEvents, hashState, newMatch } from './match';
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

function makeBoard(): Board {
  return { width: 8, height: 8, levels: new Array<number>(64).fill(0) };
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

/** The status itself: three of the caster's own turns, a 30 % break on its own damaging actions. */
const CAMOUFLAGE: AbilityDefinition = {
  id: 'camouflage',
  cost: 3,
  range: 0,
  needsSight: false,
  effect: { kind: 'camouflage', radius: 0, turns: 3, breakChance: 30 },
};

const BOLT: AbilityDefinition = {
  id: 'bolt',
  cost: 1,
  range: 3,
  needsSight: false,
  effect: { kind: 'damage', amount: 2, radius: 0, ignoresCover: true },
};

const HEAL: AbilityDefinition = {
  id: 'heal',
  cost: 1,
  range: 3,
  needsSight: false,
  effect: { kind: 'heal', amount: 2, radius: 0 },
};

const MUD: AbilityDefinition = {
  id: 'mud',
  cost: 1,
  range: 3,
  needsSight: false,
  effect: { kind: 'terrain', radius: 1, durationRounds: 3 },
};

const RESURRECTION: AbilityDefinition = {
  id: 'resurrection',
  cost: 3,
  range: 3,
  needsSight: false,
  effect: { kind: 'revive', radius: 0 },
};

const CATALOG: readonly AbilityDefinition[] = [CAMOUFLAGE, BOLT, HEAL, MUD, RESURRECTION];

/** The two slots a unit carries, in the order the engine reads them. */
function slot(first: string | null, second: string | null = null): Unit['abilities'] {
  return { activeSets: [first, second], reaction: null, movement: null, support: null };
}

/**
 * The sniper on A that opens the match, and the enemy it is aimed at. The sniper carries a deep
 * magazine, because camouflage costs three points and the cases below also fire shots and cast spells.
 */
function duel(
  sniper: Partial<Unit> = {},
  target: Partial<Unit> = {},
  extra: readonly Unit[] = [],
  seed = 1,
): MatchSetup {
  const units = [
    makeUnit({
      id: 'sniper',
      team: 'A',
      position: { x: 0, y: 0 },
      speed: 10,
      health: 20,
      attack: 3,
      hitChance: 100,
      range: 3,
      movement: 4,
      magazine: 10,
      resourceKind: 'ammo',
      primaryClass: 'sniper',
      abilities: slot('camouflage'),
      ...sniper,
    }),
    makeUnit({
      id: 'target',
      team: 'B',
      position: { x: 2, y: 0 },
      speed: 5,
      health: 20,
      movement: 4,
      magazine: 10,
      abilities: slot('camouflage'),
      ...target,
    }),
    ...extra,
  ];
  const team = (id: Team) => units.filter((unit) => unit.team === id);
  return { seed, map: makeBoard(), catalog: CATALOG, teams: [team('A'), team('B')] };
}

function play(state: MatchState, action: Action): ActionResult & { ok: true } {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`expected the action to be accepted, got ${result.reason}`);
  return result;
}

function rejectedReason(state: MatchState, action: Action): string {
  const result = applyAction(state, action);
  if (result.ok) throw new Error('expected the action to be rejected');
  return result.reason;
}

function unitAt(state: MatchState, id: string) {
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`no unit ${id}`);
  return unit;
}

function cast(actor: string, abilityId: string, to: Position, target?: string): Action {
  return { type: 'useAbility', actor, abilityId, to, target } as Action;
}

/** Passes the turn of whoever holds it, which is how the cases move from one unit to the next. */
function pass(state: MatchState): MatchState {
  return play(state, {
    type: 'endTurn',
    actor: currentUnitId(state),
    round: state.round,
  }).state;
}

/**
 * Passes turns until `id` is on turn again, so a caster can use its second action. A caster that has
 * just acted is still the current unit, which is why the first pass is always taken there.
 */
function turnOf(state: MatchState, id: string): MatchState {
  let current = state;
  if (currentUnitId(current) === id && !current.hasActed) return current;
  for (let guard = 0; guard < 16; guard += 1) {
    current = pass(current);
    if (currentUnitId(current) === id) return current;
  }
  throw new Error(`no turn for ${id}`);
}

/** A seed whose first roll lands inside `(low, high]`, which is the roll a case wants to force. */
function seedRollingIn(low: number, high: number): number {
  for (let seed = 0; seed < 5000; seed += 1) {
    const roll = nextInt(createRng(seed), 1, 100);
    if (roll > low && roll <= high) return seed;
  }
  throw new Error(`no seed rolls in (${low}, ${high}]`);
}

/** A seed whose first roll breaks the status and whose second roll misses the shot. */
function seedBreakingAndMissing(breakChance: number, hitChance: number): number {
  for (let seed = 0; seed < 20000; seed += 1) {
    const rng = createRng(seed);
    const breakRoll = nextInt(rng, 1, 100);
    const hitRoll = nextInt(rng, 1, 100);
    if (breakRoll <= breakChance && hitRoll > hitChance) return seed;
  }
  throw new Error(`no seed breaks on ${breakChance} and misses on ${hitChance}`);
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
      run({ type: 'endTurn', actor: currentUnitId(state), round: state.round });
    },
    state: () => state,
    events,
  };
}

describe('camouflage: the cast', () => {
  it('spends its cost, sets the status and rolls nothing', () => {
    const state = newMatch(duel());
    const result = play(state, cast('sniper', 'camouflage', { x: 0, y: 0 }));

    expect(unitAt(result.state, 'sniper').ammo).toBe(7);
    expect(unitAt(result.state, 'sniper').camouflage).toEqual({ turns: 3, breakChance: 30 });
    expect(result.state.rng.state).toBe(state.rng.state);
    expect(result.events.map((event) => event.type)).toEqual(['ability-used']);
    expect(result.state.hasActed).toBe(true);
  });

  it('refuses a basic attack against the camouflaged enemy with target-hidden', () => {
    let state = newMatch(duel());
    state = play(state, cast('sniper', 'camouflage', { x: 0, y: 0 })).state;
    state = pass(state);
    state = play(state, cast('target', 'camouflage', { x: 2, y: 0 })).state;
    state = pass(state);

    expect(currentUnitId(state)).toBe('sniper');
    const snapshot = JSON.parse(JSON.stringify(state)) as MatchState;
    const result = applyAction(state, { type: 'attack', actor: 'sniper', target: 'target' });

    expect(result.ok).toBe(false);
    expect(rejectedReason(state, { type: 'attack', actor: 'sniper', target: 'target' })).toBe(
      'target-hidden',
    );
    expect(state).toEqual(snapshot);
    expect(hashState(state)).toBe(hashState(snapshot));
  });

  it('lets a damage ability reach the cell and damage the camouflaged unit', () => {
    // The target hides on its own turn; the bolt is aimed at the cell, and camouflage only closes the
    // basic-attack rule (ADR 0023 § 6).
    let state = newMatch(duel({ abilities: slot('camouflage', 'bolt') }));
    state = play(state, cast('sniper', 'camouflage', { x: 0, y: 0 })).state;
    state = pass(state);
    state = play(state, cast('target', 'camouflage', { x: 2, y: 0 })).state;
    state = pass(state);

    const result = play(state, cast('sniper', 'bolt', { x: 2, y: 0 }));

    expect(result.events).toContainEqual({ type: 'damaged', target: 'target', hit: true, damage: 2 });
    expect(unitAt(result.state, 'target').health).toBe(18);
    expect(unitAt(result.state, 'target').camouflage).toEqual({ turns: 2, breakChance: 30 });
  });
});

describe('camouflage: the break roll', () => {
  it('resolves a basic attack that breaks the status, and the replay lands on the same state', () => {
    const seed = seedRollingIn(0, 30);
    const game = session(duel({}, {}, [], seed));

    game.run(cast('sniper', 'camouflage', { x: 0, y: 0 }));
    game.pass();
    game.pass();

    const shot = game.run({ type: 'attack', actor: 'sniper', target: 'target' });

    expect(shot.events.map((event) => event.type)).toEqual(['attacked', 'camouflage-ended']);
    expect(shot.events[1]).toEqual({ type: 'camouflage-ended', target: 'sniper', reason: 'broken' });
    expect(unitAt(shot.state, 'sniper').camouflage).toBeNull();
    expect(unitAt(shot.state, 'sniper').ammo).toBe(6);
    // The sniper stands west of a target looking east: a rear shot, so 3 plus the rear bonus.
    expect(unitAt(shot.state, 'target').health).toBe(20 - 3 - 2);

    const replayed = applyEvents(duel({}, {}, [], seed), game.events);
    expect(hashState(replayed)).toBe(hashState(game.state()));
    expect(replayed.rng.state).toBe(game.state().rng.state);
  });

  it('breaks on a miss too: the status goes after the shot resolves', () => {
    // The base accuracy is zero, and a rear shot still adds its 15 points to the roll.
    const seed = seedBreakingAndMissing(30, 15);
    const game = session(duel({ hitChance: 0 }, {}, [], seed));

    game.run(cast('sniper', 'camouflage', { x: 0, y: 0 }));
    game.pass();
    game.pass();

    const shot = game.run({ type: 'attack', actor: 'sniper', target: 'target' });

    expect(shot.events.map((event) => event.type)).toEqual(['attacked', 'camouflage-ended']);
    const attacked = shot.events[0];
    if (attacked.type !== 'attacked') throw new Error('expected the shot first');
    expect(attacked.hit).toBe(false);
    expect(unitAt(shot.state, 'sniper').camouflage).toBeNull();
    expect(unitAt(shot.state, 'target').health).toBe(20);
  });

  it('breaks on a damaging ability, with the break roll inside ability-used.rngState', () => {
    const seed = seedRollingIn(0, 30);
    const game = session(duel({ abilities: slot('camouflage', 'bolt') }, {}, [], seed));

    game.run(cast('sniper', 'camouflage', { x: 0, y: 0 }));
    game.pass();
    game.pass();

    const spell = game.run(cast('sniper', 'bolt', { x: 2, y: 0 }));

    expect(spell.events.map((event) => event.type)).toEqual([
      'ability-used',
      'damaged',
      'camouflage-ended',
    ]);
    expect(spell.events[2]).toEqual({ type: 'camouflage-ended', target: 'sniper', reason: 'broken' });
    expect(unitAt(spell.state, 'sniper').camouflage).toBeNull();
    expect(unitAt(spell.state, 'sniper').ammo).toBe(6);
    expect(hashState(applyEvents(duel({ abilities: slot('camouflage', 'bolt') }, {}, [], seed), game.events))).toBe(
      hashState(game.state()),
    );
  });

  it('does not roll the break for a heal, a terrain cast or a recast', () => {
    // P5: a heal is not an attack, and a cast that changes the ground is not one either.
    const states: [MatchState, Action][] = [];

    let healing = newMatch(duel({ abilities: slot('camouflage', 'heal') }));
    healing = play(healing, cast('sniper', 'camouflage', { x: 0, y: 0 })).state;
    healing = turnOf(healing, 'sniper');
    states.push([healing, cast('sniper', 'heal', { x: 0, y: 0 })]);

    let wet = newMatch(duel({ abilities: slot('camouflage', 'mud') }));
    wet = play(wet, cast('sniper', 'camouflage', { x: 0, y: 0 })).state;
    wet = turnOf(wet, 'sniper');
    states.push([wet, cast('sniper', 'mud', { x: 2, y: 2 })]);

    let recast = newMatch(duel());
    recast = play(recast, cast('sniper', 'camouflage', { x: 0, y: 0 })).state;
    recast = turnOf(recast, 'sniper');
    states.push([recast, cast('sniper', 'camouflage', { x: 0, y: 0 })]);

    for (const [state, action] of states) {
      const result = play(state, action);

      expect(result.events.map((event) => event.type)).not.toContain('camouflage-ended');
      expect(result.state.rng.state).toBe(state.rng.state);
      expect(unitAt(result.state, 'sniper').camouflage).not.toBeNull();
    }
  });

  it('does not roll the break for a revival', () => {
    // A fallen ally is on the map, so the camouflaged caster has a legal revive on its second turn.
    const units = [
      makeUnit({
        id: 'sniper',
        team: 'A',
        position: { x: 0, y: 0 },
        speed: 10,
        magazine: 10,
        abilities: slot('camouflage', 'resurrection'),
      }),
      makeUnit({ id: 'ally', team: 'A', position: { x: 0, y: 1 }, speed: 1, magazine: 2 }),
      makeUnit({ id: 'target', team: 'B', position: { x: 7, y: 7 }, speed: 5, movement: 0 }),
    ];
    const setup: MatchSetup = {
      seed: 3,
      map: makeBoard(),
      catalog: CATALOG,
      teams: [
        units.filter((unit) => unit.team === 'A'),
        units.filter((unit) => unit.team === 'B'),
      ],
    };

    let state: MatchState = newMatch(setup);
    state = applyEvent(state, { type: 'unit-defeated', target: 'ally' });
    state = play(state, cast('sniper', 'camouflage', { x: 0, y: 0 })).state;
    state = turnOf(state, 'sniper');

    const result = play(state, cast('sniper', 'resurrection', { x: 1, y: 0 }, 'ally'));

    expect(result.events.map((event) => event.type)).not.toContain('camouflage-ended');
    expect(result.state.rng.state).toBe(state.rng.state);
    expect(unitAt(result.state, 'sniper').camouflage).not.toBeNull();
    expect(unitAt(result.state, 'ally').defeated).toBe(false);
  });
});

describe('camouflage: the duration', () => {
  it('counts three of the caster own turns, the activation turn included', () => {
    let state = newMatch(duel());
    state = play(state, cast('sniper', 'camouflage', { x: 0, y: 0 })).state;
    expect(unitAt(state, 'sniper').camouflage).toEqual({ turns: 3, breakChance: 30 });

    // End of the activation turn: one of the three is spent.
    const first = play(state, { type: 'endTurn', actor: 'sniper', round: state.round });
    expect(unitAt(first.state, 'sniper').camouflage).toEqual({ turns: 2, breakChance: 30 });
    expect(first.events.map((event) => event.type)).not.toContain('camouflage-ended');

    // Somebody else's turn moves nothing.
    const other = play(first.state, { type: 'endTurn', actor: 'target', round: first.state.round });
    expect(unitAt(other.state, 'sniper').camouflage).toEqual({ turns: 2, breakChance: 30 });

    // The second own turn: two of three spent, still hidden.
    const second = play(other.state, { type: 'endTurn', actor: 'sniper', round: other.state.round });
    expect(unitAt(second.state, 'sniper').camouflage).toEqual({ turns: 1, breakChance: 30 });
    expect(second.events.map((event) => event.type)).not.toContain('camouflage-ended');

    const back = play(second.state, { type: 'endTurn', actor: 'target', round: second.state.round });
    // The third and last own turn takes the status to zero and announces it after the turn events.
    const third = play(back.state, { type: 'endTurn', actor: 'sniper', round: back.state.round });

    expect(unitAt(third.state, 'sniper').camouflage).toBeNull();
    expect(third.events.map((event) => event.type)).toEqual(['turn-ended', 'camouflage-ended']);
    expect(third.events[1]).toEqual({
      type: 'camouflage-ended',
      target: 'sniper',
      reason: 'expired',
    });
  });

  it('refreshes the three turns when it is cast again', () => {
    let state = newMatch(duel());
    state = play(state, cast('sniper', 'camouflage', { x: 0, y: 0 })).state;
    state = turnOf(state, 'sniper');
    expect(unitAt(state, 'sniper').camouflage).toEqual({ turns: 2, breakChance: 30 });

    const recast = play(state, cast('sniper', 'camouflage', { x: 0, y: 0 }));

    expect(unitAt(recast.state, 'sniper').camouflage).toEqual({ turns: 3, breakChance: 30 });
    expect(recast.events.map((event) => event.type)).toEqual(['ability-used']);
  });

  it('clears the status when the unit is defeated: a body never carries it', () => {
    let state = newMatch(duel());
    state = play(state, cast('sniper', 'camouflage', { x: 0, y: 0 })).state;
    expect(unitAt(state, 'sniper').camouflage).not.toBeNull();

    const next = applyEvent(state, { type: 'unit-defeated', target: 'sniper' });

    expect(unitAt(next, 'sniper').defeated).toBe(true);
    expect(unitAt(next, 'sniper').camouflage).toBeNull();
  });
});

describe('camouflage: the fingerprint', () => {
  it('distinguishes a camouflaged unit from one that is not', () => {
    const state = newMatch(duel());
    const hidden = play(state, cast('sniper', 'camouflage', { x: 0, y: 0 })).state;

    expect(unitAt(hidden, 'sniper').camouflage).not.toBeNull();
    expect(hashState(hidden)).not.toBe(hashState(state));
  });

  it('hashes the same state the same whatever the key order', () => {
    const state = play(newMatch(duel()), cast('sniper', 'camouflage', { x: 0, y: 0 })).state;
    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeys);
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, item]) => [key, reverseKeys(item)]),
        );
      }
      return value;
    };

    expect(hashState(reverseKeys(state) as MatchState)).toBe(hashState(state));
  });
});
