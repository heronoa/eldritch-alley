// The map data of the match server: the three prototype maps, where each squad lands, and the seed
// that picks one.
//
// Since map-fidelity M1 the heights are the prototype's own (0 to 11, or -10 for a gap), so what a
// unit can reach is decided by the engine's step rule alone (|Δ| ≤ 1): there is no wall level any
// more, and no palette to author a map to. The invariants this file used to assert — a wall out of
// reach of the raised ground, the roof's gap ringed by level 2 — described the four-tone compression
// that milestone removes, so they are replaced by the flood fill below, which asks the same question
// of the real relief.
//
// Neighbours here are the eight of Chebyshev distance 1, diagonals included (DT-48): the engine
// accepts a diagonal step, so the flood has to allow one too.
import { describe, expect, it } from 'vitest';
import { newMatch, type Board, type Position } from '@eldritch-alley/engine';
import { MAPS, MATCH_SEED, PROP_EFFECTS, boardOf, createMatchSetup, mapIndex, type MapId } from './map';
import { PROTOTYPE_MAPS, type PrototypeMap } from './maps/prototype-maps';

/** How a cell is named in a failure message, and how a set of cells is keyed. */
const key = (cell: Position): string => `${cell.x},${cell.y}`;

/** Every cell of a board, in reading order. */
function everyCell(board: Board): Position[] {
  const cells: Position[] = [];
  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) cells.push({ x, y });
  }
  return cells;
}

function inside(board: Board, cell: Position): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < board.width && cell.y < board.height;
}

function levelOf(board: Board, cell: Position): number {
  return board.levels[cell.y * board.width + cell.x];
}

/** The eight cells around a cell, diagonals included. */
function neighboursOf(board: Board, cell: Position): Position[] {
  const found: Position[] = [];

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const next = { x: cell.x + dx, y: cell.y + dy };
      if (inside(board, next)) found.push(next);
    }
  }

  return found;
}

/** The prototype map behind an id: the heights and the void value the board has already lost. */
function prototypeOf(id: MapId): PrototypeMap {
  const map = PROTOTYPE_MAPS.find((candidate) => candidate.id === id);
  if (map === undefined) throw new Error(`no prototype map: ${id}`);
  return map;
}

/**
 * Whether a cell is a gap. The maps without one carry `void: NaN`, which matches no cell — so this
 * is false everywhere on them, which is what they mean.
 */
function isVoid(map: PrototypeMap, cell: Position): boolean {
  return map.heights[cell.y][cell.x] === map.void;
}

/** Every cell a unit can walk to from `start`: one level at a time, and never into a gap. */
function reachedFrom(map: PrototypeMap, start: Position): Set<string> {
  const board = boardOf(map);
  const reached = new Set([key(start)]);
  const queue: Position[] = [start];

  while (queue.length > 0) {
    const cell = queue.shift();
    if (cell === undefined) break;

    for (const next of neighboursOf(board, cell)) {
      if (reached.has(key(next))) continue;
      if (isVoid(map, next)) continue;
      if (Math.abs(levelOf(board, next) - levelOf(board, cell)) > 1) continue;

      reached.add(key(next));
      queue.push(next);
    }
  }

  return reached;
}

/** The cells of one row, from `x0` to `x1` inclusive. */
function row(y: number, x0: number, x1: number): Position[] {
  return Array.from({ length: x1 - x0 + 1 }, (_, index) => ({ x: x0 + index, y }));
}

/** The cells of one column, from `y0` to `y1` inclusive. */
function column(x: number, y0: number, y1: number): Position[] {
  return Array.from({ length: y1 - y0 + 1 }, (_, index) => ({ x, y: y0 + index }));
}

/** A group of cells the relief cuts off, and why — the reason is what the owner reviews in M3. */
interface Unreachable {
  readonly reason: string;
  readonly cells: readonly Position[];
}

/**
 * The cells a map cuts off from the play area, with the reason, for the owner to review (section 6 of
 * the plan). The test below checks this list is exact: a cell not here has to be reachable, and a
 * cell here has to be unreachable. The prototype blocks these cells by tile letter; this game has no
 * blocked tiles, so a cell is out of play only when the step rule cannot climb to it.
 */
const KNOWN_UNREACHABLE: Readonly<Record<MapId, readonly Unreachable[]>> = {
  street: [
    {
      reason: 'the building mass around the street: 3 to 7 levels above the road it fronts',
      cells: [
        ...row(0, 0, 9),
        ...row(1, 0, 0), ...row(1, 9, 9),
        ...row(2, 0, 0), ...row(2, 9, 9),
        ...row(3, 0, 0), ...row(3, 9, 9),
        ...row(4, 0, 0), ...row(4, 9, 9),
        ...row(5, 0, 3),
        ...row(6, 0, 2),
        ...row(7, 0, 3),
        ...row(8, 0, 3),
        ...row(9, 0, 2),
      ],
    },
  ],
  park: [
    {
      reason: 'the buildings on the park border: 4 to 6 levels above the grass',
      cells: [...column(0, 0, 9), ...row(0, 1, 9)],
    },
  ],
  roof: [
    {
      reason: 'the neighbour roof across the gap: level 11, five and six levels above everything it touches',
      cells: [...row(0, 7, 9), ...row(1, 7, 9)],
    },
  ],
};

describe.each(MAPS)('the $id map', (map) => {
  const board = map.board;
  const prototype = prototypeOf(map.id);
  const spawns = map.spawns;
  const unreachable = new Set(KNOWN_UNREACHABLE[map.id].flatMap((group) => group.cells.map(key)));

  it('is the prototype relief on a 10x10 board, the gap levelled to the board floor', () => {
    expect(board.width).toBe(10);
    expect(board.height).toBe(10);

    for (const cell of everyCell(board)) {
      const height = prototype.heights[cell.y][cell.x];
      expect(levelOf(board, cell), key(cell)).toBe(isVoid(prototype, cell) ? 0 : height);
    }
  });

  it('is a board the engine takes, spawns included', () => {
    // `validateBoard` is private to the engine, so `newMatch` is the public door to it; it also checks
    // that every spawn is inside the board.
    const seed = MAPS.indexOf(map);

    expect(createMatchSetup(seed).map).toBe(board);
    expect(() => newMatch(createMatchSetup(seed))).not.toThrow();
  });

  it('keeps the gap out of reach, so nothing walks into it', () => {
    for (const cell of everyCell(board)) {
      if (!isVoid(prototype, cell)) continue;

      for (const next of neighboursOf(board, cell)) {
        if (isVoid(prototype, next)) continue;
        // A gap is the floor of the board, so a cell of ground beside it is more than one level up
        // and the step rule refuses the step. A void cell touching a ground cell at one level would
        // be a way in, and a way in is a map that plays wrong rather than a map that looks wrong.
        expect(Math.abs(levelOf(board, next) - levelOf(board, cell)), `${key(next)} -> ${key(cell)}`).toBeGreaterThan(1);
      }
    }
  });

  it('lands both squads on ground the relief allows, apart from each other', () => {
    for (const [team, cells] of Object.entries(spawns)) {
      expect(cells, team).toHaveLength(3);

      for (const cell of cells) {
        const where = `${team} ${key(cell)}`;
        expect(inside(board, cell), where).toBe(true);
        expect(isVoid(prototype, cell), where).toBe(false);
        expect(unreachable.has(key(cell)), where).toBe(false);
      }
    }

    const all = [...spawns.A, ...spawns.B].map(key);
    expect(new Set(all).size).toBe(all.length);
  });

  it('lets the two squads meet', () => {
    const reached = reachedFrom(prototype, spawns.A[0]);

    for (const cell of spawns.B) {
      expect(reached.has(key(cell)), `${key(cell)} cannot be reached from A`).toBe(true);
    }
  });

  it('leaves no cell orphaned, apart from the ones the owner reviews', () => {
    const reached = reachedFrom(prototype, spawns.A[0]);

    for (const cell of everyCell(board)) {
      if (isVoid(prototype, cell)) continue;

      const listed = unreachable.has(key(cell));
      expect(
        reached.has(key(cell)),
        `${key(cell)} is ${listed ? 'listed as unreachable but is' : 'not listed and is not'} reachable`,
      ).toBe(!listed);
    }
  });
});

describe('the map set', () => {
  it('ships the three prototype maps, each a board of its own', () => {
    expect(MAPS.map((map) => map.id)).toEqual(['street', 'park', 'roof']);
    expect(new Set(MAPS.map((map) => map.board.levels.join(','))).size).toBe(MAPS.length);
  });

  it('picks a map from the seed, and the same one every time', () => {
    expect(mapIndex(MATCH_SEED)).toBe(1);

    for (let seed = 0; seed < MAPS.length * 3; seed += 1) {
      expect(mapIndex(seed), `seed ${seed}`).toBe(seed % MAPS.length);
    }

    const drawn = Array.from({ length: MAPS.length }, (_, seed) => MAPS[mapIndex(seed)].id);
    expect(new Set(drawn).size).toBe(MAPS.length);
  });

  it('builds the match the seed asks for, twice over', () => {
    const setup = createMatchSetup(MATCH_SEED);

    expect(setup.seed).toBe(MATCH_SEED);
    expect(setup.map).toBe(MAPS[mapIndex(MATCH_SEED)].board);
    expect(createMatchSetup(MATCH_SEED)).toEqual(setup);
    expect(setup.teams[0]).toHaveLength(3);
    expect(setup.teams[1]).toHaveLength(3);
  });

  it('lands each squad where its prototype map says', () => {
    for (const map of MAPS) {
      const setup = createMatchSetup(MAPS.indexOf(map));

      expect(setup.teams[0].map((unit) => unit.position)).toEqual(map.spawns.A);
      expect(setup.teams[1].map((unit) => unit.position)).toEqual(map.spawns.B);
    }
  });
});

describe('the props of a map', () => {
  /** The props of a map's prototype, in the order `data.js` lists them. */
  function placedProps(map: MapId) {
    return prototypeOf(map).props;
  }

  it('classifies every prop type the three maps place, and no type they do not', () => {
    // The table is the map data's whole vocabulary (ADR 0012). A new prop type in `data.js` fails
    // here, rather than quietly becoming a decoration the player walks through.
    const placed = new Set(PROTOTYPE_MAPS.flatMap((map) => map.props.map((prop) => prop.t)));

    expect([...placed].sort()).toEqual(Object.keys(PROP_EFFECTS).sort());
  });

  it('gives one real blocker and a chest-high set, and leaves the rest as decoration', () => {
    expect(PROP_EFFECTS['tower']).toBe('wall');

    for (const type of ['car', 'crates', 'dumpster', 'moto', 'ac', 'vent', 'fountain', 'bench']) {
      expect(PROP_EFFECTS[type], type).toBe('cover');
    }

    // A lamp, a puddle and a manhole change nothing about a shot.
    for (const type of ['lamp', 'puddle', 'manhole']) {
      expect(PROP_EFFECTS[type], type).toBeNull();
    }
  });

  it('puts on the board exactly the props of a classified type, at the same positions', () => {
    for (const map of MAPS) {
      const expected = placedProps(map.id)
        .filter((prop) => PROP_EFFECTS[prop.t] !== null)
        .map((prop) => ({ position: { x: prop.x, y: prop.y }, kind: PROP_EFFECTS[prop.t] }));

      expect(map.board.props, map.id).toEqual(expected);
    }
  });

  it('leaves no prop of a classified type out of the board', () => {
    // The other reading of the same rule, so a filter that dropped everything would still fail.
    for (const map of MAPS) {
      const classified = placedProps(map.id).filter((prop) => PROP_EFFECTS[prop.t] !== null);
      expect(map.board.props, map.id).toHaveLength(classified.length);
      expect(classified.length, map.id).toBeGreaterThan(0);
    }
  });

  it('places every prop inside the board, and never two on the same cell', () => {
    // `newMatch` refuses a prop off the board and two props on one cell, so a map that broke either
    // would fail at the first match rather than at review time.
    for (const map of MAPS) {
      expect(map.board.props, map.id).toBeDefined();

      const props = map.board.props ?? [];

      for (const prop of props) {
        expect(inside(map.board, prop.position), `${map.id} ${key(prop.position)}`).toBe(true);
      }

      const cells = props.map((prop) => key(prop.position));
      expect(new Set(cells).size, map.id).toBe(cells.length);
      expect(() => newMatch(createMatchSetup(MAPS.indexOf(map))), map.id).not.toThrow();
    }
  });
});
