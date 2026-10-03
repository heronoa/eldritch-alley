// One match per room. The room owns the engine's MatchState, applies the human's actions through the
// engine's public contract, answers each accepted action with its events and the new public state,
// and then plays the bot's turns. A client never names the acting unit: the room derives it from
// whose turn it is.
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
import { chooseBotAction } from './bot';
import { createMatchSetup } from './map';
import {
  MESSAGE,
  PROTOCOL_VERSION,
  type ClientAction,
  type EndedMessage,
  type RejectedMessage,
  type StateMessage,
} from './protocol';

/** The first client plays team A; the room plays team B. */
const HUMAN_TEAM: Team = 'A';
const BOT_TEAM: Team = 'B';

/** How long a client that dropped has to come back before its team forfeits the match. */
export const RECONNECTION_WINDOW_SECONDS = 120;

/** A bot turn is a few moves, one action and an endTurn per unit. This only stops a runaway loop. */
const BOT_ITERATION_GUARD = 50;

/** A unit is in the fight until it is defeated. A body still holds its tile but no longer fights. */
export function teamHasLivingUnit(state: MatchState, team: Team): boolean {
  return state.units.some((unit) => unit.team === team && !unit.defeated);
}

export type HumanActionOutcome =
  | { ok: true; state: MatchState; events: Event[] }
  | { ok: false; reason: RejectReason };

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
  const current = unitOnTurn(state);
  if (!current || current.team !== humanTeam) return { ok: false, reason: 'not-your-turn' };

  const asEngineAction: Action = { ...action, actor: current.id };
  const result = applyAction(state, asEngineAction);
  return result.ok ? { ok: true, state: result.state, events: result.events } : result;
}

export class BattleRoom extends Room {
  /** Set once a side has no unit left. A finished room refuses every further action. */
  ended = false;
  winner: Team | null = null;

  private match!: MatchState;
  private humanSessionId: string | null = null;

  onCreate(): void {
    this.match = newMatch(createMatchSetup());
    this.onMessage<ClientAction>(MESSAGE.action, (client, action) => this.handleAction(client, action));
  }

  onJoin(client: Client): void {
    if (this.humanSessionId !== null && this.humanSessionId !== client.sessionId) {
      throw new Error('room full');
    }
    this.humanSessionId = client.sessionId;
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

    const message: EndedMessage = { winner };
    this.broadcast(MESSAGE.ended, message);
  }

  private refuse(client: Client, reason: RejectReason): void {
    const message: RejectedMessage = { reason };
    client.send(MESSAGE.rejected, message);
  }

  private stateMessage(): StateMessage {
    return { version: PROTOCOL_VERSION, state: publicState(this.match) };
  }
}
