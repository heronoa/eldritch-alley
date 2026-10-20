// Line of sight: whether a shot has a clear line between two cells, decided by the height of the cells
// on that line and by the `wall` props standing between them. Integer math only (ADR 0005), so the
// whole rule is a comparison of two products.
//
// The three maps come from the server's own data, so the sweep at the end runs on the terrain a match
// is really played on, gaps and all.
import { describe, expect, it } from 'vitest';
import { PROTOTYPE_MAPS, type PrototypeMap } from '../../game-server/src/maps/prototype-maps';
import { hasLineOfSight } from './sight';
import type { Board, Prop } from './types';

function makeBoard(heights: Record<string, number> = {}, props: readonly Prop[] = []): Board {
  const levels = new Array<number>(64).fill(0);
  for (const [key, level] of Object.entries(heights)) {
    const [x, y] = key.split(',').map(Number);
    levels[y * 8 + x] = level;
  }
  return { width: 8, height: 8, levels, props };
}

function wallAt(x: number, y: number): Prop {
  return { position: { x, y }, kind: 'wall' };
}

function coverAt(x: number, y: number): Prop {
  return { position: { x, y }, kind: 'cover' };
}

/** The board the server builds for a prototype map: a gap has no floor, so it takes the board's own
 * floor (`boardOf` in `backend/game-server/src/map.ts`). */
function boardOf(map: PrototypeMap): Board {
  const levels = map.heights.flatMap((row) => row.map((height) => (height === map.void ? 0 : height)));
  return { width: map.tiles[0].length, height: map.tiles.length, levels };
}

const ROOF = boardOf(PROTOTYPE_MAPS.find((map) => map.id === 'roof')!);

describe('hasLineOfSight: adjacent cells', () => {
  it('sees the neighbouring cell whatever the levels', () => {
    // Nothing stands between two adjacent cells, so no height can block the line.
    const board = makeBoard({ '1,0': 9, '0,1': 9, '1,1': 9 });

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
  });

  it('sees its own cell', () => {
    expect(hasLineOfSight(makeBoard(), { x: 3, y: 3 }, { x: 3, y: 3 })).toBe(true);
  });
});

describe('hasLineOfSight: what blocks', () => {
  it('is blocked by a building between two units in the alley', () => {
    // Both units on the ground, a five-level building on the cell between them.
    const board = makeBoard({ '1,0': 5 });

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  it('is blocked by a building on the diagonal', () => {
    const board = makeBoard({ '1,1': 5 });

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
  });

  it('is blocked by a cell one level above the eye line', () => {
    // The eye of a unit on the ground is one level up: two levels is above the line, not on it.
    const board = makeBoard({ '1,0': 2 });

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  it('is not blocked by a cell beside the line', () => {
    // The alley T-junction: the building is one column off the line, so the shot passes it.
    const board = makeBoard({ '1,1': 5 });

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
  });
});

describe('hasLineOfSight: what is seen', () => {
  it('sees across the rooftop gap', () => {
    // The playtest cells of the roof map, where the neighbours face each other over a gap.
    expect(hasLineOfSight(ROOF, { x: 5, y: 2 }, { x: 7, y: 2 })).toBe(true);
  });

  it('sees over a car standing between the two units', () => {
    // A car is chest-high: it is `cover`, not a wall, so the shot passes over it and only the chance
    // to hit is what it costs (`cover.ts`). A crate and a dumpster are the same.
    const board = makeBoard({}, [coverAt(1, 0)]);

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
  });

  it('sees a lower target over a wall from a rooftop', () => {
    // Shooting down: the eye of the shooter is far above the line, so a three-level wall does not reach it.
    const board = makeBoard({ '0,0': 6, '1,0': 3, '2,0': 0 });

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
  });

  it('is blocked for a target on the ground behind the same wall', () => {
    // The mirror of the case above: on the ground the wall is above the eye line.
    const board = makeBoard({ '1,0': 3 });

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });
});

describe('hasLineOfSight: walls', () => {
  it('is blocked by a wall standing between the two cells', () => {
    // The tower of the street map: a prop of the `wall` kind blocks the line on its own, on ground
    // that is perfectly flat and would otherwise be clear.
    const board = makeBoard({}, [wallAt(1, 0)]);

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  it('is blocked by a wall on the diagonal', () => {
    const board = makeBoard({}, [wallAt(1, 1)]);

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
  });

  it('is not blocked by a wall on the cell of the shooter or of the target', () => {
    // The limit of the rule, the same one the height rule already has: only the cells strictly
    // between the two ends are read. A wall under a unit is a wall it stands on.
    expect(hasLineOfSight(makeBoard({}, [wallAt(0, 0)]), { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
    expect(hasLineOfSight(makeBoard({}, [wallAt(2, 0)]), { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
  });

  it('is not blocked by a wall beside the line', () => {
    const board = makeBoard({}, [wallAt(1, 1)]);

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
  });

  it('blocks a line the height rule would let through, and the other way round', () => {
    // The two rules are independent: a wall on flat ground blocks where nothing blocked before, and
    // a tall cell blocks where no wall stands.
    const wall = makeBoard({}, [wallAt(1, 0)]);
    const building = makeBoard({ '1,0': 5 });

    expect(hasLineOfSight(wall, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(hasLineOfSight(building, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(hasLineOfSight(makeBoard({}, [coverAt(1, 0)]), { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
  });

  it('does not block the neighbouring cell, which has nothing between its ends', () => {
    const board = makeBoard({}, [wallAt(0, 0), wallAt(1, 0)]);

    expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
  });

  it('answers the same read from either end, whenever the wall stands', () => {
    // (0,0) to (2,1) is not a straight step: the line one way steps through (1,0), the other through
    // (1,1). A wall on either of the two blocks both readings, the way a building does.
    for (const wall of [wallAt(1, 0), wallAt(1, 1)]) {
      const board = makeBoard({}, [wall]);

      expect(hasLineOfSight(board, { x: 0, y: 0 }, { x: 2, y: 1 })).toBe(false);
      expect(hasLineOfSight(board, { x: 2, y: 1 }, { x: 0, y: 0 })).toBe(false);
    }
  });

  it('throws outside the board, with a wall on it as without one', () => {
    const board = makeBoard({}, [wallAt(1, 0)]);

    expect(() => hasLineOfSight(board, { x: 0, y: 0 }, { x: 8, y: 0 })).toThrow(RangeError);
  });
});

describe('hasLineOfSight: symmetry (D2)', () => {
  it('is blocked when the blocker is on either of the two lines', () => {
    // (0,0) to (2,1) is not a straight step: the line one way steps through (1,0), the other through
    // (1,1). Either of the two blocking is enough.
    expect(hasLineOfSight(makeBoard({ '1,0': 5 }), { x: 0, y: 0 }, { x: 2, y: 1 })).toBe(false);
    expect(hasLineOfSight(makeBoard({ '1,1': 5 }), { x: 0, y: 0 }, { x: 2, y: 1 })).toBe(false);
  });

  it('answers the same for every pair of cells of the three maps', () => {
    for (const map of PROTOTYPE_MAPS) {
      const board = boardOf(map);
      for (let ay = 0; ay < board.height; ay++) {
        for (let ax = 0; ax < board.width; ax++) {
          for (let by = 0; by < board.height; by++) {
            for (let bx = 0; bx < board.width; bx++) {
              const from = { x: ax, y: ay };
              const to = { x: bx, y: by };
              expect(hasLineOfSight(board, from, to), `${map.id} ${ax},${ay} to ${bx},${by}`).toBe(
                hasLineOfSight(board, to, from),
              );
            }
          }
        }
      }
    }
  });
});

describe('hasLineOfSight: positions outside the board', () => {
  it('refuses a position outside the board, like levelAt', () => {
    const board = makeBoard();

    expect(() => hasLineOfSight(board, { x: 0, y: 0 }, { x: 8, y: 0 })).toThrow(RangeError);
    expect(() => hasLineOfSight(board, { x: 0, y: -1 }, { x: 0, y: 0 })).toThrow(RangeError);
  });
});
