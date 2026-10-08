import { describe, expect, it } from 'vitest';
import { abilityById, abilityCells } from './abilities';
import { canStillAct } from './actions';
import { applyAction, applyEvents, hashState, newMatch } from './match';
import { createRng, nextInt } from './rng';
import type {
  AbilityDefinition,
  Action,
  ActionResult,
  Board,
  MatchSetup,
  MatchState,
  Position,
  Prop,
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

type UnitFields = Partial<Unit> & Pick<Unit, 'id' | 'position'>;

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

/**
 * The three shapes the mechanism has to carry: a single-target damage effect that pays for cover, an
 * area damage effect that ignores it, and a heal that needs no sight. `bolt` and `fireball` share a
 * cost, a reach and a sight rule on purpose, so the two differ in nothing but their effect.
 */
const BOLT: AbilityDefinition = {
  id: 'bolt',
  cost: 2,
  range: 3,
  needsSight: true,
  effect: { kind: 'damage', amount: 4, radius: 0, ignoresCover: false },
};

const FIREBALL: AbilityDefinition = {
  id: 'fireball',
  cost: 2,
  range: 3,
  needsSight: true,
  effect: { kind: 'damage', amount: 3, radius: 1, ignoresCover: true },
};

const HEAL: AbilityDefinition = {
  id: 'area-heal',
  cost: 1,
  range: 3,
  needsSight: false,
  effect: { kind: 'heal', amount: 3, radius: 1 },
};

const CATALOG: readonly AbilityDefinition[] = [BOLT, FIREBALL, HEAL];

/** A unit on the team of the caster, which is what the friendly fire of an area is read against. */
function ally(fields: UnitFields): Unit {
  return makeUnit({ team: 'A', ...fields });
}

/** A unit on the opposing team. */
function foe(fields: UnitFields): Unit {
  return makeUnit({ team: 'B', ...fields });
}

interface SetupOptions {
  /** The seed of the match, which is also where the first roll of its rng is read from. */
  seed?: number;
  board?: Board;
  /** `null` leaves the catalog out of the setup entirely, which is the match that defines nothing. */
  catalog?: readonly AbilityDefinition[] | null;
}

/** The wizard slot the plan gives a caster, so a case can name the one ability it is about. */
function slot(abilityId: string): Unit['abilities'] {
  return { activeSets: [abilityId, null], reaction: null, movement: null, support: null };
}

/**
 * A magic caster on A that opens the match (speed 10 against the squad's 1), and the squad it aims at.
 * The caster opens at (2,0) and the first of the squad at (5,0): three cells apart, which is exactly
 * the reach of the two damage effects, and read as a shot from the front — team B opens looking west,
 * towards the caster — so neither the accuracy nor the damage carries a direction bonus.
 */
function casterSetup(
  caster: Partial<Unit> = {},
  squad: readonly UnitFields[] = [{ id: 'target', position: { x: 5, y: 0 } }],
  options: SetupOptions = {},
  friends: readonly UnitFields[] = [],
): MatchSetup {
  return {
    seed: options.seed ?? 1,
    map: options.board ?? makeBoard(),
    ...(options.catalog === null ? {} : { catalog: options.catalog ?? CATALOG }),
    teams: [
      [
        makeUnit({
          id: 'wizard',
          team: 'A',
          position: { x: 2, y: 0 },
          speed: 10,
          health: 14,
          attack: 3,
          range: 3,
          magazine: 3,
          resourceKind: 'mana',
          primaryClass: 'wizard',
          abilities: slot('fireball'),
          ...caster,
        }),
        ...friends.map(ally),
      ],
      squad.map(foe),
    ],
  };
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

/** A pool written by hand, without playing the turns that would spend it. */
function withPool(state: MatchState, id: string, ammo: number): MatchState {
  return { ...state, units: state.units.map((unit) => (unit.id === id ? { ...unit, ammo } : unit)) };
}

/** A health written by hand, without playing the damage that would take the unit there. */
function withHealth(state: MatchState, id: string, health: number): MatchState {
  return { ...state, units: state.units.map((unit) => (unit.id === id ? { ...unit, health } : unit)) };
}

/** What a use of an ability aims at: the cell, never a unit (ADR 0016 §5). */
function cast(abilityId: string, to: Position): Action {
  return { type: 'useAbility', actor: 'wizard', abilityId, to };
}

/**
 * A seed whose opening roll lands inside `(low, high]`. A roll is the only thing the rng is asked for
 * before the first action of a match, so the seed decides the whole resolution and a chance that sits
 * between the two bounds is what separates a hit from a miss.
 */
function seedRollingIn(low: number, high: number): number {
  for (let seed = 0; seed < 5000; seed += 1) {
    const roll = nextInt(createRng(seed), 1, 100);
    if (roll > low && roll <= high) return seed;
  }
  throw new Error(`no seed rolls in (${low}, ${high}]`);
}

/** The cells of a list, sorted, so an answer is read as a set and not as an order. */
function sorted(cells: readonly Position[]): string[] {
  return cells.map((cell) => `${cell.x},${cell.y}`).sort();
}

describe('abilityById', () => {
  it('finds the definition a catalog entry carries', () => {
    expect(abilityById(CATALOG, 'fireball')).toBe(FIREBALL);
  });

  it('answers undefined for an id no definition carries', () => {
    expect(abilityById(CATALOG, 'meteor')).toBeUndefined();
  });

  it('answers undefined for an empty catalog, and for a match that carries none', () => {
    const bare = newMatch(casterSetup({}, undefined, { catalog: null }));

    expect(abilityById([], 'fireball')).toBeUndefined();
    expect(bare.catalog).toEqual([]);
    expect(abilityById(bare.catalog, 'fireball')).toBeUndefined();
  });
});

describe('abilityCells', () => {
  const state = newMatch(casterSetup());

  it('is the single cell when the radius is zero', () => {
    expect(abilityCells(state, { x: 4, y: 4 }, BOLT)).toEqual([{ x: 4, y: 4 }]);
  });

  it('is the nine cells around the aim when the radius is one', () => {
    const cells = abilityCells(state, { x: 4, y: 4 }, FIREBALL);

    expect(sorted(cells)).toEqual(
      sorted([
        { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
        { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 },
        { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 },
      ]),
    );
  });

  it('reads the radius in Chebyshev distance, so the corners are inside it', () => {
    const wide: AbilityDefinition = { ...FIREBALL, effect: { ...FIREBALL.effect, radius: 2 } };
    const cells = abilityCells(state, { x: 4, y: 4 }, wide);

    expect(cells).toHaveLength(25);
    expect(sorted(cells)).toContain('2,2');
    expect(sorted(cells)).toContain('6,6');
  });

  it('clips the area at the board instead of walking off it', () => {
    const cells = abilityCells(state, { x: 0, y: 0 }, FIREBALL);

    expect(sorted(cells)).toEqual(
      sorted([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]),
    );
  });

  it('answers nothing for a cell off the board, the way the attack area does', () => {
    expect(abilityCells(state, { x: -1, y: 0 }, FIREBALL)).toEqual([]);
    expect(abilityCells(state, { x: 8, y: 0 }, FIREBALL)).toEqual([]);
  });
});

describe('the refusals of a use', () => {
  it('refuses an ability that is not on the caster own slots', () => {
    // The catalog carries `bolt`, and the caster does not: the id is looked up in the unit, not in the
    // catalog (ADR 0016 §6).
    const state = newMatch(casterSetup());

    expect(rejectedReason(state, cast('bolt', { x: 5, y: 0 }))).toBe('ability-unknown');
  });

  it('refuses an id the caster carries that no catalog defines', () => {
    // The other half of the same rule: the slot names an ability the match has no definition for, so
    // there is nothing to resolve and the use is refused rather than guessed at.
    const state = newMatch(casterSetup({ abilities: slot('meteor') }));

    expect(rejectedReason(state, cast('meteor', { x: 5, y: 0 }))).toBe('ability-unknown');
  });

  it('refuses a use the pool cannot pay for, and names the pool that is short', () => {
    // One point against a cost of two: the pool is not empty, it is short, and the answer names the pool
    // the player has to refill rather than the distance (ADR 0011 §2, ADR 0016 §7).
    const short = withPool(newMatch(casterSetup()), 'wizard', 1);

    expect(rejectedReason(short, cast('fireball', { x: 5, y: 0 }))).toBe('no-mana');
  });

  it('refuses with no event and without touching the state', () => {
    const short = withPool(newMatch(casterSetup()), 'wizard', 1);
    const before = hashState(short);

    expect(applyAction(short, cast('fireball', { x: 5, y: 0 }))).toEqual({ ok: false, reason: 'no-mana' });
    expect(hashState(short)).toBe(before);
  });

  it('refuses a second use in the same turn', () => {
    const used = play(newMatch(casterSetup()), cast('fireball', { x: 5, y: 0 }));

    expect(rejectedReason(used.state, cast('fireball', { x: 5, y: 0 }))).toBe('already-acted');
  });

  it('refuses an aim off the board', () => {
    expect(rejectedReason(newMatch(casterSetup()), cast('fireball', { x: 8, y: 0 }))).toBe('out-of-bounds');
  });

  it('refuses an aim beyond the reach of the definition', () => {
    // The reach is the ability own, not the unit `range`: the caster stands at (2,0) and the cell is five
    // away, which is past the three of the definition (ADR 0016 §1).
    const state = newMatch(casterSetup({}, [{ id: 'target', position: { x: 7, y: 0 } }]));

    expect(rejectedReason(state, cast('fireball', { x: 7, y: 0 }))).toBe('target-out-of-range');
  });

  it('refuses an aim out of sight when the definition needs sight', () => {
    const state = newMatch(casterSetup({}, undefined, { board: makeBoard({}, [wallAt(3, 0)]) }));

    expect(rejectedReason(state, cast('fireball', { x: 5, y: 0 }))).toBe('no-line-of-sight');
  });

  it('accepts the same aim for a definition that needs no sight', () => {
    // The priest heals an ally behind a wall, which is the one thing the heal buys over the spells: the
    // ally stands out of the caster's view and is still reached (ADR 0016, the three definitions).
    const state = newMatch(
      casterSetup({ abilities: slot('area-heal') }, [{ id: 'target', position: { x: 7, y: 7 } }], {
        board: makeBoard({}, [wallAt(3, 0)]),
      }, [{ id: 'ally', position: { x: 5, y: 0 }, health: 4 }]),
    );

    expect(play(state, cast('area-heal', { x: 5, y: 0 })).ok).toBe(true);
  });
});

describe('the resolution of a use', () => {
  it('spends the cost of the definition and spends the action, not the movement', () => {
    const state = newMatch(casterSetup());
    const result = play(state, cast('fireball', { x: 5, y: 0 }));

    // Two points for a fireball, where a basic attack spends one (ADR 0016, the three definitions).
    expect(unitAt(result.state, 'wizard').ammo).toBe(1);
    expect(result.state.hasActed).toBe(true);
    expect(result.state.movementLeft).toBe(state.movementLeft);
  });

  it('opens the resolution with ability-used, carrying the cell, the id and the pool', () => {
    const result = play(newMatch(casterSetup()), cast('fireball', { x: 5, y: 0 }));

    expect(result.events[0]).toEqual({
      type: 'ability-used',
      actor: 'wizard',
      abilityId: 'fireball',
      to: { x: 5, y: 0 },
      rngState: expect.any(Number),
      resource: 'mana',
    });
  });

  it('damages every living unit standing on a cell of the effect, in setup order', () => {
    const state = newMatch(
      casterSetup({}, [
        { id: 'near', position: { x: 5, y: 0 } },
        { id: 'beside', position: { x: 6, y: 0 } },
        { id: 'far', position: { x: 7, y: 6 } },
      ]),
    );
    const result = play(state, cast('fireball', { x: 5, y: 0 }));

    // The radius of one covers (4,0) to (6,1); `far` stands well outside it and is never read.
    expect(result.events.slice(1)).toEqual([
      { type: 'damaged', target: 'near', hit: true, damage: 3 },
      { type: 'damaged', target: 'beside', hit: true, damage: 3 },
    ]);
    expect(unitAt(result.state, 'far').health).toBe(10);
  });

  it('damages the caster own allies standing in the area', () => {
    // ADR 0016 §12: an area that spared allies would remove the reason to place the shot at all.
    const state = newMatch(
      casterSetup({}, [{ id: 'target', position: { x: 7, y: 7 } }], {}, [
        { id: 'friend', position: { x: 5, y: 1 }, health: 12 },
      ]),
    );
    const result = play(state, cast('fireball', { x: 5, y: 0 }));

    expect(result.events).toContainEqual({ type: 'damaged', target: 'friend', hit: true, damage: 3 });
    expect(unitAt(result.state, 'friend').health).toBe(9);
  });

  it('takes the amount of the definition as the damage, with no direction or height bonus on it', () => {
    // The target opens looking east — it spawns on the left half of the map (ADR 0014, D1) — and the
    // caster stands to its west, so this is a shot into its back: worth two points of damage to a basic
    // attack. The amount of the definition is what lands: the effect is data, not a weapon (ADR 0016 §3).
    const behind = play(
      newMatch(casterSetup({}, [{ id: 'target', position: { x: 3, y: 0 } }])),
      cast('fireball', { x: 3, y: 0 }),
    );

    expect(behind.events).toContainEqual({ type: 'damaged', target: 'target', hit: true, damage: 3 });
  });

  it('lowers the roll of a damage effect that does not ignore cover, and never touches one that does', () => {
    // One crate between the caster and its target takes 25 of the 50 the caster carries, so the two
    // definitions are separated by a roll in (25, 50] and by nothing else (ADR 0012, ADR 0016 §9).
    const seed = seedRollingIn(50 - 25, 50);
    const board = makeBoard({}, [coverAt(4, 0)]);
    const plain = casterSetup({ hitChance: 50, abilities: slot('bolt') }, undefined, { seed, board });
    const ignoring = casterSetup({ hitChance: 50, abilities: slot('fireball') }, undefined, { seed, board });

    const covered = play(newMatch(plain), cast('bolt', { x: 5, y: 0 }));
    const through = play(newMatch(ignoring), cast('fireball', { x: 5, y: 0 }));

    expect(covered.events).toContainEqual({ type: 'damaged', target: 'target', hit: false, damage: 0 });
    expect(through.events).toContainEqual({ type: 'damaged', target: 'target', hit: true, damage: 3 });
  });

  it('rolls once per affected unit, and every roll is inside the rngState the use carries', () => {
    const setup = casterSetup({ hitChance: 50 }, [
      { id: 'first', position: { x: 5, y: 0 } },
      { id: 'second', position: { x: 6, y: 0 } },
      { id: 'third', position: { x: 5, y: 1 } },
    ]);
    const result = play(newMatch(setup), cast('fireball', { x: 5, y: 0 }));

    // Three units on the effect, so three draws, and the event carries the source as the last of them
    // left it. A replay that rolled again would land somewhere else.
    expect(result.events.filter((event) => event.type === 'damaged')).toHaveLength(3);
    expect(applyEvents(setup, result.events)).toEqual(result.state);
  });

  it('caps a heal at the maximum health of the target', () => {
    const state = withHealth(
      newMatch(
        casterSetup({ abilities: slot('area-heal') }, [{ id: 'target', position: { x: 7, y: 7 } }], {}, [
          { id: 'ally', position: { x: 5, y: 0 }, health: 10 },
        ]),
      ),
      'ally',
      8,
    );
    const result = play(state, cast('area-heal', { x: 5, y: 0 }));

    // Three points asked for, two of room: the event carries what happened and not what was offered.
    expect(result.events).toContainEqual({ type: 'healed', target: 'ally', amount: 2 });
    expect(unitAt(result.state, 'ally').health).toBe(10);
  });

  it('skips a defeated unit, which is not healed back onto its feet', () => {
    // The squad keeps a unit standing so the match is not over, which is what a heal of a body would be
    // refused by if the rule read the units instead of the cells (ADR 0016 §10).
    const state = newMatch(
      casterSetup({ abilities: slot('area-heal') }, [{ id: 'spare', position: { x: 7, y: 7 } }], {}, [
        { id: 'body', position: { x: 5, y: 0 } },
      ]),
    );
    const fallen: MatchState = {
      ...state,
      units: state.units.map((unit) => (unit.id === 'body' ? { ...unit, health: 0, defeated: true } : unit)),
    };

    const result = play(fallen, cast('area-heal', { x: 5, y: 0 }));

    expect(result.events.some((event) => event.type === 'healed')).toBe(false);
    expect(unitAt(result.state, 'body').health).toBe(0);
  });

  it('settles a defeat after every roll of the resolution, in setup order', () => {
    const setup = casterSetup({}, [
      { id: 'first', position: { x: 5, y: 0 }, health: 1 },
      { id: 'second', position: { x: 6, y: 0 }, health: 1 },
    ]);
    const result = play(newMatch(setup), cast('fireball', { x: 5, y: 0 }));

    expect(result.events).toEqual([
      {
        type: 'ability-used',
        actor: 'wizard',
        abilityId: 'fireball',
        to: { x: 5, y: 0 },
        rngState: expect.any(Number),
        resource: 'mana',
      },
      { type: 'damaged', target: 'first', hit: true, damage: 3 },
      { type: 'damaged', target: 'second', hit: true, damage: 3 },
      { type: 'unit-defeated', target: 'first' },
      { type: 'unit-defeated', target: 'second' },
    ]);
    expect(unitAt(result.state, 'first').defeated).toBe(true);
    expect(unitAt(result.state, 'second').defeated).toBe(true);
  });
});

describe('the turn of a unit with an ability', () => {
  /**
   * A caster boxed in on its own cell: no movement to spend, no enemy inside the reach of its weapon,
   * and a pool already full, so neither a walk, nor a strike, nor a refill is left. What remains is the
   * ability, which is the only thing `canStillAct` can answer with (ADR 0016 §6).
   */
  function boxedIn(cost: number): MatchState {
    const state = newMatch(
      casterSetup({ movement: 0, range: 0, abilities: slot('bolt') }, [{ id: 'target', position: { x: 7, y: 7 } }], {
        catalog: [{ ...BOLT, cost }],
      }),
    );
    return state;
  }

  it('answers that the turn is not over while an ability the pool covers is left', () => {
    // The pool carries three points and the definition asks for two, and the caster can always aim at the
    // cell it stands on, so there is something left to do.
    expect(canStillAct(boxedIn(2))).toBe(true);
  });

  it('answers that the turn is over when the pool cannot cover the cost', () => {
    // Three points of mana against a cost of four, and the pool is already at its ceiling, so there is no
    // refill to fall back on either.
    expect(canStillAct(boxedIn(4))).toBe(false);
  });
});

describe('abilities and the hash', () => {
  it('gives the same final state twice for the same seed and the same actions', () => {
    const setup = casterSetup({}, [
      { id: 'target', position: { x: 5, y: 0 }, health: 40 },
      { id: 'spare', position: { x: 6, y: 0 }, health: 40 },
    ]);
    const steps: Action[] = [
      cast('fireball', { x: 5, y: 0 }),
      { type: 'endTurn', actor: 'wizard', round: 1 },
      { type: 'endTurn', actor: 'target', round: 1 },
    ];

    const run = () => {
      let state = newMatch(setup);
      for (const step of steps) state = play(state, step).state;
      return state;
    };

    expect(hashState(run())).toBe(hashState(run()));
  });

  it('replays a match of spells to the same state and the same hash', () => {
    const setup = casterSetup({}, [{ id: 'target', position: { x: 5, y: 0 }, health: 40 }]);
    const steps: Action[] = [
      cast('fireball', { x: 5, y: 0 }),
      { type: 'endTurn', actor: 'wizard', round: 1 },
      { type: 'endTurn', actor: 'target', round: 1 },
      // Round 2 opens on the wizard: it spent two of its three points, and the turn handed one back
      // (ADR 0017), so the second spell is payable.
      cast('fireball', { x: 5, y: 0 }),
      { type: 'endTurn', actor: 'wizard', round: 2 },
    ];

    let state = newMatch(setup);
    const events: Action extends never ? never : Parameters<typeof applyEvents>[1] = [];
    for (const step of steps) {
      const result = play(state, step);
      events.push(...result.events);
      state = result.state;
    }

    expect(unitAt(state, 'wizard').ammo).toBe(0);
    expect(unitAt(state, 'target').health).toBe(34);
    expect(hashState(applyEvents(setup, events))).toBe(hashState(state));
  });

  it('hashes the catalog, so two matches that carry different definitions differ', () => {
    const weaker = newMatch(casterSetup({}, undefined, { catalog: [BOLT] }));
    const stronger = newMatch(
      casterSetup({}, undefined, { catalog: [{ ...BOLT, effect: { ...BOLT.effect, amount: 5 } }] }),
    );

    expect(hashState(weaker)).not.toBe(hashState(stronger));
  });
});
