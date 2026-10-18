// The one message a finished match sends to the platform, and the function that builds it. Everything a
// replay needs is here and nothing else is: the message crosses a queue and lands in a table, and the
// player's profile is not what either of them is for.
import { hashState, type Event, type MatchState, type Team, type UnitId } from '@eldritch-alley/engine';
import { type MapId } from './map';
import { PROTOCOL_VERSION } from './protocol';

/** One unit the player took into the match, named by its class rather than by an agent. */
export interface MatchEndedUnit {
  unitId: UnitId;
  class: string;
}

/**
 * A match that ended, from the side of the player who played it.
 *
 * The platform resolves `agent_id` by class and not by unit id, because the match server has never
 * heard of an agent: a squad is the platform's, and the one thing both sides agree on is that a match
 * has a sniper, a wizard and a priest (decision D9).
 */
export interface MatchEndedMessage {
  /** The match id, drawn by the room when it opened. It is the primary key the platform stores under. */
  id: string;
  /** The player the ticket named. A match with no ticket is a guest's and never gets this far. */
  userId: string;
  /** The seed the room drew. The board, the classes and every roll are a function of it. */
  seed: number;
  mapId: MapId;
  /** Copied, never bumped: the join options are additive, so the protocol did not change for this. */
  protocolVersion: number;
  /** The player's own side, in team order. */
  units: MatchEndedUnit[];
  winner: Team;
  /** Read from the player's side, so the platform never has to know which team they were on. */
  result: 'won' | 'lost';
  /** The round the match ended on. */
  rounds: number;
  startedAt: string;
  endedAt: string;
  /**
   * `hashState` of the final state, as the engine computes it. The setup is rebuilt from the code, so a
   * change to the classes, the maps or the ability catalog can change what an old match replays to —
   * and with this stored, that change shows up as a mismatch instead of passing unnoticed (decision D4).
   */
  finalStateHash: number;
  /** The whole match, in order. */
  events: Event[];
}

/** What the room holds when a match finishes, and all `buildMatchEnded` reads. */
export interface FinishedMatch {
  id: string;
  userId: string;
  seed: number;
  mapId: MapId;
  /** Which side the player played. `result` is read against it. */
  humanTeam: Team;
  winner: Team;
  /** The final state, which is where the units, the round and the hash come from. */
  state: MatchState;
  startedAt: Date;
  endedAt: Date;
  events: readonly Event[];
}

export function buildMatchEnded(match: FinishedMatch): MatchEndedMessage {
  return {
    id: match.id,
    userId: match.userId,
    seed: match.seed,
    mapId: match.mapId,
    protocolVersion: PROTOCOL_VERSION,
    units: match.state.units
      .filter((unit) => unit.team === match.humanTeam)
      .map((unit) => ({ unitId: unit.id, class: unit.primaryClass })),
    winner: match.winner,
    result: match.winner === match.humanTeam ? 'won' : 'lost',
    rounds: match.state.round,
    startedAt: match.startedAt.toISOString(),
    endedAt: match.endedAt.toISOString(),
    finalStateHash: hashState(match.state),
    events: [...match.events],
  };
}
