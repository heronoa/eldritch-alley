import { describe, expect, it } from 'vitest';
import { DIRECTION_BONUS } from './facing';
import { currentUnitId } from './initiative';
import { applyAction, applyEvents, newMatch } from './match';
import type { Action, ActionResult, Board, MatchSetup, MatchState, Unit } from './types';

function makeBoard(): Board {
  return { width: 8, height: 8, levels: new Array<number>(64).fill(0) };
}

function makeUnit(overrides: Partial<Unit> & Pick<Unit, 'id' | 'team' | 'position'>): Unit {
  return {
    speed: 1,
    health: 20,
    attack: 4,
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

/** A sniper (magazine 3, range 3) on A, and one target on B. The sniper is faster, so it acts first. */
function sniperSetup(
  sniper: Partial<Unit> = {},
  target: Partial<Unit> = {},
): MatchSetup {
  return {
    seed: 11,
    map: makeBoard(),
    teams: [
      [
        makeUnit({
          id: 'sniper',
          team: 'A',
          position: { x: 0, y: 0 },
          speed: 10,
          range: 3,
          magazine: 3,
          attack: 4,
          ...sniper,
        }),
      ],
      [makeUnit({ id: 'target', team: 'B', position: { x: 0, y: 2 }, speed: 1, ...target })],
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

function withEmptyMagazine(state: MatchState, id: string): MatchState {
  return { ...state, units: state.units.map((unit) => (unit.id === id ? { ...unit, ammo: 0 } : unit)) };
}

describe('magazine', () => {
  it('starts with a full magazine', () => {
    const state = newMatch(sniperSetup());
    expect(unitAt(state, 'sniper').ammo).toBe(3);
  });

  it('a ranged attack spends one round', () => {
    const state = newMatch(sniperSetup());
    const result = play(state, { type: 'attack', actor: 'sniper', target: 'target' });

    // The sniper stands beside its target rather than in front of it, so the strike carries the bonus
    // of a flank shot on top of the weapon's own (ADR 0014).
    expect(result.events).toEqual([
      expect.objectContaining({
        type: 'attacked',
        hit: true,
        damage: 4 + DIRECTION_BONUS.flank.damage,
        resource: 'ammo',
      }),
    ]);
    expect(unitAt(result.state, 'sniper').ammo).toBe(2);
  });

  it('a missed shot still spends the round', () => {
    const state = newMatch(sniperSetup({ hitChance: 0 }));
    const result = play(state, { type: 'attack', actor: 'sniper', target: 'target' });

    expect(result.events).toEqual([
      expect.objectContaining({ type: 'attacked', hit: false, damage: 0, resource: 'ammo' }),
    ]);
    expect(unitAt(result.state, 'sniper').ammo).toBe(2);
  });

  it('with an empty magazine, the attack is refused: no-ammunition', () => {
    const state = newMatch(sniperSetup({ magazine: 3 }));
    const empty = withEmptyMagazine(state, 'sniper');

    expect(rejectedReason(empty, { type: 'attack', actor: 'sniper', target: 'target' })).toBe(
      'no-ammunition',
    );
  });

  it('an adjacent shot with ammunition deals the full attack, with no halving', () => {
    for (const attack of [5, 4, 1]) {
      const state = newMatch(sniperSetup({ attack, magazine: 3 }, { position: { x: 0, y: 1 } }));
      const result = play(state, { type: 'attack', actor: 'sniper', target: 'target' });

      expect(result.events[0]).toEqual(
        expect.objectContaining({
          type: 'attacked',
          damage: attack + DIRECTION_BONUS.flank.damage,
          resource: 'ammo',
        }),
      );
      expect(unitAt(result.state, 'sniper').ammo).toBe(2);
    }
  });

  it('reload fills the magazine and spends the action, not the movement', () => {
    const state = newMatch(sniperSetup());
    const empty = { ...state, units: state.units.map((unit) => (unit.id === 'sniper' ? { ...unit, ammo: 0 } : unit)) };
    const result = play(empty, { type: 'reload', actor: 'sniper' });

    expect(result.events).toEqual([{ type: 'reloaded', actor: 'sniper', resource: 'ammo' }]);
    expect(unitAt(result.state, 'sniper').ammo).toBe(3);
    expect(result.state.hasActed).toBe(true);
    expect(result.state.movementLeft).toBe(empty.movementLeft);
  });

  it('a unit may move, then reload, in the same turn', () => {
    const state = withEmptyMagazine(newMatch(sniperSetup()), 'sniper');
    const moved = play(state, { type: 'move', actor: 'sniper', to: { x: 1, y: 0 } });
    const reloaded = play(moved.state, { type: 'reload', actor: 'sniper' });
    expect(unitAt(reloaded.state, 'sniper').ammo).toBe(3);
  });

  it('after reloading, the unit cannot move, because the action is spent', () => {
    const state = withEmptyMagazine(newMatch(sniperSetup()), 'sniper');
    const reloaded = play(state, { type: 'reload', actor: 'sniper' });
    expect(rejectedReason(reloaded.state, { type: 'move', actor: 'sniper', to: { x: 1, y: 0 } })).toBe(
      'already-acted',
    );
  });

  it('a full magazine cannot be reloaded', () => {
    const state = newMatch(sniperSetup());
    expect(rejectedReason(state, { type: 'reload', actor: 'sniper' })).toBe('magazine-full');
  });

  it('a unit without a magazine cannot reload', () => {
    const state = newMatch(sniperSetup({ magazine: null }));
    expect(rejectedReason(state, { type: 'reload', actor: 'sniper' })).toBe('no-magazine');
  });

  it('a unit that has already acted cannot reload', () => {
    const state = newMatch(sniperSetup());
    const attacked = play(state, { type: 'attack', actor: 'sniper', target: 'target' });
    const empty = { ...attacked.state, units: attacked.state.units.map((unit) => (unit.id === 'sniper' ? { ...unit, ammo: 0 } : unit)) };
    expect(rejectedReason(empty, { type: 'reload', actor: 'sniper' })).toBe('already-acted');
  });

  it('a unit without a magazine attacks normally and never touches ammo', () => {
    const state = newMatch(
      sniperSetup({ magazine: null, range: 3 }, { position: { x: 0, y: 2 } }),
    );
    const result = play(state, { type: 'attack', actor: 'sniper', target: 'target' });

    expect(result.events[0]).toEqual(expect.objectContaining({ resource: null }));
    expect(unitAt(result.state, 'sniper').ammo).toBe(0);
  });

  it('rebuilds the same full state from the events of a match with reloads', () => {
    const setup = sniperSetup();
    const steps: Action[] = [
      { type: 'attack', actor: 'sniper', target: 'target' },
      // Two units, so the queue never wraps: both turns happen in round 1.
      { type: 'endTurn', actor: 'sniper', round: 1 },
      { type: 'endTurn', actor: 'target', round: 1 },
    ];
    let state = newMatch(setup);
    const events = [];
    for (const step of steps) {
      const result = play(state, step);
      events.push(...result.events);
      state = result.state;
    }
    // Next round: the sniper reloads after the magazine is down.
    expect(currentUnitId(state)).toBe('sniper');
    const reloaded = play(state, { type: 'reload', actor: 'sniper' });
    events.push(...reloaded.events);

    expect(applyEvents(setup, events)).toEqual(reloaded.state);
  });

  it('rejects a negative magazine in the setup', () => {
    expect(() => newMatch(sniperSetup({ magazine: -1 }))).toThrow(RangeError);
  });
});
