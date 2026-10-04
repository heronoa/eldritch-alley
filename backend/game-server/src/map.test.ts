// The map data of the match server: the three boards, where each squad lands, and the seed that picks
// one. The engine has no blocked tiles, so a map is authored to the palette — level 3 is a wall only
// because nothing can step up to it — and these invariants are what holds a hand-authored grid to that.
//
// Neighbours here are the eight of Chebyshev distance 1, diagonals included (DT-48): the engine accepts
// a diagonal step, so a level-2 cell diagonal to a level-3 wall is a way onto the wall.
import { describe, expect, it } from 'vitest';
import { newMatch, type Board, type Position } from '@eldritch-alley/engine';
import { MAPS, MATCH_SEED, createMatchSetup, mapIndex, spawnsFor } from './map';

/** The level of a wall: the only cell a unit can never stand on. */
const WALL = 3;

/**
 * The cells a map cuts off on purpose, keyed by id. A chasm cannot be a wall — a level-3 cell has to
 * stay out of reach of level 2 — so the roof's gap is level 0 ringed by level 2: a two-level drop
 * nothing can step into, crossed by the plank alone. Every other walkable cell has to be reachable.
 */
const CUT_OFF: Record<string, readonly Position[]> = {
  street: [],
  park: [],
  roof: [0, 1, 2, 3, 5, 6, 7, 8, 9].map((y) => ({ x: 6, y })),
};

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

/** Every cell a unit could stand on. A wall is not one of them. */
function walkableOf(board: Board): Position[] {
  return everyCell(board).filter((cell) => levelOf(board, cell) < WALL);
}

/** Every cell a unit can walk to from `start`, stepping at most one level at a time. */
function reachedFrom(board: Board, start: Position): Set<string> {
  const reached = new Set([key(start)]);
  const queue: Position[] = [start];

  while (queue.length > 0) {
    const cell = queue.shift();
    if (cell === undefined) break;

    for (const next of neighboursOf(board, cell)) {
      if (reached.has(key(next))) continue;
      if (Math.abs(levelOf(board, next) - levelOf(board, cell)) > 1) continue;

      reached.add(key(next));
      queue.push(next);
    }
  }

  return reached;
}

describe.each(MAPS)('the $id map', (map) => {
  const board = map.board;
  const spawns = spawnsFor(board);
  const cutOff = new Set(CUT_OFF[map.id].map(key));

  it('I4 — holds one of the four palette levels per cell', () => {
    expect(board.levels).toHaveLength(board.width * board.height);

    for (const cell of everyCell(board)) {
      expect(levelOf(board, cell), key(cell)).toBeGreaterThanOrEqual(0);
      expect(levelOf(board, cell), key(cell)).toBeLessThanOrEqual(WALL);
    }
  });

  it('I4 — is a board the engine takes, spawns included', () => {
    // `validateBoard` is private to the engine, so `newMatch` is the public door to it; it also checks
    // that every spawn is inside the board.
    const seed = MAPS.indexOf(map);

    expect(createMatchSetup(seed).map).toBe(board);
    expect(() => newMatch(createMatchSetup(seed))).not.toThrow();
  });

  it('I1 — keeps every wall out of reach of the raised ground', () => {
    // Read from the raised ground, which is where the hazard is: a unit on a level-2 cell could step onto
    // a wall next to it. A wall beside a wall is just the mass being more than one cell wide.
    for (const cell of everyCell(board)) {
      if (levelOf(board, cell) !== WALL - 1) continue;

      for (const next of neighboursOf(board, cell)) {
        expect(levelOf(board, next), `${key(cell)} -> ${key(next)}`).toBeLessThan(WALL);
      }
    }
  });

  it('I1b — leaves no way into the cells it cuts off', () => {
    for (const cell of CUT_OFF[map.id]) {
      expect(levelOf(board, cell), key(cell)).toBe(0);

      for (const next of neighboursOf(board, cell)) {
        if (cutOff.has(key(next))) continue;
        expect(levelOf(board, next), `${key(cell)} -> ${key(next)}`).toBe(2);
      }
    }
  });

  it('I2 — lands both squads on legal ground, apart from each other', () => {
    for (const [team, cells] of Object.entries(spawns)) {
      expect(cells, team).toHaveLength(3);

      for (const cell of cells) {
        const where = `${team} ${key(cell)}`;
        expect(inside(board, cell), where).toBe(true);
        expect(levelOf(board, cell), where).toBe(1);
        expect(cutOff.has(key(cell)), where).toBe(false);
      }
    }

    const all = [...spawns.A, ...spawns.B].map(key);
    expect(new Set(all).size).toBe(all.length);
  });

  it('I3 — leaves no walkable cell orphaned', () => {
    const reached = reachedFrom(board, spawns.A[0]);

    for (const cell of walkableOf(board)) {
      if (cutOff.has(key(cell))) continue;
      expect(reached.has(key(cell)), `${key(cell)} cannot be reached`).toBe(true);
    }
  });

  it('I3 — lets the two squads meet', () => {
    const reached = reachedFrom(board, spawns.A[0]);

    for (const cell of spawns.B) {
      expect(reached.has(key(cell)), `${key(cell)} cannot be reached from A`).toBe(true);
    }
  });
});

describe('the roof chasm', () => {
  it('is the column x = 6 at level 0, crossed by the plank at (6,4) alone', () => {
    const roof = MAPS.find((map) => map.id === 'roof');
    expect(roof).toBeDefined();
    if (roof === undefined) return;

    const column = everyCell(roof.board).filter((cell) => cell.x === 6);
    expect(column).toHaveLength(roof.board.height);

    const gap = column.filter((cell) => levelOf(roof.board, cell) === 0).map(key);
    const planks = column.filter((cell) => levelOf(roof.board, cell) === 2).map(key);
    expect(gap).toEqual(CUT_OFF.roof.map((cell) => key(cell)).sort());
    expect(planks).toEqual(['6,4']);
  });

  it('has no wall at all, because its relief is one continuous ramp', () => {
    const roof = MAPS.find((map) => map.id === 'roof');
    expect(roof).toBeDefined();
    if (roof === undefined) return;

    for (const cell of everyCell(roof.board)) {
      expect(levelOf(roof.board, cell), key(cell)).toBeLessThan(WALL);
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

  it('lands each squad where its board says', () => {
    for (const map of MAPS) {
      const spawns = spawnsFor(map.board);
      const setup = createMatchSetup(MAPS.indexOf(map));

      expect(setup.teams[0].map((unit) => unit.position)).toEqual(spawns.A);
      expect(setup.teams[1].map((unit) => unit.position)).toEqual(spawns.B);
    }
  });
});
