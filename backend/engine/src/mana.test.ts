import { describe, expect, it } from 'vitest';
import { DIRECTION_BONUS } from './facing';
import { applyAction, applyEvents, hashState, newMatch } from './match';
import type {
  Action,
  ActionResult,
  Board,
  Event,
  MatchSetup,
  MatchState,
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

/**
 * A magic class (pool 3, reach 3) on A and one target on B, three cells away by default. The caster is
 * faster, so it has the turn. `heights` builds the walls a line of sight has to read.
 */
function casterSetup(
  caster: Partial<Unit> = {},
  target: Partial<Unit> = {},
  heights: Record<string, number> = {},
): MatchSetup {
  return {
    seed: 11,
    map: makeBoard(heights),
    teams: [
      [
        makeUnit({
          id: 'wizard',
          team: 'A',
          position: { x: 0, y: 0 },
          speed: 10,
          range: 3,
          magazine: 3,
          resourceKind: 'mana',
          attack: 3,
          primaryClass: 'wizard',
          ...caster,
        }),
      ],
      [makeUnit({ id: 'target', team: 'B', position: { x: 0, y: 3 }, speed: 1, ...target })],
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

/** The same pool the setup filled, emptied. */
function withEmptyPool(state: MatchState, id: string): MatchState {
  return withPool(state, id, 0);
}

/**
 * Hands the turn over twice, so the wizard comes on turn again: the moment a magic pool regenerates
 * (ADR 0017). Two units, so the queue wraps and the round rises with the second hand-over.
 */
function backToTheWizard(state: MatchState): ActionResult & { ok: true } {
  const handedOver = play(state, { type: 'endTurn', actor: 'wizard', round: state.round });
  return play(handedOver.state, {
    type: 'endTurn',
    actor: 'target',
    round: handedOver.state.round,
  });
}

/**
 * Three units, so the queue survives a death: a killer on A that can reach `doomed` on its first
 * turn, and a second unit on B that cannot be reached and keeps the match running.
 */
function executionSetup(): MatchSetup {
  return {
    seed: 11,
    map: makeBoard(),
    teams: [
      [
        makeUnit({
          id: 'killer',
          team: 'A',
          position: { x: 0, y: 0 },
          speed: 10,
          attack: 100,
          range: 3,
        }),
      ],
      [
        makeUnit({
          id: 'doomed',
          team: 'B',
          position: { x: 0, y: 1 },
          speed: 5,
          health: 1,
          magazine: 3,
          resourceKind: 'mana',
        }),
        // A magic class well out of reach, so it does come on turn and does take its point.
        makeUnit({
          id: 'spare',
          team: 'B',
          position: { x: 7, y: 7 },
          speed: 1,
          magazine: 3,
          resourceKind: 'mana',
        }),
      ],
    ],
  };
}

const STRIKE: Action = { type: 'attack', actor: 'wizard', target: 'target' };

describe('mana', () => {
  it('starts with a full pool', () => {
    const state = newMatch(casterSetup());

    expect(unitAt(state, 'wizard').ammo).toBe(3);
    expect(unitAt(state, 'wizard').resourceKind).toBe('mana');
  });

  it('spends one mana on a strike at range 1', () => {
    const state = newMatch(casterSetup({}, { position: { x: 0, y: 1 } }));
    const result = play(state, STRIKE);

    // The caster stands beside its target rather than in front of it, so the strike carries the bonus
    // of a flank shot on top of the weapon's own (ADR 0014).
    expect(result.events).toEqual([
      expect.objectContaining({
        type: 'attacked',
        hit: true,
        damage: 3 + DIRECTION_BONUS.flank.damage,
        resource: 'mana',
      }),
    ]);
    expect(unitAt(result.state, 'wizard').ammo).toBe(2);
  });

  it('spends one mana on a strike at range 3', () => {
    const state = newMatch(casterSetup());
    const result = play(state, STRIKE);

    expect(result.events).toEqual([
      expect.objectContaining({ type: 'attacked', resource: 'mana' }),
    ]);
    expect(unitAt(result.state, 'wizard').ammo).toBe(2);
  });

  it('deals the full attack at range 1 and at range 3, with no melee halving', () => {
    const near = play(newMatch(casterSetup({ attack: 5 }, { position: { x: 0, y: 1 } })), STRIKE);
    const far = play(newMatch(casterSetup({ attack: 5 })), STRIKE);

    // Half of 5 would be 2, which is what the melee fallback used to deal at an adjacent target. Both
    // shots come from the flank, so both carry the same bonus of the direction table (ADR 0014).
    expect(near.events[0]).toEqual(
      expect.objectContaining({ damage: 5 + DIRECTION_BONUS.flank.damage }),
    );
    expect(far.events[0]).toEqual(
      expect.objectContaining({ damage: 5 + DIRECTION_BONUS.flank.damage }),
    );
  });

  it('refuses a strike with no mana, whatever the distance', () => {
    // 1 and 3 are inside the reach, 4 is outside it: the empty pool is answered before the reach is.
    for (const position of [{ x: 0, y: 1 }, { x: 0, y: 3 }, { x: 0, y: 4 }]) {
      const empty = withEmptyPool(newMatch(casterSetup({}, { position })), 'wizard');
      expect(rejectedReason(empty, STRIKE)).toBe('no-mana');
    }
  });

  it('refuses with no event and without touching the state', () => {
    const empty = withEmptyPool(newMatch(casterSetup({}, { position: { x: 0, y: 3 } })), 'wizard');
    const before = hashState(empty);

    expect(applyAction(empty, STRIKE)).toEqual({ ok: false, reason: 'no-mana' });
    expect(hashState(empty)).toBe(before);
  });

  it('meditation refills the pool and spends the action, not the movement', () => {
    const state = withEmptyPool(newMatch(casterSetup()), 'wizard');
    const result = play(state, { type: 'reload', actor: 'wizard' });

    expect(result.events).toEqual([{ type: 'reloaded', actor: 'wizard', resource: 'mana' }]);
    expect(unitAt(result.state, 'wizard').ammo).toBe(3);
    expect(result.state.hasActed).toBe(true);
    expect(result.state.movementLeft).toBe(state.movementLeft);
  });

  it('a second meditation in the same turn is already-acted', () => {
    const state = withEmptyPool(newMatch(casterSetup()), 'wizard');
    const meditated = play(state, { type: 'reload', actor: 'wizard' });

    expect(rejectedReason(meditated.state, { type: 'reload', actor: 'wizard' })).toBe(
      'already-acted',
    );
  });

  it('meditation with a full pool is magazine-full', () => {
    expect(rejectedReason(newMatch(casterSetup()), { type: 'reload', actor: 'wizard' })).toBe(
      'magazine-full',
    );
  });

  it('a priest reaches two cells and not three', () => {
    const priest: Partial<Unit> = { range: 2, resourceKind: 'mana', primaryClass: 'priest' };
    const inReach = play(newMatch(casterSetup(priest, { position: { x: 0, y: 2 } })), STRIKE);
    expect(inReach.ok).toBe(true);

    // Out of reach is still out of reach with a full pool: the reach is not the resource's business.
    expect(
      rejectedReason(newMatch(casterSetup(priest, { position: { x: 0, y: 3 } })), STRIKE),
    ).toBe('target-out-of-range');
  });

  it('a spell through a building has no line of sight', () => {
    const state = newMatch(casterSetup({}, { position: { x: 2, y: 0 } }, { '1,0': 5 }));

    expect(rejectedReason(state, STRIKE)).toBe('no-line-of-sight');
  });

  it('comes back to a full pool after a strike, so the meditation of the next round is refused', () => {
    // A basic attack spends one point and the turn hands one back, so a magic class that attacks every
    // round opens every round at its ceiling (ADR 0017). Meditation is what a class needs once one of
    // its actions costs more than a turn gives back, which is the ability of ADR 0016 and not the
    // basic attack; the case below is the rule read where it now lands.
    const struck = play(newMatch(casterSetup()), STRIKE);
    const handedOver = play(struck.state, { type: 'endTurn', actor: 'wizard', round: 1 });
    const back = play(handedOver.state, { type: 'endTurn', actor: 'target', round: 1 });

    expect(unitAt(back.state, 'wizard').ammo).toBe(3);
    expect(rejectedReason(back.state, { type: 'reload', actor: 'wizard' })).toBe('magazine-full');
  });
});

/**
 * Mana comes back on its own, one point at the start of the unit's own turn (ADR 0017). The point is
 * resolved by the `endTurn` that hands the turn over, for the unit that receives it.
 */
describe('mana regeneration', () => {
  it('hands a spent magic pool back one point when its own turn starts', () => {
    const back = backToTheWizard(withEmptyPool(newMatch(casterSetup()), 'wizard'));

    expect(unitAt(back.state, 'wizard').ammo).toBe(1);
    expect(back.events).toEqual([
      { type: 'turn-ended', actor: 'target', next: 'wizard', round: 2 },
      { type: 'regained', actor: 'wizard', resource: 'mana', amount: 1 },
    ]);
  });

  it('gives the point to the unit that comes on turn, never to the one that passed', () => {
    // Two magic pools, both empty: the one that receives the turn takes its point, the one that gave
    // the turn away does not (ADR 0017 §1).
    const setup = casterSetup({}, { magazine: 3, resourceKind: 'mana' });
    const state = withPool(withPool(newMatch(setup), 'wizard', 0), 'target', 0);
    const handedOver = play(state, { type: 'endTurn', actor: 'wizard', round: 1 });

    expect(unitAt(handedOver.state, 'target').ammo).toBe(1);
    expect(unitAt(handedOver.state, 'wizard').ammo).toBe(0);
    expect(handedOver.events).toEqual([
      { type: 'turn-ended', actor: 'wizard', next: 'target', round: 1 },
      { type: 'regained', actor: 'target', resource: 'mana', amount: 1 },
    ]);
  });

  it('stops at the capacity, and emits nothing when there is no room for the point', () => {
    const oneShort = backToTheWizard(withPool(newMatch(casterSetup()), 'wizard', 2));
    expect(unitAt(oneShort.state, 'wizard').ammo).toBe(3);

    const full = backToTheWizard(newMatch(casterSetup()));
    expect(unitAt(full.state, 'wizard').ammo).toBe(3);
    // A pool already at the ceiling has nothing to hand back, so the event is not a per-turn heartbeat.
    expect(full.events.some((event) => event.type === 'regained')).toBe(false);
  });

  it('leaves an ammunition pool alone while the magic pool beside it comes back', () => {
    // A weapon class on A and a magic class on B, both empty: the same hand-over gives the magic
    // class its point and gives the weapon class nothing (ADR 0017 §2). The two halves are read
    // against each other, so neither case can pass on its own.
    const setup = casterSetup({ resourceKind: 'ammo' }, { magazine: 3, resourceKind: 'mana' });
    const state = withPool(withPool(newMatch(setup), 'wizard', 0), 'target', 0);

    const atTarget = play(state, { type: 'endTurn', actor: 'wizard', round: 1 });
    const atWizard = play(atTarget.state, { type: 'endTurn', actor: 'target', round: 1 });

    expect(unitAt(atTarget.state, 'target').ammo).toBe(1);
    expect(unitAt(atWizard.state, 'wizard').ammo).toBe(0);
  });

  it('regenerates nothing for a unit that was defeated before its turn ever came', () => {
    const state = withPool(withPool(newMatch(executionSetup()), 'doomed', 0), 'spare', 0);
    const killed = play(state, { type: 'attack', actor: 'killer', target: 'doomed' });
    expect(unitAt(killed.state, 'doomed').defeated).toBe(true);

    // Two hands-over: killer to spare, spare back to killer. The survivor on B does take its point,
    // and the unit that died is out of the queue, so there is no start of turn for it to take one at
    // (ADR 0017 §7).
    const handedOver = play(killed.state, { type: 'endTurn', actor: 'killer', round: 1 });
    const wrapped = play(handedOver.state, { type: 'endTurn', actor: 'spare', round: 1 });

    expect(unitAt(handedOver.state, 'spare').ammo).toBe(1);
    expect(unitAt(wrapped.state, 'doomed').ammo).toBe(0);
    expect([...handedOver.events, ...wrapped.events]).toContainEqual({
      type: 'regained',
      actor: 'spare',
      resource: 'mana',
      amount: 1,
    });
  });

  it('replays a match of strikes and regeneration to the same state and the same hash', () => {
    const setup = casterSetup({}, { health: 100 });
    const steps: Action[] = [
      STRIKE,
      { type: 'endTurn', actor: 'wizard', round: 1 },
      { type: 'endTurn', actor: 'target', round: 1 },
      // Round 2 opens on the wizard: one of its three points was spent and comes back on its own.
      STRIKE,
      { type: 'endTurn', actor: 'wizard', round: 2 },
      { type: 'endTurn', actor: 'target', round: 2 },
      STRIKE,
      { type: 'endTurn', actor: 'wizard', round: 3 },
      { type: 'endTurn', actor: 'target', round: 3 },
    ];

    const run = () => {
      let state = newMatch(setup);
      const events: Event[] = [];
      for (const step of steps) {
        const result = play(state, step);
        events.push(...result.events);
        state = result.state;
      }
      return { state, events };
    };

    const first = run();
    const second = run();

    // Three strikes, each paid for and each handed back at the start of the next turn, so the pool
    // closes on the same three points it opened with.
    expect(unitAt(first.state, 'wizard').ammo).toBe(3);
    expect(hashState(first.state)).toBe(hashState(second.state));
    // The point is in the `regained` event, so a replay does not have to infer it from the turn order.
    expect(hashState(applyEvents(setup, first.events))).toBe(hashState(first.state));
  });
});
