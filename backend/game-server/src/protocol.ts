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
 * engine walked, which the client needs to animate the walk (ADR 0010). The same decision makes an
 * `endTurn` name its round, which the client sends on its own once the turn has nothing left (EA-4),
 * and adds `stale-turn` to the refusal codes: one version covers both payloads.
 * Version 5: a move stays pending until an action that is not another move commits it, so the state
 * carries `pendingMove`, the client may send `cancelMove` and `commitMove` (EA-5), the events
 * `move-cancelled` and `move-committed` close the run, and `no-pending-move` joins the refusals.
 * Version 6: a basic attack spends its class's pool at every distance, so the state carries the
 * unit's `resourceKind` and the `attacked` event carries `resource` where it carried `ammoSpent`,
 * and `no-ammunition` and `no-mana` join the refusals (EA-14, ADR 0011).
 * Version 10: abilities as data (ADR 0016). The number is the record's, not the next one after 6:
 * versions 8 and 9 belong to the records that landed between this constant and it — facing and height
 * (ADR 0014, ADR 0015) and mana regeneration (ADR 0017) — and none of them reached this constant, so
 * their payloads arrive with this bump. The client sends `useAbility` naming a cell, the state carries
 * the match's `catalog`, the events `ability-used`, `damaged` and `healed` join the batch, and
 * `ability-unknown` joins the refusals.
 */
export const PROTOCOL_VERSION = 10;

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
  /**
   * Uses an ability the unit on turn carries, aimed at a cell rather than at a unit (ADR 0016 §5). The
   * server fills the actor in like it does for every other action, so the client chooses the ability and
   * the cell and never the caster.
   */
  | { type: 'useAbility'; abilityId: string; to: Position }
  | { type: 'reload' }
  /** The round it was decided on, so one that arrives late ends nobody's turn (ADR 0010, EA-4). */
  | { type: 'endTurn'; round: number }
  /** The two controls of a pending move, which carry no field: the run lives in the state (EA-5). */
  | { type: 'cancelMove' }
  | { type: 'commitMove' };

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
