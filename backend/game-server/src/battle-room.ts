// One match per room. The room owns the engine's MatchState, applies the human's actions through the
// engine's public contract, answers each accepted action with its events and the new public state,
// and then plays the bot's turns. A client never names the acting unit: the room derives it from
// whose turn it is.
import { randomInt, randomUUID } from 'node:crypto';
import { Room, type Client } from '@colyseus/core';
import {
  applyAction,
  newMatch,
  publicState,
  type Action,
  type Event,
  type MatchState,
  type RejectReason,
  type Team,
  type UnitState,
} from '@eldritch-alley/engine';
import { isClientAction } from './action-shape';
import { chooseBotAction } from './bot';
import { createMatchSetup, mapFor, type MapId } from './map';
import { buildMatchEnded } from './match-ended';
import {
  MESSAGE,
  PROTOCOL_VERSION,
  type ClientAction,
  type EndedMessage,
  type RejectedMessage,
  type StateMessage,
  type WireRejectReason,
} from './protocol';
import type { MatchEndedPublisher } from './queue';
import { verifyTicket } from './ticket';

/** The first client plays team A; the room plays team B. */
const HUMAN_TEAM: Team = 'A';
const BOT_TEAM: Team = 'B';

/** How long a client that dropped has to come back before its team forfeits the match. */
export const RECONNECTION_WINDOW_SECONDS = 120;

/** A bot turn is a few moves, one action and an endTurn per unit. This only stops a runaway loop. */
const BOT_ITERATION_GUARD = 50;

/** The seed range the engine takes, `0 <= seed <= UINT32_MAX`. */
const SEED_RANGE = 2 ** 32;

/**
 * The seed of a new match, drawn by the room: the map is a pure function of it, so this is where a
 * match's board is chosen. It is not engine randomness (ADR 0005) — the engine still only ever replays
 * the seed it is handed, and the seed travels in the public state, so a match stays reproducible.
 */
function randomSeed(): number {
  return randomInt(0, SEED_RANGE);
}

/** A unit is in the fight until it is defeated. A body still holds its tile but no longer fights. */
export function teamHasLivingUnit(state: MatchState, team: Team): boolean {
  return state.units.some((unit) => unit.team === team && !unit.defeated);
}

export type HumanActionOutcome =
  | { ok: true; state: MatchState; events: Event[] }
  | { ok: false; reason: WireRejectReason };

/** The unit whose turn it is, or undefined in a match that is over. */
function unitOnTurn(state: MatchState): UnitState | undefined {
  const currentId = state.initiative[state.currentIndex];
  return state.units.find((unit) => unit.id === currentId);
}

/**
 * Applies a client action on behalf of `humanTeam`. The actor is never taken from the client: it is
 * the unit whose turn it is, and the action is refused when that unit belongs to the other side.
 */
export function resolveHumanAction(
  state: MatchState,
  humanTeam: Team,
  action: ClientAction,
): HumanActionOutcome {
  // A payload the protocol does not define never reaches the engine, which would throw on it.
  if (!isClientAction(action)) return { ok: false, reason: 'malformed-action' };

  const current = unitOnTurn(state);
  if (!current || current.team !== humanTeam) return { ok: false, reason: 'not-your-turn' };

  const asEngineAction: Action = { ...action, actor: current.id };
  const result = applyAction(state, asEngineAction);
  return result.ok ? { ok: true, state: result.state, events: result.events } : result;
}

/** How many matches a process opens at once, unless `main.ts` hands a different one in. */
export const DEFAULT_MAX_CONCURRENT_MATCHES = 30;

/**
 * Matches open on this process right now. Module-level, not per instance: a room counts itself in
 * only once its own `onCreate` has fully succeeded, and counts itself out in `onDispose` — never the
 * other way round, so a room that fails to even construct never holds a slot open forever.
 */
let activeMatches = 0;

interface BattleRoomOptions {
  /** Set by `main.ts` via `gameServer.define`'s default options, which always win over a client's own. */
  maxConcurrentMatches?: number;
  /** Where a finished match is handed over. Absent in a room nothing wired to a queue. */
  publisher?: MatchEndedPublisher;
  /** The platform's public key, PEM. Absent means no ticket can be checked, so every join is a guest's. */
  publicKey?: string;
  /**
   * The match to play, drawn by the room when it is not given one. Production never gives one — the
   * board is a pure function of the seed, so this is how a test asks for a match it can predict.
   */
  seed?: number;
}

/** What `onAuth` decides, and what Colyseus then carries as `client.auth` for the whole session. */
interface JoinAuth {
  /** The player the ticket named, or null for a guest. Only a player's match is ever handed over. */
  userId: string | null;
}

export class BattleRoom extends Room {
  /** Set once a side has no unit left. A finished room refuses every further action. */
  ended = false;
  winner: Team | null = null;
  /** Drawn when the room opens. It is the key the platform stores the match under, so it never changes. */
  matchId!: string;

  private match!: MatchState;
  /** Which map the match was built on: the client is told, because it draws the terrain of the id. */
  private mapId!: MapId;
  private humanSessionId: string | null = null;

  /** How a finished match leaves this process, and the key it is checked with. Both from `onCreate`. */
  private publisher: MatchEndedPublisher | undefined;
  private publicKey: string | undefined;

  /** Whose match this is: null until a client joins, and null for the whole match of a guest's. */
  private userId: string | null = null;
  private startedAt!: Date;
  /** Every accepted action's events, in order. A replay is this list and the seed, and nothing else. */
  private events: Event[] = [];

  onCreate(options: BattleRoomOptions = {}): void {
    const limit = options.maxConcurrentMatches ?? DEFAULT_MAX_CONCURRENT_MATCHES;
    if (activeMatches >= limit) {
      throw new Error(`the server already has ${limit} matches open`);
    }

    // One human per room. Without this, Colyseus's default (Infinity) never locks the room, so
    // `joinOrCreate` keeps routing every new player worldwide into whichever room already exists
    // instead of starting a fresh one, and the second player gets refused as if it were a stale tab.
    this.maxClients = 1;

    // Read here and not in `onAuth`, which matters more than it looks: `onCreate` is handed the join
    // options merged with `define`'s defaults, and `onAuth` is handed only what the client sent. So a
    // client can offer a ticket and cannot offer a key to check one against.
    this.publisher = options.publisher;
    this.publicKey = options.publicKey;

    const setup = createMatchSetup(options.seed ?? randomSeed());
    this.match = newMatch(setup);
    this.mapId = mapFor(setup.seed).id;
    this.matchId = randomUUID();
    this.startedAt = new Date();

    this.onMessage<ClientAction>(MESSAGE.action, (client, action) => this.handleAction(client, action));

    activeMatches += 1;
  }

  /**
   * Turns the ticket in the join options into a player, or refuses the join.
   *
   * A guest is the default and not a fallback: no ticket is a complete answer, and the match plays out
   * exactly as it did before this existed. A ticket that is offered is a claim, and a claim that does
   * not check out closes the join — after which the client is free to come back without one, which is
   * what keeps signing in an offer rather than a gate.
   *
   * Refusing is spelled `null`: Colyseus throws on a falsy answer here, and that is the intent.
   */
  async onAuth(_client: Client, options: { ticket?: unknown } = {}): Promise<JoinAuth | null> {
    const offered = options?.ticket;
    // Absence is the one spelling of "I have no ticket". An empty one is a claim like any other and is
    // refused like any other, so that a client which mangles the field finds out instead of having a
    // signed-in player quietly play as a guest and go unrecorded.
    if (offered === undefined) return { userId: null };
    if (typeof offered !== 'string' || offered === '') return null;

    if (this.publicKey === undefined) {
      // No key, no way to tell the platform's ticket from one a player wrote. Turning the offer down is
      // the only answer that does not hand somebody else's history to whoever asks for it.
      console.error(
        'battle-room: a ticket was offered but GAME_TICKET_PUBLIC_KEY is not set, so no ticket can be checked',
      );
      return null;
    }

    const claims = await verifyTicket(offered, this.publicKey);
    return claims === null ? null : { userId: claims.userId };
  }

  onDispose(): void {
    activeMatches -= 1;
  }

  onJoin(client: Client, _options: unknown, auth?: JoinAuth): void {
    if (this.humanSessionId !== null && this.humanSessionId !== client.sessionId) {
      throw new Error('room full');
    }
    this.humanSessionId = client.sessionId;
    // `onAuth` has already run for this client, so the match has an owner from the first state onwards.
    this.userId = auth?.userId ?? null;
    client.send(MESSAGE.state, this.stateMessage());
  }

  onDrop(client: Client): void {
    if (this.ended || client.sessionId !== this.humanSessionId) return;
    // Rejecting this deferred is the timeout; onLeave is where the forfeit happens.
    this.allowReconnection(client, RECONNECTION_WINDOW_SECONDS).catch(() => undefined);
  }

  onReconnect(client: Client): void {
    client.send(MESSAGE.state, this.stateMessage());
  }

  onLeave(client: Client): void {
    // Reacting only to the human's departure covers both a refused reconnection and a consent.
    if (client.sessionId !== this.humanSessionId) return;
    this.finish(BOT_TEAM);
  }

  private handleAction(client: Client, action: ClientAction): void {
    if (client.sessionId !== this.humanSessionId) {
      this.refuse(client, 'not-your-turn');
      return;
    }
    if (this.ended) {
      this.refuse(client, 'game-over');
      return;
    }

    const outcome = resolveHumanAction(this.match, HUMAN_TEAM, action);
    if (!outcome.ok) {
      this.refuse(client, outcome.reason);
      return;
    }

    this.publish(outcome.state, outcome.events);
    if (!this.ended) this.playBotTurns();
  }

  /** The bot keeps playing while the turn belongs to its team and the match is undecided. */
  private playBotTurns(): void {
    for (let iterations = 0; iterations < BOT_ITERATION_GUARD; iterations += 1) {
      if (this.ended) return;

      const current = unitOnTurn(this.match);
      if (!current || current.team !== BOT_TEAM) return;

      const result = applyAction(this.match, chooseBotAction(this.match, BOT_TEAM));
      if (!result.ok) {
        // The bot must always offer a legal action, so a refusal is a bug on its side: the bot forfeits.
        console.error(`battle-room: the bot action was refused (${result.reason})`);
        this.finish(HUMAN_TEAM);
        return;
      }

      this.publish(result.state, result.events);
    }

    console.error(`battle-room: the bot did not hand the turn over within ${BOT_ITERATION_GUARD} iterations`);
    this.finish(HUMAN_TEAM);
  }

  private publish(state: MatchState, events: Event[]): void {
    this.match = state;
    // Accumulated from the first accepted action, not gathered at the end: the events are what a replay
    // is made of, and a match that is lost from the queue must be a history entry missing rather than
    // one that is wrong. Both sides' actions go in — the bot's are replays too.
    this.events.push(...events);
    this.broadcast(MESSAGE.events, events);
    this.broadcast(MESSAGE.state, this.stateMessage());
    this.finishIfDecided();
  }

  private finishIfDecided(): void {
    if (this.ended) return;

    const humansAlive = teamHasLivingUnit(this.match, HUMAN_TEAM);
    const botsAlive = teamHasLivingUnit(this.match, BOT_TEAM);
    if (humansAlive && botsAlive) return;

    this.finish(humansAlive ? HUMAN_TEAM : BOT_TEAM);
  }

  private finish(winner: Team): void {
    if (this.ended) return;
    this.ended = true;
    this.winner = winner;

    // Handed over before the room tells anyone, for two reasons. The later calls to `broadcast` can fail
    // on a transport that is already gone, and the record of a match that is definitively over should
    // not depend on that; and it makes "the room has ended" mean "the match is already accounted for",
    // which is the only way a test can assert that a guest's match hands nothing over.
    this.handOver();

    const message: EndedMessage = { winner };
    this.broadcast(MESSAGE.ended, message);
  }

  /**
   * The one message this room ever sends to the platform, and the only thing here that leaves the
   * process. A guest's match has no player to attach it to, so it ends without one.
   *
   * Nothing waits for it. A queue that is away must not fail a match that is over, hold up a room that
   * is being disposed, or reach the player as an error: the failure is logged with the match id, which
   * is where an operator can find it, and the room is done either way.
   */
  private handOver(): void {
    const publisher = this.publisher;
    if (this.userId === null || publisher === undefined) return;

    const message = buildMatchEnded({
      id: this.matchId,
      userId: this.userId,
      seed: this.match.seed,
      mapId: this.mapId,
      humanTeam: HUMAN_TEAM,
      winner: this.winner ?? BOT_TEAM,
      state: this.match,
      startedAt: this.startedAt,
      endedAt: new Date(),
      events: this.events,
    });

    // Started inside a `then` so that an adapter which throws before it returns a promise is caught by
    // the same handler as one that rejects. The invariant is the point: nothing here can fail a match
    // that is already over.
    Promise.resolve()
      .then(() => publisher.publish(message))
      .catch((error: unknown) => {
        console.error(`battle-room: match ${this.matchId} was not handed over`, error);
      });
  }

  private refuse(client: Client, reason: WireRejectReason): void {
    const message: RejectedMessage = { reason };
    client.send(MESSAGE.rejected, message);
  }

  private stateMessage(): StateMessage {
    return { version: PROTOCOL_VERSION, mapId: this.mapId, state: publicState(this.match) };
  }
}
