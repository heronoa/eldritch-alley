import {
  abilityById,
  abilityCells,
  applyAction,
  newMatch,
  type Action,
  type Board,
  type MatchSetup,
  type MatchState,
  type Position,
  type UnitState,
} from '@eldritch-alley/engine';
import { describe, expect, it } from 'vitest';
import { ABILITY_CATALOG } from './abilities';
import { botCandidates, chooseBotAction } from './bot';
import { createMatchSetup, MATCH_SEED, rosterFor } from './map';

const NEIGHBOUR_OFFSETS: readonly { x: number; y: number }[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

function unitOnTurn(state: MatchState): UnitState {
  const unit = state.units.find((candidate) => candidate.id === state.initiative[state.currentIndex]);
  if (!unit) throw new Error(`no unit on turn: ${state.initiative[state.currentIndex]}`);
  return unit;
}

function bothTeamsAlive(state: MatchState): boolean {
  return (['A', 'B'] as const).every((team) =>
    state.units.some((unit) => unit.team === team && !unit.defeated),
  );
}

/** Every action the unit on turn could attempt, in a fixed order. Legality is decided by applyAction. */
function candidateActions(state: MatchState): Action[] {
  const actor = unitOnTurn(state);
  const candidates: Action[] = [{ type: 'endTurn', actor: actor.id, round: state.round }];
  for (const offset of NEIGHBOUR_OFFSETS) {
    candidates.push({
      type: 'move',
      actor: actor.id,
      to: { x: actor.position.x + offset.x, y: actor.position.y + offset.y },
    });
  }
  for (const unit of state.units) {
    if (unit.team !== actor.team) candidates.push({ type: 'attack', actor: actor.id, target: unit.id });
  }

  // The class's own ability, aimed at every cell a unit stands on: the walk then exercises the cast as
  // it exercises everything else, and a refusal is filtered out by the same `applyAction` gate.
  for (const abilityId of actor.abilities.activeSets) {
    const ability = abilityId === null ? undefined : abilityById(state.catalog, abilityId);
    if (!ability) continue;
    for (const unit of state.units) {
      candidates.push({ type: 'useAbility', actor: actor.id, abilityId: ability.id, to: unit.position });
    }
  }

  if (actor.magazine !== null) candidates.push({ type: 'reload', actor: actor.id });
  return candidates;
}

/** Plays one accepted action, chosen by `pick`, so a walk through a match is deterministic. */
function step(state: MatchState, pick: number): MatchState | null {
  const accepted = candidateActions(state).filter((candidate) => applyAction(state, candidate).ok);
  if (accepted.length === 0) return null;
  const result = applyAction(state, accepted[pick % accepted.length]);
  return result.ok ? result.state : null;
}

/** Walks deterministic matches and returns states where the unit on turn belongs to team B. */
function collectBotTurnStates(count: number): MatchState[] {
  const states: MatchState[] = [];
  for (let seed = 1; states.length < count && seed <= 200; seed += 1) {
    let state = newMatch(createMatchSetup(seed));
    for (let pick = 0; states.length < count && pick < 300; pick += 1) {
      if (!bothTeamsAlive(state)) break;
      if (unitOnTurn(state).team === 'B') states.push(state);
      const next = step(state, pick);
      if (!next) break;
      state = next;
    }
  }
  return states;
}

/**
 * A state where the bot's sniper, on the level 2 perch with no movement left, has two enemies in
 * range: one it can kill outright and one at full health.
 *
 * The sniper's own ability is taken away here, because this case is about the attack scoring alone:
 * with `piercing-shot` on its slots the bot has a better play against the same target, which is the
 * subject of `chooseBotAction and abilities` further down.
 */
function craftedKillState(): MatchState {
  const base = newMatch(createMatchSetup(MATCH_SEED));
  const units = base.units.map((unit) => ({ ...unit, position: { ...unit.position } }));
  const place = (id: string, x: number, y: number, health?: number): void => {
    const unit = units.find((candidate) => candidate.id === id);
    if (!unit) throw new Error(`unknown unit: ${id}`);
    unit.position = { x, y };
    if (health !== undefined) unit.health = health;
  };

  place('B-sniper', 3, 3);
  place('A-sniper', 3, 1, 2);
  place('A-wizard', 5, 3);
  place('A-priest', 0, 7);
  place('B-wizard', 7, 7);
  place('B-priest', 6, 7);

  const marksman = units.find((candidate) => candidate.id === 'B-sniper');
  if (!marksman) throw new Error('unknown unit: B-sniper');
  marksman.abilities = { ...marksman.abilities, activeSets: [null, null] };

  return {
    ...base,
    units,
    initiative: ['B-sniper', 'A-sniper', 'A-wizard', 'A-priest', 'B-wizard', 'B-priest'],
    currentIndex: 0,
    movementLeft: 0,
    hasActed: false,
  };
}

/**
 * The bot's sniper boxed into a corner with only one distant enemy left alive, its own wizard parked on
 * the one cell that would have brought it closer, nothing wounded, nothing in range, and no ability or
 * empty pool to weigh instead (M4 playtest fix). Both legal moves tie at exactly the distance the sniper
 * already stands at, which used to be where `endTurn`'s own zero score won the tie-break by default.
 */
function craftedCorneredState(): MatchState {
  const setup: MatchSetup = {
    seed: 1,
    map: flatBoard(),
    catalog: ABILITY_CATALOG,
    teams: rosterFor({
      // Sniper, wizard, priest, in the order the roster builds them.
      A: [{ x: 7, y: 7 }, { x: 7, y: 6 }, { x: 6, y: 7 }],
      B: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 7, y: 0 }],
    }),
  };
  const base = newMatch(setup);
  const units = base.units.map((unit) => ({ ...unit, position: { ...unit.position } }));

  const marksman = units.find((candidate) => candidate.id === 'B-sniper');
  if (!marksman) throw new Error('unknown unit: B-sniper');
  // No ability candidate and no reload candidate: only the moves and endTurn are on the table.
  marksman.abilities = { ...marksman.abilities, activeSets: [null, null] };
  marksman.ammo = marksman.magazine ?? 0;

  // Only `A-sniper`, at the far corner, is left standing: the other two never factor into the nearest-
  // enemy distance the move scoring reads.
  for (const id of ['A-wizard', 'A-priest']) {
    const enemy = units.find((candidate) => candidate.id === id);
    if (!enemy) throw new Error(`unknown unit: ${id}`);
    enemy.defeated = true;
  }

  return {
    ...base,
    units,
    initiative: ['B-sniper', 'A-sniper', 'B-wizard', 'A-wizard', 'B-priest', 'A-priest'],
    currentIndex: 0,
    movementLeft: 1,
    hasActed: false,
  };
}

describe('chooseBotAction', () => {
  it('returns an action the engine accepts, for 100 generated states', () => {
    const states = collectBotTurnStates(100);
    expect(states).toHaveLength(100);

    for (const state of states) {
      const action = chooseBotAction(state, 'B');
      const result = applyAction(state, action);
      expect(result.ok, `refused ${action.type}: ${result.ok ? '' : result.reason}`).toBe(true);
    }
  });

  it('is deterministic: the same state gives the same action', () => {
    for (const state of collectBotTurnStates(20)) {
      expect(chooseBotAction(state, 'B')).toEqual(chooseBotAction(state, 'B'));
    }
  });

  it('prefers an attack that kills over one that does not', () => {
    const state = craftedKillState();

    // Both attacks are legal, so only the score can separate them.
    expect(applyAction(state, { type: 'attack', actor: 'B-sniper', target: 'A-sniper' }).ok).toBe(true);
    expect(applyAction(state, { type: 'attack', actor: 'B-sniper', target: 'A-wizard' }).ok).toBe(true);

    expect(chooseBotAction(state, 'B')).toEqual({
      type: 'attack',
      actor: 'B-sniper',
      target: 'A-sniper',
    });
  });

  /**
   * Confirming and taking a move back are the human's two chips, and the bot has neither (EA-5, D7).
   * Its run is closed by the next thing it does instead, which is the implicit commit of `applyEvent`.
   */
  it('never sends cancelMove or commitMove, and closes its own run with the next action it plays', () => {
    const states = collectBotTurnStates(100);
    expect(states).toHaveLength(100);

    for (const state of states) {
      const action = chooseBotAction(state, 'B');
      expect(['cancelMove', 'commitMove']).not.toContain(action.type);

      const result = applyAction(state, action);
      expect(result.ok, `refused ${action.type}`).toBe(true);
      // A move leaves the run open; anything else is what closes it.
      if (result.ok && action.type !== 'move') expect(result.state.pendingMove).toBeNull();
    }
  });

  it('moves instead of ending the turn by default once every move only ties with it (M4 playtest fix)', () => {
    const state = craftedCorneredState();

    // The whole candidate list: two legal moves that neither get closer nor climb, no attack reaches
    // the one enemy left standing, no ability is armed, and the magazine is full.
    expect(applyAction(state, { type: 'move', actor: 'B-sniper', to: { x: 1, y: 0 } }).ok).toBe(true);
    expect(applyAction(state, { type: 'move', actor: 'B-sniper', to: { x: 0, y: 1 } }).ok).toBe(true);
    expect(applyAction(state, { type: 'move', actor: 'B-sniper', to: { x: 1, y: 1 } }).ok).toBe(false);
    expect(applyAction(state, { type: 'attack', actor: 'B-sniper', target: 'A-sniper' }).ok).toBe(false);

    expect(chooseBotAction(state, 'B')).toEqual({
      type: 'move',
      actor: 'B-sniper',
      to: { x: 1, y: 0 },
    });
  });
});

/** A flat board, so nothing but the numbers of the units decides what the bot picks. */
function flatBoard(): Board {
  return { width: 8, height: 8, levels: new Array<number>(64).fill(0) };
}

/**
 * The bot's wizard with the turn, and two units of team A standing side by side inside the reach of its
 * fireball. Both are at full health, so no kill bonus separates the candidates, and the wizard has no
 * movement left and a full magazine, so nothing but the shot and the spell is on the table.
 *
 * The basic attack rolls once for the class's damage; the fireball rolls once per unit and its radius
 * takes in both. The spell is the provisionally better play, which is all m3-03 asks of the bot
 * (ADR 0016: the scoring itself is m3-04's).
 */
function craftedCastState(ammo = 3): MatchState {
  const setup: MatchSetup = {
    seed: 1,
    map: flatBoard(),
    catalog: ABILITY_CATALOG,
    teams: rosterFor({
      // Sniper, wizard, priest, in the order the roster builds them.
      A: [{ x: 3, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 3 }],
      B: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 0, y: 7 }],
    }),
  };
  const base = newMatch(setup);

  return {
    ...base,
    units: base.units.map((unit) => (unit.id === 'B-wizard' ? { ...unit, ammo } : unit)),
    initiative: ['B-wizard', 'A-sniper', 'A-wizard', 'A-priest', 'B-sniper', 'B-priest'],
    currentIndex: 0,
    movementLeft: 0,
    hasActed: false,
  };
}

describe('chooseBotAction and abilities', () => {
  const fireball = ABILITY_CATALOG.find((ability) => ability.id === 'fireball');

  it('casts the area spell when its effect reaches one more enemy than the basic attack does', () => {
    const state = craftedCastState();
    const action = chooseBotAction(state, 'B');

    expect(action.type).toBe('useAbility');
    if (action.type !== 'useAbility' || !fireball) throw new Error('unreachable');
    expect(action.abilityId).toBe('fireball');

    // Which cell the bot aims at is its own business; what the aim has to be is one whose effect covers
    // both enemies, which is the whole reason the spell outscored the shot.
    const cells = abilityCells(state, action.to, fireball);
    for (const id of ['A-sniper', 'A-priest']) {
      const unit = state.units.find((candidate) => candidate.id === id);
      if (!unit) throw new Error(`no unit ${id}`);
      expect(cells, `${id} stands outside the effect`).toContainEqual(unit.position);
    }

    // `applyAction` is the only legality check the bot has (ADR 0016), so the cast it picked passes it.
    expect(applyAction(state, action).ok).toBe(true);
  });

  it('falls back on the basic attack when the pool cannot pay for the spell', () => {
    const state = craftedCastState(1);

    // One point of mana against a cost of two: the cast is refused, so it never becomes a candidate.
    expect(
      applyAction(state, {
        type: 'useAbility',
        actor: 'B-wizard',
        abilityId: 'fireball',
        to: { x: 3, y: 3 },
      }),
    ).toEqual({ ok: false, reason: 'no-mana' });
    expect(chooseBotAction(state, 'B').type).toBe('attack');
  });
});

/**
 * A turn of the bot's own, built on a flat board so nothing but the numbers of the units decides what
 * it picks: the named unit is put on turn, every unit keeps the health the roster gives it unless the
 * case overrides one, and the turn stands still unless the case asks for movement.
 */
function craftedTurn(
  current: string,
  spawns: Readonly<{ A: readonly Position[]; B: readonly Position[] }>,
  options: {
    movementLeft?: number;
    ammo?: Readonly<Record<string, number>>;
    health?: Readonly<Record<string, number>>;
    props?: Board['props'];
    defeated?: readonly string[];
    camouflaged?: readonly string[];
    activeSets?: readonly [string | null, string | null];
  } = {},
): MatchState {
  const setup: MatchSetup = {
    seed: 1,
    map: { ...flatBoard(), props: options.props ?? [] },
    catalog: ABILITY_CATALOG,
    teams: rosterFor({ A: [...spawns.A], B: [...spawns.B] }),
  };
  const base = newMatch(setup);
  const units = base.units.map((unit) => ({
    ...unit,
    position: { ...unit.position },
    abilities: { ...unit.abilities, activeSets: [...unit.abilities.activeSets] },
  }));

  const byId = (id: string): UnitState => {
    const found = units.find((unit) => unit.id === id);
    if (!found) throw new Error(`unknown unit: ${id}`);
    return found;
  };

  for (const id of options.defeated ?? []) {
    const fallen = byId(id);
    fallen.defeated = true;
    fallen.health = 0;
    // The body is still on the board this round, which is the window a revive has to work in.
    fallen.corpseExpiresAtRound = base.round + 1;
  }
  for (const id of options.camouflaged ?? []) byId(id).camouflage = { turns: 3, breakChance: 30 };
  for (const [id, ammo] of Object.entries(options.ammo ?? {})) byId(id).ammo = ammo;
  for (const [id, health] of Object.entries(options.health ?? {})) byId(id).health = health;
  if (options.activeSets) {
    const actor = byId(current);
    actor.abilities = { ...actor.abilities, activeSets: [...options.activeSets] };
  }

  const absent = new Set([...(options.defeated ?? []), current]);
  return {
    ...base,
    units,
    initiative: [current, ...base.initiative.filter((id) => !absent.has(id))],
    currentIndex: 0,
    movementLeft: options.movementLeft ?? 0,
    hasActed: false,
  };
}

/** The Chebyshev distance between two cells, which is how the engine measures reach. */
function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

describe('chooseBotAction and the secondary abilities', () => {
  // Both squads are far apart, so no attack competes with the cast the case is about.
  const spawns = {
    A: [{ x: 7, y: 7 }, { x: 7, y: 6 }, { x: 6, y: 7 }],
    B: [{ x: 7, y: 0 }, { x: 7, y: 1 }, { x: 0, y: 0 }],
  };

  it('revives a fallen ally on a free cell instead of passing', () => {
    const state = craftedTurn('B-priest', spawns, { defeated: ['B-sniper'] });

    const revives = botCandidates(state, 'B').filter(
      (candidate) =>
        candidate.action.type === 'useAbility' && candidate.action.abilityId === 'resurrection',
    );
    expect(revives).toHaveLength(1);

    const action = chooseBotAction(state, 'B');
    expect(action).toMatchObject({
      type: 'useAbility',
      actor: 'B-priest',
      abilityId: 'resurrection',
      target: 'B-sniper',
    });
    if (action.type !== 'useAbility') throw new Error('unreachable');

    // The body holds its own tile until the revive consumes it, so the destination is another cell.
    expect(
      state.units.some(
        (unit) => unit.position.x === action.to.x && unit.position.y === action.to.y,
      ),
    ).toBe(false);
    expect(applyAction(state, action).ok).toBe(true);
  });

  it('offers no revive when no ally has fallen', () => {
    const state = craftedTurn('B-priest', spawns);

    expect(
      botCandidates(state, 'B').some(
        (candidate) =>
          candidate.action.type === 'useAbility' && candidate.action.abilityId === 'resurrection',
      ),
    ).toBe(false);
  });

  it('casts mud on an area that covers a camouflaged enemy, which its basic attack cannot name', () => {
    const state = craftedTurn(
      'B-wizard',
      {
        A: [{ x: 6, y: 4 }, { x: 7, y: 7 }, { x: 7, y: 6 }],
        // Sniper, wizard, priest: the wizard is the one on turn, three cells from the hidden enemy.
        B: [{ x: 0, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 1 }],
      },
      { camouflaged: ['A-sniper'], activeSets: [null, 'mud'] },
    );
    const hidden = state.units.find((unit) => unit.id === 'A-sniper');
    if (!hidden) throw new Error('no A-sniper');

    expect(
      applyAction(state, { type: 'attack', actor: 'B-wizard', target: 'A-sniper' }),
    ).toEqual({ ok: false, reason: 'target-hidden' });

    const casts = botCandidates(state, 'B').filter(
      (candidate) => candidate.action.type === 'useAbility' && candidate.action.abilityId === 'mud',
    );
    expect(casts.length).toBeGreaterThan(0);
    expect(
      casts.some((candidate) =>
        (candidate.abilityCells ?? []).some(
          (cell) => cell.x === hidden.position.x && cell.y === hidden.position.y,
        ),
      ),
    ).toBe(true);

    expect(chooseBotAction(state, 'B')).toMatchObject({ type: 'useAbility', abilityId: 'mud' });
  });

  it('does not offer terrain that covers only allies, nor any other candidate worth nothing', () => {
    const state = craftedTurn(
      'B-wizard',
      {
        A: [{ x: 7, y: 7 }, { x: 7, y: 6 }, { x: 6, y: 7 }],
        // The wizard in the corner with both allies beside it: every cell it can reach is friendly.
        B: [{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }],
      },
      { activeSets: [null, 'mud'] },
    );

    expect(
      botCandidates(state, 'B').some(
        (candidate) => candidate.action.type === 'useAbility' && candidate.action.abilityId === 'mud',
      ),
    ).toBe(false);
    expect(chooseBotAction(state, 'B')).toEqual({
      type: 'endTurn',
      actor: 'B-wizard',
      round: state.round,
    });
  });

  it('hides a wounded sniper from a nearby enemy, and leaves a safe one in the open', () => {
    const field = {
      A: [{ x: 3, y: 5 }, { x: 7, y: 7 }, { x: 7, y: 6 }],
      B: [{ x: 3, y: 3 }, { x: 0, y: 0 }, { x: 0, y: 1 }],
    };
    // A wall across the line of the shot: the enemy is close, and out of the sniper's reach.
    const props: Board['props'] = [{ position: { x: 3, y: 4 }, kind: 'wall' }];

    const wounded = craftedTurn('B-sniper', field, {
      props,
      health: { 'B-sniper': 5 },
      // The case is about hiding, so the class carries nothing that could shoot over the wall instead.
      activeSets: [null, 'camouflage'],
    });
    expect(
      applyAction(wounded, { type: 'attack', actor: 'B-sniper', target: 'A-sniper' }),
    ).toEqual({ ok: false, reason: 'no-line-of-sight' });

    expect(chooseBotAction(wounded, 'B')).toMatchObject({
      type: 'useAbility',
      actor: 'B-sniper',
      abilityId: 'camouflage',
      to: { x: 3, y: 3 },
    });

    // The same board, the same enemy, an unhurt sniper: there is nothing to hide from, and a cast
    // that scores nothing is not on the table (the same rule that drops an empty mud or revive).
    const safe = craftedTurn('B-sniper', field, { props, activeSets: [null, 'camouflage'] });
    expect(
      botCandidates(safe, 'B').some(
        (candidate) =>
          candidate.action.type === 'useAbility' && candidate.action.abilityId === 'camouflage',
      ),
    ).toBe(false);
    expect(chooseBotAction(safe, 'B').type).toBe('endTurn');
  });

  it('chases the enemy it can see, not the one hiding beside it', () => {
    const state = craftedTurn(
      'B-sniper',
      {
        A: [{ x: 2, y: 3 }, { x: 3, y: 7 }, { x: 0, y: 7 }],
        B: [{ x: 3, y: 3 }, { x: 7, y: 0 }, { x: 7, y: 1 }],
      },
      { movementLeft: 1, activeSets: [null, null], camouflaged: ['A-sniper'] },
    );
    const actor = state.units.find((unit) => unit.id === 'B-sniper');
    const visible = state.units.find((unit) => unit.id === 'A-wizard');
    if (!actor || !visible) throw new Error('no sniper');

    const action = chooseBotAction(state, 'B');
    expect(action.type).toBe('move');
    if (action.type !== 'move') throw new Error('unreachable');

    // The walk answers the enemy that can be shot, not the neighbour no basic attack can name.
    expect(distance(action.to, visible.position)).toBeLessThan(
      distance(actor.position, visible.position),
    );
  });

  it('aims an area spell at the cell of a camouflaged enemy as readily as at a visible one', () => {
    const state = craftedTurn(
      'B-wizard',
      {
        A: [{ x: 3, y: 5 }, { x: 3, y: 6 }, { x: 0, y: 7 }],
        B: [{ x: 7, y: 0 }, { x: 3, y: 3 }, { x: 7, y: 1 }],
      },
      { camouflaged: ['A-sniper'] },
    );
    const hidden = state.units.find((unit) => unit.id === 'A-sniper');
    if (!hidden) throw new Error('no A-sniper');

    const spells = botCandidates(state, 'B').filter(
      (candidate) =>
        candidate.action.type === 'useAbility' && candidate.action.abilityId === 'fireball',
    );
    expect(
      spells.some((candidate) =>
        (candidate.abilityCells ?? []).some(
          (cell) => cell.x === hidden.position.x && cell.y === hidden.position.y,
        ),
      ),
    ).toBe(true);
  });

  it('aims a heal at the wounded ally, not at the empty ground between them', () => {
    const state = craftedTurn(
      'B-priest',
      {
        A: [{ x: 7, y: 7 }, { x: 7, y: 6 }, { x: 6, y: 7 }],
        B: [{ x: 3, y: 5 }, { x: 0, y: 7 }, { x: 3, y: 3 }],
      },
      { health: { 'B-sniper': 5 } },
    );
    const wounded = state.units.find((unit) => unit.id === 'B-sniper');
    if (!wounded) throw new Error('no B-sniper');

    const heals = botCandidates(state, 'B').filter(
      (candidate) =>
        candidate.action.type === 'useAbility' && candidate.action.abilityId === 'area-heal',
    );
    expect(
      heals.some(
        (candidate) =>
          candidate.action.type === 'useAbility' &&
          candidate.action.to.x === wounded.position.x &&
          candidate.action.to.y === wounded.position.y,
      ),
    ).toBe(true);

    expect(chooseBotAction(state, 'B')).toMatchObject({
      type: 'useAbility',
      abilityId: 'area-heal',
    });
  });
});
