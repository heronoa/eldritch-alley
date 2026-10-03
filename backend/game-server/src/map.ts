// The fixed map and roster of M2-a. Data only: BattleRoom builds the engine's MatchSetup from here,
// and the integration test rebuilds the same setup to replay a match from its events.
import type { Abilities, Board, Equipment, MatchSetup, Position, Team, Unit } from '@eldritch-alley/engine';

/** Every M2-a match uses this seed, so a match is reproducible from its events alone. */
export const MATCH_SEED = 1;

/**
 * The 8x8 battlefield, row-major: the level of (x, y) is `levels[y * 8 + x]`.
 * Level 1 covers the 2x2 block (2,2)-(3,3); its far corner (3,3) is the only level 2 cell, a perch a
 * unit can only climb into from the level 1 cells around it.
 */
export const BOARD: Board = {
  width: 8,
  height: 8,
  levels: [
    // y = 0, 1
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    // y = 2: (2,2) and (3,2) are level 1
    0, 0, 1, 1, 0, 0, 0, 0,
    // y = 3: (2,3) is level 1 and (3,3) is level 2
    0, 0, 1, 2, 0, 0, 0, 0,
    // y = 4..7
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
};

/**
 * The three M2-a classes. Velocity order matters: the sniper is the fastest, so a match opens on
 * team A's sniper and the human always has a turn to take.
 */
interface ClassSpec {
  readonly primaryClass: string;
  readonly speed: number;
  readonly movement: number;
  readonly health: number;
  readonly attack: number;
  readonly hitChance: number;
  /** Reach in Chebyshev distance. */
  readonly range: number;
  readonly magazine: number | null;
}

const CLASS_SPECS = {
  sniper: { primaryClass: 'sniper', speed: 12, movement: 3, health: 12, attack: 4, hitChance: 80, range: 3, magazine: 3 },
  wizard: { primaryClass: 'wizard', speed: 10, movement: 4, health: 14, attack: 3, hitChance: 75, range: 1, magazine: null },
  priest: { primaryClass: 'priest', speed: 8, movement: 4, health: 16, attack: 2, hitChance: 70, range: 1, magazine: null },
} as const satisfies Record<string, ClassSpec>;

type ClassName = keyof typeof CLASS_SPECS;

const CLASS_ORDER: readonly ClassName[] = ['sniper', 'wizard', 'priest'];

/** Where each squad starts, in the same order as CLASS_ORDER. */
const SPAWNS: Record<Team, readonly Position[]> = {
  A: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ],
  B: [
    { x: 7, y: 7 },
    { x: 6, y: 7 },
    { x: 7, y: 6 },
  ],
};

function emptyEquipment(): Equipment {
  return { armor: null, helmet: null, mainHand: null, offHand: null, accessory1: null, accessory2: null };
}

function emptyAbilities(): Abilities {
  return { activeSets: [null, null], reaction: null, movement: null, support: null };
}

function makeUnit(id: string, team: Team, position: Position, spec: ClassSpec): Unit {
  return {
    id,
    team,
    position: { x: position.x, y: position.y },
    speed: spec.speed,
    health: spec.health,
    attack: spec.attack,
    hitChance: spec.hitChance,
    range: spec.range,
    magazine: spec.magazine,
    movement: spec.movement,
    // Nerve and attunement are carried from M1 but no M2-a rule reads them.
    nerve: 50,
    attunement: 50,
    primaryClass: spec.primaryClass,
    equipment: emptyEquipment(),
    abilities: emptyAbilities(),
  };
}

function makeSquad(team: Team): readonly Unit[] {
  return CLASS_ORDER.map((className, index) =>
    makeUnit(`${team}-${className}`, team, SPAWNS[team][index], CLASS_SPECS[className]),
  );
}

/** Team A is the human, team B the bot. Both field the same three classes. */
export const ROSTER: { readonly A: readonly Unit[]; readonly B: readonly Unit[] } = {
  A: makeSquad('A'),
  B: makeSquad('B'),
};

/** The setup of an M2-a match. The default seed is the one every live match uses. */
export function createMatchSetup(seed: number = MATCH_SEED): MatchSetup {
  return { seed, map: BOARD, teams: [ROSTER.A, ROSTER.B] };
}

/** The health each unit of the roster starts with, by unit id. The bot reads it to judge a retreat. */
export const MAX_HEALTH_BY_UNIT_ID: Readonly<Record<string, number>> = Object.fromEntries(
  [...ROSTER.A, ...ROSTER.B].map((unit) => [unit.id, unit.health]),
);
