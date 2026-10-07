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
 * What a unit may climb in one step, and what a climb costs. The rule the game had before the profile
 * existed — one level up or down, the climb paid with one extra point — is `{ maxStepUp: 1,
 * maxStepDown: 1, climbCost: 1 }`.
 */
export interface MovementProfile {
  /** Levels a single step may rise. */
  maxStepUp: number;
  /** Levels a single step may drop. */
  maxStepDown: number;
  /** Points a step pays on top of its own, for each level it climbs. A descent pays nothing extra. */
  climbCost: number;
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
  /**
   * Which pool a basic attack spends: ammunition or mana. A setup that leaves it out gives the
   * class ammunition, so a unit that carries no magazine at all has no kind (ADR 0011).
   */
  resourceKind?: ResourceKind | null;
  /** Movement budget for one turn. */
  movement: number;
  /**
   * What the unit may climb. A setup that leaves it out walks by the default profile; `newMatch`
   * writes the profile the match plays with onto every unit state.
   */
  movementProfile?: MovementProfile;
  nerve: number;
  attunement: number;
  primaryClass: string;
  equipment: Equipment;
  abilities: Abilities;
}

/**
 * The pool a basic attack spends (ADR 0002, ADR 0011). The mechanism is the one that was carried for
 * ammunition alone: the class data names the kind, and every rule reads `magazine` and `ammo` the
 * same way, so mana needed no second mechanism.
 */
export type ResourceKind = 'ammo' | 'mana';

/**
 * A unit inside a match: setup data plus the state the match writes.
 * `defeated` is true from the death until the end of the match or the revival; while the body lasts
 * (`permanentlyDead` false) it occupies its tile and cannot be targeted.
 */
export interface UnitState extends Unit {
  /** What the unit may climb, filled by `newMatch`, so a unit in a match always carries one. */
  movementProfile: MovementProfile;
  /**
   * Which pool its basic attack spends, or null for a unit that carries none, filled by `newMatch`
   * from the setup. A class with a magazine and no kind is an ammunition class.
   */
  resourceKind: ResourceKind | null;
  /** HP the unit entered the match with. The ceiling for `health`; no M2-a rule raises it. */
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
 * (EA-5, D3). `from` is the cell the run started on, which is where a cancel returns the unit, and
 * `cost` is what the run has spent so far, which is what a cancel gives back.
 */
export interface PendingMove {
  from: Position;
  cost: number;
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
  /**
   * The move the unit on turn has not confirmed yet, or null when it has not moved and once its run
   * has been committed (EA-5, D3). The actor is the unit on turn, so the field carries no unit id,
   * the way `movementLeft` and `hasActed` already do not.
   */
  pendingMove: PendingMove | null;
  rng: Rng;
  eventCount: number;
}

/** The state a client may see: everything except the random source. */
export type PublicState = Omit<MatchState, 'rng'>;

export type Action =
  | { type: 'move'; actor: UnitId; to: Position }
  | { type: 'attack'; actor: UnitId; target: UnitId }
  | { type: 'reload'; actor: UnitId }
  /**
   * Passes the turn. It names the round it applies to, so a message that arrives late — the client
   * sends this one on its own (EA-4) — is refused instead of ending somebody else's turn (ADR 0010).
   */
  | { type: 'endTurn'; actor: UnitId; round: number }
  /**
   * Takes the pending move back: the unit returns to where its run started, with the movement the run
   * spent given back. Refused with `no-pending-move` when no run is open (EA-5, D3 and D5).
   */
  | { type: 'cancelMove'; actor: UnitId }
  /**
   * Confirms the pending move. It executes no action and does not end the turn: it only closes the
   * run, which is what makes the movement final (EA-5, D4).
   */
  | { type: 'commitMove'; actor: UnitId };

export type Event =
  /**
   * The walk the engine found, from the first step to `to`, `to` included. An action names only its
   * destination; the path is the engine's answer, and replaying it must pay what the move paid.
   */
  | { type: 'moved'; actor: UnitId; from: Position; to: Position; path: Position[] }
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
      /**
       * The pool the attack spent one unit of, or null for a unit that carries no pool at all. Every
       * accepted attack spends its resource, whatever the distance (ADR 0011), so a replay spends
       * exactly what the live match spent.
       */
      resource: ResourceKind | null;
    }
  | { type: 'reloaded'; actor: UnitId }
  /**
   * The pending move was taken back. No payload: the run it undoes is in the state it was applied to,
   * the way the walk of a `moved` event is not repeated here.
   */
  | { type: 'move-cancelled'; actor: UnitId }
  /** The pending move was confirmed. The run it closes is in the state it was applied to. */
  | { type: 'move-committed'; actor: UnitId }
  | { type: 'unit-defeated'; target: UnitId }
  | { type: 'corpse-removed'; target: UnitId }
  | { type: 'turn-ended'; actor: UnitId; next: UnitId; round: number };

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
  /** A basic attack whose pool is empty: ammunition for a weapon class, mana for a magic one. */
  | 'no-ammunition'
  | 'no-mana'
  | 'magazine-full'
  | 'game-over'
  | 'stale-turn'
  /** A cancel or a confirmation of a move that is not waiting to be confirmed (EA-5). */
  | 'no-pending-move';

export type ActionResult =
  | { ok: true; state: MatchState; events: Event[] }
  | { ok: false; reason: RejectReason };
