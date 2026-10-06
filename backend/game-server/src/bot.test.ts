import { applyAction, newMatch, type Action, type MatchState, type UnitState } from '@eldritch-alley/engine';
import { describe, expect, it } from 'vitest';
import { chooseBotAction } from './bot';
import { createMatchSetup, MATCH_SEED } from './map';

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
