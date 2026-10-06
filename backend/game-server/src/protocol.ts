// The message protocol of a match. The browser client is not written yet: when it is, it keeps a
// copy of this file under frontend/src and the two are kept in sync.
import type { Event, Position, PublicState, RejectReason, Team, UnitId } from '@eldritch-alley/engine';
import type { MapId } from './map';

/**
 * Bumped whenever a payload changes shape. The client compares it with its own and refuses to play
 * a match it cannot draw.
 *
 * Version 3: the state message carries `mapId`, because the client draws the terrain of the map it is
 * told the match is on rather than a board it is sent cell by cell.
 * Version 4: a move action names only its destination and the `moved` event carries the `path` the
 * engine walked, which the client needs to animate the walk (ADR 0010).
 */
export const PROTOCOL_VERSION = 4;

/** The single room type of M2-a. One room is one match. */
export const ROOM_NAME = 'battle';

export const MESSAGE = {
  /** Client to server: an action without its actor. The server fills the actor in from the turn. */
  action: 'action',
  /** Server to client: the public state, on join, after every accepted action and on reconnection. */
  state: 'state',
  /** Server to client: the events of the last accepted action, in order. */
  events: 'events',
  /** Server to client: why the action the client sent was refused. Only the sender receives it. */
  rejected: 'rejected',
  /** Server to client: the match is over. */
  ended: 'ended',
} as const;

/**
 * An action as the client may send it: the engine's Action without `actor`, which the server derives
 * from whose turn it is. A client cannot choose the unit it acts with.
 */
export type ClientAction =
  | { type: 'move'; to: Position }
  | { type: 'attack'; target: UnitId }
  | { type: 'reload' }
  | { type: 'endTurn' };

export interface StateMessage {
  version: number;
  /** Which of the three maps the match is on, so the client can draw its terrain. */
  mapId: MapId;
  state: PublicState;
}

export type EventsMessage = Event[];

/** What the server can refuse: every engine reason, and a malformed action the engine never sees. */
export type WireRejectReason = RejectReason | 'malformed-action';

export interface RejectedMessage {
  reason: WireRejectReason;
}

export interface EndedMessage {
  winner: Team;
}
