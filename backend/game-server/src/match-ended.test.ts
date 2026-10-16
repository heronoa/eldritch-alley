import { applyAction, applyEvents, hashState, newMatch, type Event } from '@eldritch-alley/engine';
import { describe, expect, it } from 'vitest';
import { createMatchSetup, mapFor } from './map';
import { buildMatchEnded, type FinishedMatch } from './match-ended';
import { PROTOCOL_VERSION } from './protocol';

const SEED = 4_242;
const MATCH_ID = '9f1c0a6e-7d2b-4c8f-9a31-5b6e0d7c2a48';
const USER_ID = '2d9a5c31-8b7e-4f6a-9c0d-1e2f3a4b5c6d';

const STARTED_AT = new Date('2026-10-16T18:00:00.000Z');
const ENDED_AT = new Date('2026-10-16T18:07:30.000Z');

/**
 * A match the room could have finished, without a room: the state the engine builds from the seed, one
 * accepted action's events on top of it, and the bookkeeping the room adds. Everything here is a plain
 * value, so the message can be judged on its own.
 */
function finished(overrides: Partial<FinishedMatch> = {}): FinishedMatch {
  const setup = createMatchSetup(SEED);
  const opened = newMatch(setup);

  // A real action rather than a hand-written event: the engine's events carry fields a replay needs
  // (`turn-ended` names the unit that is next), and inventing one here would test the fixture.
  const actor = opened.units.find((unit) => unit.id === opened.initiative[opened.currentIndex]);
  if (actor === undefined) throw new Error('the match opened with nobody on turn');

  const ended = applyAction(opened, { type: 'endTurn', actor: actor.id, round: opened.round });
  if (!ended.ok) throw new Error(`the opening endTurn was refused: ${ended.reason}`);
  const events: Event[] = ended.events;

  return {
    id: MATCH_ID,
    userId: USER_ID,
    seed: SEED,
    mapId: mapFor(SEED).id,
    humanTeam: 'A',
    winner: 'A',
    state: ended.state,
    startedAt: STARTED_AT,
    endedAt: ENDED_AT,
    events,
    ...overrides,
  };
}

describe('buildMatchEnded', () => {
  it('carries every field a replay needs', () => {
    const message = buildMatchEnded(finished());

    expect(message.id).toBe(MATCH_ID);
    expect(message.userId).toBe(USER_ID);
    expect(message.seed).toBe(SEED);
    expect(message.mapId).toBe(mapFor(SEED).id);
    expect(message.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(message.startedAt).toBe(STARTED_AT.toISOString());
    expect(message.endedAt).toBe(ENDED_AT.toISOString());
  });

  /**
   * The protocol version is copied and not bumped. The join options are additive and optional, so a
   * client that knows nothing about tickets plays a full match as a guest — which is what makes the
   * ticket an offer rather than a requirement.
   */
  it('copies the protocol version the match was played under rather than opening a new one', () => {
    expect(buildMatchEnded(finished()).protocolVersion).toBe(10);
  });

  it('reads the result from the player\'s own side', () => {
    expect(buildMatchEnded(finished({ winner: 'A' })).result).toBe('won');
    expect(buildMatchEnded(finished({ winner: 'B' })).result).toBe('lost');
  });

  /**
   * The player's own side, in team order, with the class of each. The platform resolves `agent_id` by
   * class and not by unit id, because the match server has no idea that an agent exists (decision D9) —
   * this is the one thing both sides already agree on.
   */
  it('names the player\'s units with the class each one plays', () => {
    const state = buildMatchEnded(finished());
    const expected = finished().state.units.filter((unit) => unit.team === 'A');

    expect(state.units).toEqual(
      expected.map((unit) => ({ unitId: unit.id, class: unit.primaryClass })),
    );
    expect(state.units.map((unit) => unit.class)).toEqual(['sniper', 'wizard', 'priest']);
  });

  it('carries the final state hash the engine computes, and the round it ended on', () => {
    const input = finished();
    const message = buildMatchEnded(input);

    expect(message.finalStateHash).toBe(hashState(input.state));
    expect(message.rounds).toBe(input.state.round);
  });

  it('carries the match\'s events in order, and they still rebuild the state that was hashed', () => {
    const input = finished();
    const message = buildMatchEnded(input);

    expect(message.events).toEqual(input.events);
    expect(hashState(applyEvents(createMatchSetup(message.seed), message.events))).toBe(
      message.finalStateHash,
    );
  });

  /**
   * The ticket's claim set is deliberately the smallest thing that names a player, and the message it
   * leads to stays as thin: no address, no name, no squad. The message travels through a queue and lands
   * in a table, and neither is a place for the profile.
   */
  it('carries nothing about the player beyond the id the ticket named', () => {
    const serialized = JSON.stringify(buildMatchEnded(finished()));

    expect(serialized).not.toContain('@');
    expect(Object.keys(JSON.parse(serialized))).toEqual([
      'id', 'userId', 'seed', 'mapId', 'protocolVersion',
      'units', 'winner', 'result', 'rounds', 'startedAt', 'endedAt', 'finalStateHash', 'events',
    ]);
  });
});
