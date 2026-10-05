// Keep in sync with backend/game-server/src/protocol.ts.
//
// The engine's data types are copied here as plain types instead of imported, so the browser bundle
// carries no dependency on the engine package. Only the shapes a client has to read are copied: the
// engine's rng and its rules stay on the server.

/** Identifies a unit inside one match. */
export type UnitId = string;

/** One of the two sides of a match. */
export type Team = 'A' | 'B';

/** A cell of the grid. Height comes from the board, not from the unit. */
export interface Position {
  x: number;
  y: number;
}

/** The 8x8 battlefield: `levels` is row-major, so the level of (x, y) is `levels[y * width + x]`. */
export interface Board {
  width: number;
  height: number;
  levels: readonly number[];
}

/** The six equipment slots. An empty slot is null. */
export interface Equipment {
  armor: string | null;
  helmet: string | null;
  mainHand: string | null;
  offHand: string | null;
  accessory1: string | null;
  accessory2: string | null;
}

/** The ability slots. `activeSets` always holds two entries; an empty slot is null. */
export interface Abilities {
  activeSets: [string | null, string | null];
  reaction: string | null;
  movement: string | null;
  support: string | null;
}

/** A unit as the setup describes it. */
export interface Unit {
  id: UnitId;
  team: Team;
  position: Position;
  speed: number;
  health: number;
  /** Fixed damage per hit. */
  attack: number;
  /** Integer percentage, 0..100. */
  hitChance: number;
  /** Reach in Chebyshev distance. */
  range: number;
  /** Rounds in the magazine, or null for classes that use no ammunition. */
  magazine: number | null;
  /** Movement budget for one turn. */
  movement: number;
  nerve: number;
  attunement: number;
  primaryClass: string;
  equipment: Equipment;
  abilities: Abilities;
}

/**
 * A unit inside a match. `defeated` is true from the death until the end of the match or the
 * revival; while the body lasts (`permanentlyDead` false) it occupies its tile.
 */
export interface UnitState extends Unit {
  /** HP the unit entered the match with. The ceiling for `health`. */
  maxHealth: number;
  defeated: boolean;
  /** Rounds left in the magazine. Zero for classes without one. */
  ammo: number;
  permanentlyDead: boolean;
  /** The round in which the body is removed and the death becomes permanent. Null while alive. */
  corpseExpiresAtRound: number | null;
}

/** The state a client may see: the whole match except the random source. */
export interface PublicState {
  seed: number;
  board: Board;
  units: UnitState[];
  /** Ids of the units still in play, in turn order. */
  initiative: UnitId[];
  currentIndex: number;
  /** Movement left for the current unit on this turn. */
  movementLeft: number;
  /** Starts at 1; rises by one each time the turn order wraps back to the first unit. */
  round: number;
  /** Whether the current unit has spent its action on this turn. */
  hasActed: boolean;
  eventCount: number;
}

export type Action =
  | { type: 'move'; actor: UnitId; to: Position }
  | { type: 'attack'; actor: UnitId; target: UnitId }
  | { type: 'reload'; actor: UnitId }
  | { type: 'endTurn'; actor: UnitId };

export type Event =
  | { type: 'moved'; actor: UnitId; from: Position; to: Position }
  | {
      type: 'attacked';
      actor: UnitId;
      target: UnitId;
      hit: boolean;
      damage: number;
      rngState: number;
      /** True when the attack used a round from the magazine. */
      ammoSpent: boolean;
    }
  | { type: 'reloaded'; actor: UnitId }
  | { type: 'unit-defeated'; target: UnitId }
  | { type: 'corpse-removed'; target: UnitId }
  | { type: 'turn-ended'; actor: UnitId; next: UnitId; round: number };

/** Why an action was refused. A refused action never changes the state and never produces an event. */
export type RejectReason =
  | 'not-your-turn'
  | 'out-of-bounds'
  | 'cell-occupied'
  | 'height-step-too-high'
  | 'not-enough-movement'
  | 'already-acted'
  | 'target-out-of-range'
  | 'target-invalid'
  | 'no-magazine'
  | 'magazine-full'
  | 'not-adjacent'
  | 'game-over'
  | 'malformed-action';

/**
 * Bumped whenever a payload changes shape. The client compares it with its own and refuses to play
 * a match it cannot draw.
 *
 * Version 3: the state message carries `mapId`, because the client draws the terrain of the map it is
 * told the match is on rather than a board it is sent cell by cell.
 */
export const PROTOCOL_VERSION = 3;

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
  /** Which of the three maps the match is on: `PrototypeMapId` in `./maps/prototype-maps`. */
  mapId: 'street' | 'park' | 'roof';
  state: PublicState;
}

export type EventsMessage = Event[];

export interface RejectedMessage {
  reason: RejectReason;
}

export interface EndedMessage {
  winner: Team;
}
