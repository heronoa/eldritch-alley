// The maps of the match server: the three prototype maps, the spawns each one carries, and the seed that
// picks a board. Data only: BattleRoom builds the engine's MatchSetup from here, and the integration test
// rebuilds the same setup to replay a match from its events.
//
// Since map-fidelity M1 the relief is the prototype's own (0 to 11, with a gap on the rooftop), so a board
// is the prototype's heights levelled into the engine's range and nothing else: a cell is out of play
// because the step rule cannot climb to it, never because a level was authored to mean "wall".
//
// The map is a pure function of the seed, and the seed travels in the public state, so a live match is
// still reproducible from it alone. The randomness is choosing the map, which is the room's business;
// the engine never draws one (ADR 0005).
import type { Abilities, Board, Equipment, MatchSetup, Position, Team, Unit } from '@eldritch-alley/engine';
import { PROTOTYPE_MAPS, type PrototypeMap, type PrototypeMapId } from './maps/prototype-maps';

/** Every match built without a seed uses this one, so a match is reproducible from its events alone. */
export const MATCH_SEED = 1;

/** The three places a match can be played, which are the prototype's three maps. */
export type MapId = PrototypeMapId;

/** One map: the name it is referred to by, the board the engine plays on, and where the squads land. */
export interface MatchMap {
  readonly id: MapId;
  readonly board: Board;
  readonly spawns: MatchSpawns;
}

/** Where each squad starts, in the order of `CLASS_ORDER`. */
export interface MatchSpawns {
  readonly A: readonly Position[];
  readonly B: readonly Position[];
}

/** What a gap becomes on the board: there is no floor to stand on, so it is not drawn as one. */
const BOARD_FLOOR = 0;

/**
 * The engine's board for one prototype map. The prototype's heights are already within the 0..255 the
 * engine takes, so the only change is the gap: it has no floor, and the board has to give it a number, so
 * it takes the board's own floor. That is what keeps a gap out of play, because the ground beside it is
 * five or more levels above and the step rule refuses the step into it — `map.test.ts` asserts it.
 */
export function boardOf(map: PrototypeMap): Board {
  const levels = map.heights.flatMap((row) => row.map((height) => (height === map.void ? BOARD_FLOOR : height)));

  return { width: map.tiles[0]?.length ?? 0, height: map.tiles.length, levels };
}

/** The maps a match can be played on, in the order `mapIndex` walks them. */
export const MAPS: readonly MatchMap[] = PROTOTYPE_MAPS.map((map) => ({
  id: map.id,
  board: boardOf(map),
  // The prototype's own demo positions, so a match opens where the prototype opens.
  spawns: map.spawns,
}));

/** The map a seed asks for, which is what makes the pick reproducible from the seed the state carries. */
export function mapIndex(seed: number): number {
  return seed % MAPS.length;
}

/** The map of a match built on `seed`: the whole entry, board and spawns included. */
export function mapFor(seed: number): MatchMap {
  return MAPS[mapIndex(seed)];
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

/** Team A is the human, team B the bot. Both field the same three classes, on the map's own spawns. */
export function rosterFor(spawns: MatchSpawns): MatchSetup['teams'] {
  return [makeSquad('A', spawns.A), makeSquad('B', spawns.B)];
}

/** The setup of a match on the map its seed asks for. The default seed is the one the tests replay. */
export function createMatchSetup(seed: number = MATCH_SEED): MatchSetup {
  const map = mapFor(seed);

  return { seed, map: map.board, teams: rosterFor(map.spawns) };
}
