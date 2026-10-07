// Keep in sync with backend/game-server/src/protocol.ts.
//
// The engine's data types are copied here as plain types instead of imported, so the browser bundle
// carries none of the engine package. Only the shapes a client has to read are copied: the engine's
// rng and its rules stay on the server. The one exception is the line of sight, a pure rule the
// preview has to answer exactly as the server does (`game/selection.ts`, EA-1 D1).

/** Identifies a unit inside one match. */
export type UnitId = string;

/** One of the two sides of a match. */
export type Team = 'A' | 'B';

/** A cell of the grid. Height comes from the board, not from the unit. */
export interface Position {
  x: number;
  y: number;
}

/**
 * Which way a unit looks, in the board's own frame: east is +x and north is −y, so `'N'` is towards
 * row 0 (ADR 0014). Mirrors the engine's own type, which the client passes its state back to.
 */
export type Facing = 'N' | 'S' | 'E' | 'W';

/** The 8x8 battlefield: `levels` is row-major, so the level of (x, y) is `levels[y * width + x]`. */
export interface Board {
  width: number;
  height: number;
  levels: readonly number[];
  /**
   * What the map places on the board and the rules read (ADR 0012). Optional here because a setup may
   * leave it out, exactly as the engine's own `Board` does; the board of a state always carries it, and
   * that is what `BoardState` says.
   */
  props?: readonly Prop[];
}

/** The board of a state: the same grid, with the props the map placed always listed. */
export interface BoardState extends Board {
  props: readonly Prop[];
}

/**
 * What a prop does to a shot. A `wall` blocks the line of sight; a `cover` prop is chest-high, so the
 * shot passes over it and the chance to hit pays for it.
 */
export type PropKind = 'wall' | 'cover';

/** One prop of the map, at the cell it stands on. At most one prop per cell. */
export interface Prop {
  position: Position;
  kind: PropKind;
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

/** What a unit may climb in one step, and what a climb costs. Mirrors the engine's profile. */
export interface MovementProfile {
  /** Levels a single step may rise. */
  maxStepUp: number;
  /** Levels a single step may drop. */
  maxStepDown: number;
  /** Points a step pays on top of its own, for each level it climbs. A descent pays nothing extra. */
  climbCost: number;
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
  /** Which pool a basic attack spends, or null for a class that carries none (ADR 0011). */
  resourceKind?: ResourceKind | null;
  /** Movement budget for one turn. */
  movement: number;
  /** What the unit may climb, or absent in a setup that leaves the default rule in place. */
  movementProfile?: MovementProfile;
  nerve: number;
  attunement: number;
  primaryClass: string;
  equipment: Equipment;
  abilities: Abilities;
}

/**
 * The pool a basic attack spends (ADR 0002, ADR 0011): ammunition for a weapon class, mana for a
 * magic one. It is what the pips above a figure count, so the count is the same rule for both.
 */
export type ResourceKind = 'ammo' | 'mana';

/**
 * A unit inside a match. `defeated` is true from the death until the end of the match or the
 * revival; while the body lasts (`permanentlyDead` false) it occupies its tile.
 */
export interface UnitState extends Unit {
  /** What the unit may climb: every unit of a match carries one, so the preview can walk it. */
  movementProfile: MovementProfile;
  /**
   * Which way the unit looks, in the board's own frame: east is +x and north is −y (ADR 0014). The
   * engine carries one on every unit in a match and this mirror has to follow it, because the client
   * hands its own state back to the engine's `findPath`, `attackArea` and `canStillAct`.
   */
  facing: Facing;
  /** Which pool the unit's basic attack spends, or null for a unit that carries none. */
  resourceKind: ResourceKind | null;
  /** HP the unit entered the match with. The ceiling for `health`. */
  maxHealth: number;
  defeated: boolean;
  /** Rounds left in the magazine. Zero for classes without one. */
  ammo: number;
  permanentlyDead: boolean;
  /** The round in which the body is removed and the death becomes permanent. Null while alive. */
  corpseExpiresAtRound: number | null;
}

/**
 * The run of moves the unit on turn has walked since the last action that was not another move
 * (EA-5, D3). `from` is the cell a cancel returns the unit to, and `cost` is what the run spent,
 * which is what a cancel gives back.
 */
export interface PendingMove {
  from: Position;
  cost: number;
}

/** The state a client may see: the whole match except the random source. */
export interface PublicState {
  seed: number;
  board: BoardState;
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
  /**
   * The move the unit on turn has not confirmed yet, or null when it has not moved and once its run
   * has been committed (EA-5, D3). The board shows one area per state: while this is open, the area
   * of the attack from where the unit stands; while it is null, the cells it can walk to.
   */
  pendingMove: PendingMove | null;
  eventCount: number;
}

export type Action =
  | { type: 'move'; actor: UnitId; to: Position }
  | { type: 'attack'; actor: UnitId; target: UnitId }
  | { type: 'reload'; actor: UnitId }
  /** The round it was decided on, so one that arrives late ends nobody's turn (ADR 0010, EA-4). */
  | { type: 'endTurn'; actor: UnitId; round: number }
  | { type: 'cancelMove'; actor: UnitId }
  | { type: 'commitMove'; actor: UnitId };

export type Event =
  /** The walk the engine found, from the first step to `to`, `to` included. */
  | { type: 'moved'; actor: UnitId; from: Position; to: Position; path: Position[] }
  | {
      type: 'attacked';
      actor: UnitId;
      target: UnitId;
      hit: boolean;
      damage: number;
      rngState: number;
      /** The pool the attack spent one unit of, or null for a unit that carries none (ADR 0011). */
      resource: ResourceKind | null;
      /** Whether a `cover` prop stood between the two when the roll was made (ADR 0012). */
      cover: boolean;
    }
  | {
      type: 'reloaded';
      actor: UnitId;
      /** The pool the action refilled, or null for a unit that carries none (ADR 0011). */
      resource: ResourceKind | null;
    }
  /** The pending move was taken back: the unit is where the run started again. */
  | { type: 'move-cancelled'; actor: UnitId }
  /** The pending move was confirmed: the movement is final and the run is closed. */
  | { type: 'move-committed'; actor: UnitId }
  | { type: 'unit-defeated'; target: UnitId }
  | { type: 'corpse-removed'; target: UnitId }
  | { type: 'turn-ended'; actor: UnitId; next: UnitId; round: number }
  /** The point a magic pool handed back as the turn passed to it (ADR 0017). */
  | { type: 'regained'; actor: UnitId; resource: ResourceKind; amount: number };

/** Why an action was refused. A refused action never changes the state and never produces an event. */
export type RejectReason =
  | 'not-your-turn'
  | 'out-of-bounds'
  | 'cell-occupied'
  | 'height-step-too-high'
  | 'no-path'
  | 'already-acted'
  | 'target-out-of-range'
  | 'no-line-of-sight'
  | 'target-invalid'
  | 'no-magazine'
  /** A basic attack whose pool is empty: the ammunition of a weapon class, the mana of a magic one. */
  | 'no-ammunition'
  | 'no-mana'
  | 'magazine-full'
  | 'game-over'
  | 'stale-turn'
  | 'malformed-action'
  /** A cancel or a confirmation of a move that is not waiting to be confirmed (EA-5). */
  | 'no-pending-move';

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
 * and `no-ammunition` and `no-mana` join the refusals (EA-14, ADR 0011). The refill of the pool is
 * one action for both kinds, so `reloaded` carries the pool it refilled as well: the log names the
 * reload of a magazine apart from the meditation of a magic class.
 */
export const PROTOCOL_VERSION = 7;

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
  /** The round it was decided on, so one that arrives late ends nobody's turn (ADR 0010, EA-4). */
  | { type: 'endTurn'; round: number }
  /** The two controls of a pending move, which carry no field: the run lives in the state (EA-5). */
  | { type: 'cancelMove' }
  | { type: 'commitMove' };

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
