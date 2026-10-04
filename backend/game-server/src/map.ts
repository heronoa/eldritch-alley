// The maps of the match server: three 10x10 boards ported from the prototype, the corner spawns every
// map shares, and the seed that picks a board. Data only: BattleRoom builds the engine's MatchSetup from
// here, and the integration test rebuilds the same setup to replay a match from its events.
//
// The map is a pure function of the seed, and the seed travels in the public state, so a live match is
// still reproducible from it alone. The randomness is choosing the map, which is the room's business;
// the engine never draws one (ADR 0005).
import type { Abilities, Board, Equipment, MatchSetup, Position, Team, Unit } from '@eldritch-alley/engine';

/** Every match built without a seed uses this one, so a match is reproducible from its events alone. */
export const MATCH_SEED = 1;

/** The three places a match can be played. */
export type MapId = 'street' | 'park' | 'roof';

/** One map: the name it is referred to by, and the board itself. */
export interface MatchMap {
  readonly id: MapId;
  readonly board: Board;
}

/** Where each squad starts, in the order of `CLASS_ORDER`. */
export interface MatchSpawns {
  readonly A: readonly Position[];
  readonly B: readonly Position[];
}

/**
 * A board from its rows, top to bottom, one digit per cell: the level of (x, y) is the y-th row's x-th
 * digit. A grid of digits is how the prototype draws its maps, and it is the only form in which a
 * hand-authored relief can be read and reviewed.
 */
function boardOf(rows: readonly string[]): Board {
  const levels = rows
    .join('')
    .split('')
    .map((digit) => Number(digit));

  return { width: rows[0]?.length ?? 0, height: rows.length, levels };
}

/**
 * A street hemmed by buildings, one alley down the middle and a fenced yard in the south-east corner.
 * Level 0 is the road, 1 the pavement, 3 the building mass; there is no raised ground at all.
 */
const STREET = boardOf([
  '1133333333',
  '1000000003',
  '3000000003',
  '3000000003',
  '3000000003',
  '3333033333',
  '3330033333',
  '3333003333',
  '3333033331',
  '3330011111',
]);

/**
 * A park: a pond in the north-west, open grass over the middle, and a two-level hill against the south-
 * east corner. Level 0 is the water, 1 the grass and paths, 2 the hill, 3 the buildings on the border.
 */
const PARK = boardOf([
  '1133333333',
  '1111111111',
  '3100111111',
  '3100111111',
  '3111111111',
  '3111111111',
  '3111111111',
  '3111111221',
  '3111111221',
  '3111111111',
]);

/**
 * A rooftop split by a chasm, crossed by a single plank at (6,4). Level 0 is the gap and the deck the
 * squads arrive on, 2 the roofs; there is no building mass, because a wall beside the gap would have to
 * touch the level-2 roof and would stop being one.
 */
const ROOF = boardOf([
  '1122220222',
  '1222220222',
  '2222220222',
  '2222220222',
  '2222222222',
  '2222220222',
  '2222220222',
  '1222220222',
  '1122220221',
  '1122220211',
]);

/** The maps a match can be played on, in the order `mapIndex` walks them. */
export const MAPS: readonly MatchMap[] = [
  { id: 'street', board: STREET },
  { id: 'park', board: PARK },
  { id: 'roof', board: ROOF },
];

/** The near corner's three cells, in the order `CLASS_ORDER` walks them: the sniper on the corner itself. */
const CORNER_L: readonly Position[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

/**
 * Where each squad starts on a board: the corner `CORNER_L` for A, and the same shape mirrored through
 * the board's centre for B, so both sides start on the same footing whatever the map. On the 10x10 maps
 * that is (0, 0) and (9, 9).
 */
export function spawnsFor(board: Board): MatchSpawns {
  const mirrored = (cell: Position): Position => ({
    x: board.width - 1 - cell.x,
    y: board.height - 1 - cell.y,
  });

  return { A: CORNER_L, B: CORNER_L.map(mirrored) };
}

/** The map a seed asks for, which is what makes the pick reproducible from the seed the state carries. */
export function mapIndex(seed: number): number {
  return seed % MAPS.length;
}

/**
 * The three classes. Velocity order matters: the sniper is the fastest, so a match opens on team A's
 * sniper and the human always has a turn to take.
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

function makeSquad(team: Team, spawns: readonly Position[]): readonly Unit[] {
  return CLASS_ORDER.map((className, index) =>
    makeUnit(`${team}-${className}`, team, spawns[index], CLASS_SPECS[className]),
  );
}

/** Team A is the human, team B the bot. Both field the same three classes, on the board's two corners. */
export function rosterFor(board: Board): MatchSetup['teams'] {
  const spawns = spawnsFor(board);

  return [makeSquad('A', spawns.A), makeSquad('B', spawns.B)];
}

/** The setup of a match on the map its seed asks for. The default seed is the one the tests replay. */
export function createMatchSetup(seed: number = MATCH_SEED): MatchSetup {
  const board = MAPS[mapIndex(seed)].board;

  return { seed, map: board, teams: rosterFor(board) };
}
