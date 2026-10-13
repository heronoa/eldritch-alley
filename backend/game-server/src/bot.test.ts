import {
  abilityById,
  abilityCells,
  applyAction,
  newMatch,
  type Action,
  type Board,
  type MatchSetup,
  type MatchState,
  type UnitState,
} from '@eldritch-alley/engine';
import { describe, expect, it } from 'vitest';
import { ABILITY_CATALOG } from './abilities';
import { chooseBotAction } from './bot';
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
