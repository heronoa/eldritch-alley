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

/**
 * Which way a unit looks, in the board's own frame: east is +x and north is −y, so `'N'` is towards
 * row 0 (ADR 0014). Every unit inside a match carries one; it changes as the unit walks, as it shoots
 * and when the player turns it.
 */
export type Facing = 'N' | 'S' | 'E' | 'W';

/**
 * Where an attacker stood around its target, read against the target's own facing (ADR 0014): ahead
 * of it, beside it, or behind it. The attacker's facing is never part of the answer.
 */
export type Direction = 'front' | 'flank' | 'rear';

/** The 8x8 battlefield: `levels` is row-major, so the level of (x, y) is `levels[y * width + x]`. */
export interface Board {
  width: number;
  height: number;
  levels: readonly number[];
  /**
   * What the map places on the board and the rules read (ADR 0012). A setup that leaves it out plays
   * on bare ground; `newMatch` writes the list the match plays with onto the board state.
   */
  props?: readonly Prop[];
}

/**
 * What a prop does to a shot. A `wall` stands above the eye line and blocks it; a `cover` prop is
 * chest-high, so the shot passes over it and the shooter's chance to hit is what it costs.
 */
export type PropKind = 'wall' | 'cover';

/** One prop of the map, at the cell it stands on. At most one prop per cell. */
export interface Prop {
  position: Position;
  kind: PropKind;
}

/**
 * The board inside a match, the way `UnitState` is the unit inside a match: a setup may leave `props`
 * out, a board that has been handed to `newMatch` always carries one.
 */
export interface BoardState extends Board {
  props: readonly Prop[];
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

/** The ability slots. `activeSets` always holds two entries; an empty slot is null. */
export interface Abilities {
  activeSets: [string | null, string | null];
  reaction: string | null;
  movement: string | null;
  support: string | null;
}

/**
 * What an ability does to the units standing on the cells it covers (ADR 0016 §2). Two kinds and no
 * more: a damage effect that rolls through the shot rules, and a heal that never rolls. A third kind is
 * a new record, not a new branch, so every place that reads one switches on the union and the compiler
 * names the places a new kind has to be taught to.
 */
export type AbilityEffect =
  /**
   * Every living unit on a cell of the effect takes `amount`. `radius` is a Chebyshev distance around
   * the target cell, so 0 is the single cell. `ignoresCover` lifts the accuracy the cover of a target
   * costs the roll (ADR 0012), and never touches the amount.
   */
  | { kind: 'damage'; amount: number; radius: number; ignoresCover: boolean }
  /** Every living unit on a cell of the effect gains `amount` health, capped at its `maxHealth`. */
  | { kind: 'heal'; amount: number; radius: number };

/**
 * One ability, as plain data (ADR 0016 §1). The engine never learns a class or an ability name: the id
 * is an opaque string the unit's own slots are read for, and everything else is a number.
 */
export interface AbilityDefinition {
  id: string;
  /** Points of the caster's own pool the use spends (ADR 0002, ADR 0011). */
  cost: number;
  /** Reach in Chebyshev distance, read from the caster to the target cell. */
  range: number;
  /** Whether the target cell has to be in sight. A definition that needs none reaches through a wall. */
  needsSight: boolean;
  effect: AbilityEffect;
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
  /**
   * Which way the unit looks. `newMatch` opens it towards the unit's own side of the map, and a walk,
   * a shot and the `face` action move it from there (ADR 0014).
   */
  facing: Facing;
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
  /**
   * The abilities the match resolves, or nothing at all (ADR 0016 §3). It is optional the way
   * `Board.props` is: a setup that leaves it out plays a match with no ability to use, which is still a
   * legal match. A match that has been handed to `newMatch` always carries the list.
   */
  catalog?: readonly AbilityDefinition[];
}

/** The mulberry32 state. Plain data, so it can be copied along with the rest of the match state. */
export interface Rng {
  state: number;
}

/** The whole match. `units` keeps setup order, because that order breaks speed ties. */
export interface MatchState {
  seed: number;
  board: BoardState;
  units: UnitState[];
  /**
   * The definitions every use is resolved from (ADR 0016 §3). Always present, the way `board.props` is,
   * so no rule has to ask whether the match carries abilities. A setup that left it out leaves this
   * empty, and no ability can be used.
   */
  catalog: readonly AbilityDefinition[];
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
  /**
   * Uses an ability the actor carries, aimed at a cell rather than at a unit (ADR 0016 §5). A unit is
   * affected because it stands on a cell of the effect, which is what makes an area expressible with the
   * same action as a single-target one.
   */
  | { type: 'useAbility'; actor: UnitId; abilityId: string; to: Position }
  | { type: 'reload'; actor: UnitId }
  /**
   * Turns the unit on the cell it stands on. It spends no movement and no action and does not end the
   * turn, so a unit that has spent everything can still turn before it passes (ADR 0014).
   */
  | { type: 'face'; actor: UnitId; facing: Facing }
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
      /**
       * Whether a `cover` prop stood between the two when the roll was made (ADR 0012). The shot costs
       * the same either way; what changes is the chance, and this is what the screen explains.
       */
      cover: boolean;
      /**
       * Where the attacker stood around the target, read against the target's facing (ADR 0014). The
       * chance and the damage were both read from it, so the screen names it and a replay keeps it.
       */
      direction: Direction;
      /**
       * The levels the attacker stood above the target, which is the difference the reach and the roll
       * were read from (ADR 0015): positive from above, negative from below, zero on the same level.
       */
      stood: number;
    }
  /**
   * The unit was turned by the player. A walk and a shot turn the unit too, but they carry the answer
   * in their own event; this is the turn that would otherwise leave no trace (ADR 0014).
   */
  | { type: 'faced'; actor: UnitId; facing: Facing }
  /**
   * The use of an ability, which is the first event of the resolution and the one that pays for it
   * (ADR 0016 §8.1): it spends the cost of the definition, sets `hasActed` and carries the cell that was
   * aimed at. `rngState` is the random source after every roll of the resolution, so the several draws
   * of one use are inside one number and a replay lands on the same units.
   */
  | {
      type: 'ability-used';
      actor: UnitId;
      abilityId: string;
      to: Position;
      rngState: number;
      /** The pool the use spent, or null for a unit that carries no pool at all. */
      resource: ResourceKind | null;
    }
  /**
   * A unit standing on a cell of a damage effect was hit (ADR 0016 §8.2). The effect rolls once per
   * unit, so two units on the same area carry their own `hit` and their own `damage`.
   */
  | { type: 'damaged'; target: UnitId; hit: boolean; damage: number }
  /**
   * A unit standing on a cell of a heal effect gained health (ADR 0016 §8.2). A heal never rolls, so
   * there is no `hit`, and `amount` is what the unit actually gained: the cap at `maxHealth` is already
   * applied, so a full-health unit is worth zero rather than the amount that was offered.
   */
  | { type: 'healed'; target: UnitId; amount: number }
  /**
   * The refill of the unit's pool, which is one action of the engine for both kinds (ADR 0011): a
   * reload for a weapon class, a meditation for a magic one. `resource` is the pool it refilled, so
   * the sentence describing it names what the player saw, and a unit that carries no pool refills
   * nothing and answers null.
   */
  | { type: 'reloaded'; actor: UnitId; resource: ResourceKind | null }
  /**
   * The pending move was taken back. No payload: the run it undoes is in the state it was applied to,
   * the way the walk of a `moved` event is not repeated here.
   */
  | { type: 'move-cancelled'; actor: UnitId }
  /** The pending move was confirmed. The run it closes is in the state it was applied to. */
  | { type: 'move-committed'; actor: UnitId }
  | { type: 'unit-defeated'; target: UnitId }
  | { type: 'corpse-removed'; target: UnitId }
  | { type: 'turn-ended'; actor: UnitId; next: UnitId; round: number }
  /**
   * The point a magic pool handed back as the turn passed to it (ADR 0017). Emitted right after the
   * `turn-ended` that gives the turn away, and only when a point was actually regained: a unit at its
   * ceiling, an ammunition class and a unit that never comes on turn emit nothing at all. It carries
   * the amount, so a replay reads the point instead of inferring it from the turn order.
   */
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
  /**
   * A use of an ability the actor does not carry, or one its slots name and no catalog defines
   * (ADR 0016 §6). The id is looked up in the caster's own slots first, so an ability the match knows
   * and the unit does not is refused the same way as one nobody knows.
   */
  | 'ability-unknown'
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
