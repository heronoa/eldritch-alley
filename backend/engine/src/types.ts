// Plain data of the battle engine. No behaviour lives here, so the whole match state stays
// serializable, hashable and replayable.

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

/** The six equipment slots. An empty slot is null. Nothing reads these in M1. */
export interface Equipment {
  armor: string | null;
  helmet: string | null;
  mainHand: string | null;
  offHand: string | null;
  accessory1: string | null;
  accessory2: string | null;
}

/** The ability slots. `activeSets` always holds two entries; an empty slot is null. Nothing reads these in M1. */
export interface Abilities {
  activeSets: [string | null, string | null];
  reaction: string | null;
  movement: string | null;
  support: string | null;
}

/**
 * A unit as the setup describes it. The progression fields (nerve, attunement, class, equipment,
 * abilities) are carried from M1 on so the type does not have to be redesigned later, but no M1 rule
 * reads them.
 */
export interface Unit {
  id: UnitId;
  team: Team;
  position: Position;
  speed: number;
  health: number;
  /** Fixed damage per hit, in M1. */
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
 * A unit inside a match: setup data plus the state the match writes.
 * `defeated` is true from the death until the end of the match or the revival; while the body lasts
 * (`permanentlyDead` false) it occupies its tile and cannot be targeted.
 */
export interface UnitState extends Unit {
  /** HP the unit entered the match with. The ceiling for `health`; no M2-a rule raises it. */
  maxHealth: number;
  defeated: boolean;
  /** Rounds left in the magazine. Zero for classes without one. */
  ammo: number;
  permanentlyDead: boolean;
  /** The round in which the body is removed and the death becomes permanent. Null while alive. */
  corpseExpiresAtRound: number | null;
}

/** The seed, the map and the two squads. Both positions and unit ids must be unique inside a match. */
export interface MatchSetup {
  seed: number;
  map: Board;
  teams: [readonly Unit[], readonly Unit[]];
}

/** The mulberry32 state. Plain data, so it can be copied along with the rest of the match state. */
export interface Rng {
  state: number;
}

/** The whole match. `units` keeps setup order, because that order breaks speed ties. */
export interface MatchState {
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
  rng: Rng;
  eventCount: number;
}

/** The state a client may see: everything except the random source. */
export type PublicState = Omit<MatchState, 'rng'>;

export type Action =
  | { type: 'move'; actor: UnitId; to: Position }
  | { type: 'attack'; actor: UnitId; target: UnitId }
  | { type: 'reload'; actor: UnitId }
  | { type: 'endTurn'; actor: UnitId };

export type Event =
  | { type: 'moved'; actor: UnitId; from: Position; to: Position }
  /**
   * `rngState` is the random source after the hit roll. Replay applies it instead of rolling again, so
   * a rebuilt match draws the same numbers as the live one, even when a roll takes several draws.
   */
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
  | 'game-over';

export type ActionResult =
  | { ok: true; state: MatchState; events: Event[] }
  | { ok: false; reason: RejectReason };
