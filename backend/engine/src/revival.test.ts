// Resurrection (ADR 0023 § 7): one action names the fallen ally in `target` and the free cell it
// returns on in `to`. The range is read to the destination, the body may be anywhere, and the same
// unit comes back at full health with the pool it had at death.
import { describe, expect, it } from 'vitest';
import { canStillAct, isGameOver } from './actions';
import { applyEvent } from './events';
import { currentUnitId } from './initiative';
import { applyAction, applyEvents, hashState, newMatch } from './match';
import type {
  AbilityDefinition,
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

const RESURRECTION: AbilityDefinition = {
  id: 'resurrection',
  cost: 3,
  range: 3,
  needsSight: false,
  effect: { kind: 'revive', radius: 0 },
};

/** A revive that only reaches the cell the caster stands on, for the no-free-cell case. */
const POINT_REVIVE: AbilityDefinition = {
  id: 'resurrection',
  cost: 3,
  range: 0,
  needsSight: false,
  effect: { kind: 'revive', radius: 0 },
};

function slot(abilityId: string): Unit['abilities'] {
  return { activeSets: [abilityId, null], reaction: null, movement: null, support: null };
}

function setupOf(units: readonly Unit[], catalog: readonly AbilityDefinition[] = [RESURRECTION], seed = 1): MatchSetup {
  const team = (id: Team) => units.filter((unit) => unit.team === id);
  return { seed, map: makeBoard(), catalog, teams: [team('A'), team('B')] };
}

/** The Priest at (0,0), a fallen ally at (4,4) and an enemy at (7,7): the standard field. */
function field(seed = 1): MatchSetup {
  return setupOf([
    makeUnit({
      id: 'priest',
      team: 'A',
      position: { x: 0, y: 0 },
      speed: 10,
      magazine: 10,
      resourceKind: 'mana',
      primaryClass: 'priest',
      abilities: slot('resurrection'),
    }),
    makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 20, magazine: 10 }),
    makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
  ], [RESURRECTION], seed);
}

function play(state: MatchState, action: Parameters<typeof applyAction>[1]): ActionResult & { ok: true } {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`expected the action to be accepted, got ${result.reason}`);
  return result;
}

function zero(result: ActionResult): string {
  if (result.ok) throw new Error('expected the action to be refused');
  return result.reason;
}

function unitAt(state: MatchState, id: string) {
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`no unit ${id}`);
  return unit;
}

/**
 * Kills the fallen ally through the engine's own event and leaves the body with the health and the
 * pool it had when it fell. The body occupies (4,4), so no action can be aimed there.
 */
function fallen(setup: MatchSetup = field(), drop: readonly string[] = ['fallen']): MatchState {
  let state = newMatch(setup);
  for (const id of drop) state = applyEvent(state, { type: 'unit-defeated', target: id });
  return {
    ...state,
    units: state.units.map((unit) =>
      drop.includes(unit.id) ? { ...unit, health: 0, ammo: 5 } : unit,
    ),
  };
}

function revive(to: Position, target: string | undefined = 'fallen') {
  return target === undefined
    ? { type: 'useAbility' as const, actor: 'priest', abilityId: 'resurrection', to }
    : { type: 'useAbility' as const, actor: 'priest', abilityId: 'resurrection', to, target };
}

function pass(state: MatchState): MatchState {
  return play(state, { type: 'endTurn', actor: currentUnitId(state), round: state.round }).state;
}

describe('resurrection: the legal revive', () => {
  it('pays three mana, spends the action and brings the ally back on the free cell', () => {
    const state = fallen();
    const result = play(state, revive({ x: 2, y: 1 }));
    const brought = unitAt(result.state, 'fallen');

    expect(result.events.map((event) => event.type)).toEqual(['ability-used', 'revived']);
    expect(result.events[0]).toEqual({
      type: 'ability-used',
      actor: 'priest',
      abilityId: 'resurrection',
      to: { x: 2, y: 1 },
      target: 'fallen',
      rngState: state.rng.state,
      resource: 'mana',
    });
    expect(result.events[1]).toEqual({
      type: 'revived',
      target: 'fallen',
      to: { x: 2, y: 1 },
    });

    expect(unitAt(result.state, 'priest').ammo).toBe(7);
    expect(result.state.hasActed).toBe(true);
    expect(brought.defeated).toBe(false);
    expect(brought.permanentlyDead).toBe(false);
    expect(brought.corpseExpiresAtRound).toBeNull();
    expect(brought.health).toBe(brought.maxHealth);
    // The pool is what the unit had when it fell (9A), not a fresh magazine.
    expect(brought.ammo).toBe(5);
    expect(brought.position).toEqual({ x: 2, y: 1 });
    // The body is consumed because the same unit is alive again: nothing is left on the old cell.
    expect(result.state.units.some((unit) => unit.position.x === 4 && unit.position.y === 4)).toBe(false);
    expect(result.events.some((event) => event.type === 'corpse-removed')).toBe(false);
  });

  it('clears the statuses the body was carrying', () => {
    const dead = fallen();
    const marked: MatchState = {
      ...dead,
      units: dead.units.map((unit) =>
        unit.id === 'fallen'
          ? { ...unit, prone: true, camouflage: { turns: 2, breakChance: 30 } }
          : unit,
      ),
    };

    const brought = unitAt(play(marked, revive({ x: 2, y: 1 })).state, 'fallen');

    expect(brought.prone).toBe(false);
    expect(brought.camouflage).toBeNull();
  });

  it('replays to the same final state and hash', () => {
    const setup = field();
    // The fall itself is an event, so the replay starts from the same body the live run did.
    const fall: Event[] = [{ type: 'unit-defeated', target: 'fallen' }];
    let state = applyEvents(setup, fall);
    const events: Event[] = [...fall];

    const run = (action: Parameters<typeof applyAction>[1]) => {
      const result = play(state, action);
      state = result.state;
      events.push(...result.events);
    };

    run(revive({ x: 2, y: 1 }));
    run({ type: 'endTurn', actor: 'priest', round: state.round }); // priest -> enemy
    run({ type: 'endTurn', actor: 'enemy', round: state.round }); // enemy -> the revived ally
    run({ type: 'move', actor: 'fallen', to: { x: 3, y: 1 } });

    const rebuilt = applyEvents(setup, events);
    expect(rebuilt).toEqual(state);
    expect(hashState(rebuilt)).toBe(hashState(state));
  });
});

describe('resurrection: the initiative', () => {
  it('puts the unit before the current slot and makes it wait for the next round', () => {
    // Speed 30 > the revived 20 > the Priest 10 > the enemy 1.
    const setup = setupOf([
      makeUnit({ id: 'fast', team: 'A', position: { x: 5, y: 5 }, speed: 30 }),
      makeUnit({
        id: 'priest',
        team: 'A',
        position: { x: 0, y: 0 },
        speed: 10,
        magazine: 10,
        resourceKind: 'mana',
        abilities: slot('resurrection'),
      }),
      makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 20, magazine: 10 }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
    ]);

    let state = fallen(setup);
    state = pass(state); // the fast ally, so the Priest is on turn
    expect(currentUnitId(state)).toBe('priest');

    const revived = play(state, revive({ x: 2, y: 1 })).state;

    expect(revived.initiative).toEqual(['fast', 'fallen', 'priest', 'enemy']);
    // The revived slot lies before the Priest's, so the pointer moved with it and the Priest stays on
    // turn; the revived unit's turn for this round has passed.
    expect(currentUnitId(revived)).toBe('priest');

    let round = revived;
    round = pass(round); // priest -> enemy
    round = pass(round); // enemy -> fast, round 2
    round = pass(round); // fast -> the revived ally
    expect(round.round).toBe(2);
    expect(currentUnitId(round)).toBe('fallen');
  });

  it('puts the unit after the current slot and lets it act in the current round', () => {
    // The enemy 40 comes first, then the Priest 10; the revived ally at speed 5 lands last.
    const setup = setupOf([
      makeUnit({
        id: 'priest',
        team: 'A',
        position: { x: 0, y: 0 },
        speed: 10,
        magazine: 10,
        resourceKind: 'mana',
        abilities: slot('resurrection'),
      }),
      makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 5, magazine: 10 }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 40 }),
    ]);

    let state = fallen(setup);
    state = pass(state); // the enemy, so the Priest is on turn
    expect(currentUnitId(state)).toBe('priest');

    const revived = play(state, revive({ x: 2, y: 1 })).state;

    expect(revived.initiative).toEqual(['enemy', 'priest', 'fallen']);
    expect(currentUnitId(revived)).toBe('priest');

    const next = play(revived, { type: 'endTurn', actor: 'priest', round: revived.round }).state;
    expect(next.round).toBe(1);
    expect(currentUnitId(next)).toBe('fallen');
  });

  it('breaks a speed tie on the setup order', () => {
    // The Priest is authored first, so it comes before a revived ally of the same speed.
    const setup = setupOf([
      makeUnit({
        id: 'priest',
        team: 'A',
        position: { x: 0, y: 0 },
        speed: 10,
        magazine: 10,
        resourceKind: 'mana',
        abilities: slot('resurrection'),
      }),
      makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 10, magazine: 10 }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
    ]);

    let state = fallen(setup);
    expect(currentUnitId(state)).toBe('priest');

    state = play(state, revive({ x: 2, y: 1 })).state;

    expect(state.initiative).toEqual(['priest', 'fallen', 'enemy']);
    expect(currentUnitId(state)).toBe('priest');
  });
});

describe('resurrection: the refusals', () => {
  const legalTo = { x: 2, y: 1 };

  function refused(state: MatchState, action: Parameters<typeof applyAction>[1]): string {
    const before = hashState(state);
    const result = applyAction(state, action);
    const reason = zero(result);
    expect(hashState(state)).toBe(before);
    return reason;
  }

  it('refuses an action that names no fallen ally', () => {
    expect(
      refused(fallen(), {
        type: 'useAbility',
        actor: 'priest',
        abilityId: 'resurrection',
        to: legalTo,
      }),
    ).toBe('target-invalid');
  });

  it('refuses an enemy target', () => {
    expect(refused(fallen(), revive(legalTo, 'enemy'))).toBe('target-invalid');
  });

  it('refuses a living target', () => {
    expect(refused(fallen(), revive(legalTo, 'priest'))).toBe('target-invalid');
  });

  it('refuses a body that has already been removed', () => {
    const dead = fallen();
    const gone: MatchState = {
      ...dead,
      units: dead.units.map((unit) =>
        unit.id === 'fallen' ? { ...unit, permanentlyDead: true } : unit,
      ),
    };
    expect(refused(gone, revive(legalTo))).toBe('target-invalid');
  });

  it('refuses a destination outside the board', () => {
    expect(refused(fallen(), revive({ x: 8, y: 0 }))).toBe('out-of-bounds');
  });

  it('refuses a destination beyond the definition reach', () => {
    expect(refused(fallen(), revive({ x: 4, y: 0 }))).toBe('target-out-of-range');
  });

  it('refuses a destination a living unit holds', () => {
    const setup = setupOf([
      makeUnit({
        id: 'priest',
        team: 'A',
        position: { x: 0, y: 0 },
        speed: 10,
        magazine: 10,
        resourceKind: 'mana',
        abilities: slot('resurrection'),
      }),
      makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 20, magazine: 10 }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 1, y: 0 }, speed: 1 }),
    ]);
    expect(refused(fallen(setup), revive({ x: 1, y: 0 }))).toBe('cell-occupied');
  });

  it('refuses a destination another body holds', () => {
    const setup = setupOf([
      makeUnit({
        id: 'priest',
        team: 'A',
        position: { x: 0, y: 0 },
        speed: 10,
        magazine: 10,
        resourceKind: 'mana',
        abilities: slot('resurrection'),
      }),
      makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 20, magazine: 10 }),
      makeUnit({ id: 'body', team: 'A', position: { x: 2, y: 0 }, speed: 5, magazine: 10 }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
    ]);
    expect(refused(fallen(setup, ['fallen', 'body']), revive({ x: 2, y: 0 }))).toBe('cell-occupied');
  });

  it('refuses a use the empty pool cannot pay for', () => {
    const dead = fallen();
    const empty: MatchState = {
      ...dead,
      units: dead.units.map((unit) => (unit.id === 'priest' ? { ...unit, ammo: 0 } : unit)),
    };
    expect(refused(empty, revive(legalTo))).toBe('no-mana');
  });

  it('refuses a second action in the same turn', () => {
    const dead = fallen();
    const spent: MatchState = { ...dead, hasActed: true };
    expect(refused(spent, revive(legalTo))).toBe('already-acted');
  });
});

describe('resurrection: the last one standing', () => {
  it('works while the Priest is the only living ally, and the match ends when the Priest falls', () => {
    const setup = setupOf([
      makeUnit({
        id: 'priest',
        team: 'A',
        position: { x: 0, y: 0 },
        speed: 10,
        magazine: 10,
        resourceKind: 'mana',
        abilities: slot('resurrection'),
      }),
      makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 20, magazine: 10 }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
    ]);

    const dead = fallen(setup);
    expect(isGameOver(dead)).toBe(false);
    const revived = play(dead, revive({ x: 2, y: 1 })).state;
    expect(unitAt(revived, 'fallen').defeated).toBe(false);

    // The ally stays a body, so the Priest is the only living unit of its team.
    const alone = dead;
    const ended = applyEvent(alone, { type: 'unit-defeated', target: 'priest' });

    expect(isGameOver(ended)).toBe(true);
    expect(zero(applyAction(ended, revive({ x: 2, y: 1 })))).toBe('game-over');
    expect(
      zero(applyAction(ended, { type: 'endTurn', actor: 'enemy', round: ended.round })),
    ).toBe('game-over');
  });
});

describe('resurrection: canStillAct', () => {
  it('is true when the only legal action in front of the Priest is a revive', () => {
    const setup = setupOf(
      [
        makeUnit({
          id: 'priest',
          team: 'A',
          position: { x: 0, y: 0 },
          speed: 10,
          movement: 0,
          range: 0,
          magazine: 10,
          resourceKind: 'mana',
          abilities: slot('resurrection'),
        }),
        makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 20, magazine: 10 }),
        makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
      ],
    );

    const state = fallen(setup);
    expect(currentUnitId(state)).toBe('priest');
    expect(canStillAct(state)).toBe(true);
  });

  it('is false when no body is on the map', () => {
    const setup = setupOf([
      makeUnit({
        id: 'priest',
        team: 'A',
        position: { x: 0, y: 0 },
        speed: 10,
        movement: 0,
        range: 0,
        magazine: 10,
        resourceKind: 'mana',
        abilities: slot('resurrection'),
      }),
      makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
    ]);

    const state = newMatch(setup);
    expect(currentUnitId(state)).toBe('priest');
    expect(canStillAct(state)).toBe(false);
  });

  it('is false when every cell in reach is occupied', () => {
    // A reach of zero leaves only the Priest's own cell, which the Priest holds.
    const setup = setupOf(
      [
        makeUnit({
          id: 'priest',
          team: 'A',
          position: { x: 0, y: 0 },
          speed: 10,
          movement: 0,
          range: 0,
          magazine: 10,
          resourceKind: 'mana',
          abilities: slot('resurrection'),
        }),
        makeUnit({ id: 'fallen', team: 'A', position: { x: 4, y: 4 }, speed: 20, magazine: 10 }),
        makeUnit({ id: 'enemy', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
      ],
      [POINT_REVIVE],
    );

    // The movement left is the fallen unit's, so the case reads only the revive rule.
    const state: MatchState = { ...fallen(setup), movementLeft: 0 };
    expect(canStillAct(state)).toBe(false);
  });
});
