import { describe, expect, it } from 'vitest';
import { currentUnitId } from './initiative';
import { applyAction, applyEvents, newMatch } from './match';
import type { Action, ActionResult, Board, Event, MatchSetup, MatchState, Unit } from './types';

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

/**
 * Initiative: a1 (10), b1 (5), b2 (3), a2 (1). b1 has one health and sits at (0,1), next to a2 at (1,1).
 * Killing b1 leaves its body at (0,1). The match keeps going while b2 and a1 and a2 are alive.
 */
function bodySetup(nerve: number, bTeamExtra = true): MatchSetup {
  const bTeam = [makeUnit({ id: 'b1', team: 'B', position: { x: 0, y: 1 }, speed: 5, health: 1, nerve })];
  if (bTeamExtra) {
    bTeam.push(makeUnit({ id: 'b2', team: 'B', position: { x: 7, y: 7 }, speed: 3 }));
  }
  return {
    seed: 5,
    map: makeBoard(),
    teams: [
      [
        makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 10, attack: 5 }),
        makeUnit({ id: 'a2', team: 'A', position: { x: 1, y: 1 }, speed: 1 }),
      ],
      bTeam,
    ],
  };
}

function play(state: MatchState, action: Action): { state: MatchState; events: Event[] } {
  const result: ActionResult = applyAction(state, action);
  if (!result.ok) throw new Error(`expected the action to be accepted, got ${result.reason}`);
  return { state: result.state, events: result.events };
}

function endTurn(state: MatchState): { state: MatchState; events: Event[] } {
  return play(state, { type: 'endTurn', actor: currentUnitId(state) });
}

function unitAt(state: MatchState, id: string) {
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`no unit ${id}`);
  return unit;
}

function killB1(nerve: number, bTeamExtra = true) {
  return play(newMatch(bodySetup(nerve, bTeamExtra)), { type: 'attack', actor: 'a1', target: 'b1' });
}

/** Ends turns until the match reaches `round`, collecting every event on the way. */
function runUntilRound(start: MatchState, round: number): { state: MatchState; events: Event[] } {
  let state = start;
  const events: Event[] = [];
  for (let guard = 0; state.round < round; guard++) {
    if (guard > 50) throw new Error(`round counter never reached ${round}`);
    const next = endTurn(state);
    state = next.state;
    events.push(...next.events);
  }
  return { state, events };
}

describe('round counter', () => {
  it('starts at 1 and rises by one each time the queue wraps to the first unit', () => {
    const start = newMatch(bodySetup(0));
    expect(start.round).toBe(1);

    // Initiative is a1, b1, b2, a2. The order wraps after the fourth turn ends, not the third.
    const third = endTurn(endTurn(endTurn(start).state).state);
    expect(third.state.round).toBe(1);
    const fourth = endTurn(third.state);
    expect(fourth.state.round).toBe(2);
  });

  it('records the new round on the turn-ended event', () => {
    const start = newMatch(bodySetup(0));
    const ended = endTurn(start);
    expect(ended.events).toEqual([expect.objectContaining({ type: 'turn-ended', round: 1 })]);
  });
});

describe('corpse occupancy', () => {
  it('a body occupies its tile, so moving onto it is cell-occupied', () => {
    const killed = killB1(0);
    expect(killed.events.map((event) => event.type)).toEqual(['attacked', 'unit-defeated']);

    // a1 ends, b2 ends; now a2 is current, next to the body at (0,1).
    const atA2 = endTurn(endTurn(killed.state).state).state;
    expect(currentUnitId(atA2)).toBe('a2');

    const result = applyAction(atA2, { type: 'move', actor: 'a2', to: { x: 0, y: 1 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('cell-occupied');
  });

  it('a body cannot be targeted', () => {
    const killed = killB1(0);
    const atA2 = endTurn(endTurn(killed.state).state).state;

    const result = applyAction(atA2, { type: 'attack', actor: 'a2', target: 'b1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('target-invalid');
  });

  it('a defeated unit is a body, not a permanent death, until its rounds run out', () => {
    const killed = killB1(0);
    const body = unitAt(killed.state, 'b1');
    expect(body.defeated).toBe(true);
    expect(body.permanentlyDead).toBe(false);
    expect(body.corpseExpiresAtRound).toBe(4);
  });
});

describe('corpse expiry', () => {
  const durations = [
    { nerve: 0, rounds: 3 },
    { nerve: 50, rounds: 4 },
    { nerve: 100, rounds: 5 },
  ];

  for (const { nerve, rounds } of durations) {
    it(`removes the body at the start of round ${1 + rounds} for Nerve ${nerve}, and only then`, () => {
      const killed = killB1(nerve);
      const expiry = 1 + rounds;
      const { state, events } = runUntilRound(killed.state, expiry);

      const removals = events.filter((event) => event.type === 'corpse-removed');
      expect(removals).toEqual([{ type: 'corpse-removed', target: 'b1' }]);
      expect(events[events.length - 1]).toEqual({ type: 'corpse-removed', target: 'b1' });
      expect(unitAt(state, 'b1').permanentlyDead).toBe(true);
      expect(state.round).toBe(expiry);
    });
  }

  it('keeps the body on its tile until the expiry round', () => {
    const killed = killB1(0);
    const before = runUntilRound(killed.state, 3);
    expect(before.events.some((event) => event.type === 'corpse-removed')).toBe(false);
    expect(unitAt(before.state, 'b1').permanentlyDead).toBe(false);

    // Round 3 is still running: a1 is current and the body is still on (0,1), so a1 cannot step there.
    const blocked = applyAction(before.state, { type: 'move', actor: 'a1', to: { x: 0, y: 1 } });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('cell-occupied');
  });

  it('frees the tile once the body is removed', () => {
    const killed = killB1(0);
    const { state } = runUntilRound(killed.state, 4);

    const moved = applyAction(state, { type: 'move', actor: 'a1', to: { x: 0, y: 1 } });
    expect(moved.ok).toBe(true);
  });
});

describe('match ends before the body expires', () => {
  it('records no permanent death and emits no corpse-removed', () => {
    // b1 is the only unit on B, so killing it ends the match.
    const killed = killB1(0, false);
    const body = unitAt(killed.state, 'b1');
    expect(body.defeated).toBe(true);
    expect(body.permanentlyDead).toBe(false);

    const next = applyAction(killed.state, { type: 'endTurn', actor: 'a1' });
    expect(next.ok).toBe(false);
    if (!next.ok) expect(next.reason).toBe('game-over');
  });
});

describe('replay with bodies', () => {
  it('rebuilds the same full state as the live match, through the body and its removal', () => {
    const setup = bodySetup(0);
    const killed = killB1(0);
    const { state, events } = runUntilRound(killed.state, 4);
    expect(state.round).toBe(4);
    expect(events.some((event) => event.type === 'corpse-removed')).toBe(true);

    const rebuilt = applyEvents(setup, [...killed.events, ...events]);
    expect(rebuilt).toEqual(state);
  });
});
