import { describe, expect, it } from 'vitest';
import { terrainOf } from '../maps/terrain';
import { PROTOTYPE_MAPS } from '../maps/prototype-maps';
import { NO_FLOOR, type Cell } from './grid';
import { CAMERA_RECT, CAROUSEL_RECT, DASHBOARD_RECT, LOG_RECT, PADDING } from './layout';
import {
  HZ,
  PIXEL,
  SHADE_LEFT,
  SHADE_RIGHT,
  TILE_H,
  TILE_W,
  cellAt,
  cellToScreen,
  depthOfCell,
  depthOfUnit,
  shade,
  topFace,
} from './iso';

/** The board the client draws now: the prototype's 10x10, a size the state carries. */
const SIZE = { width: 10, height: 10 };

/**
 * Every level the prototype's relief reaches, from the street the rooftop looks down on to the
 * tallest roof. The board is no longer a four-tone one: heights are the prototype's own.
 */
const BOARD_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Every cell of a board, in reading order. */
function everyCell(size = SIZE): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) cells.push({ x, y });
  }
  return cells;
}

/** The ground of a flat board. */
const flat = () => 0;

describe('cellToScreen', () => {
  it('reproduces the checked values of the plan at 2x', () => {
    expect(cellToScreen({ x: 0, y: 0 }, 0)).toEqual({ x: 640, y: 216 });
    expect(cellToScreen({ x: 9, y: 0 }, 0)).toEqual({ x: 928, y: 360 });
    expect(cellToScreen({ x: 0, y: 9 }, 0)).toEqual({ x: 352, y: 360 });
    expect(cellToScreen({ x: 9, y: 9 }, 0)).toEqual({ x: 640, y: 504 });
    // 200 + (3 + 3 + 1) * 16 - 2 * 16 = 280: a block one level higher draws one HZ above the one below.
    expect(cellToScreen({ x: 3, y: 3 }, 2)).toEqual({ x: 640, y: 280 });
  });

  it('draws the prototype at twice its own resolution', () => {
    // The prototype's tile is 32x16 with a height step of 8, and the look is pixel art scaled by a
    // whole number: everything the projection speaks in is that number times the prototype's.
    expect(PIXEL).toBe(2);
    expect(TILE_W).toBe(32 * PIXEL);
    expect(TILE_H).toBe(16 * PIXEL);
    expect(HZ).toBe(8 * PIXEL);
  });

  it('pins the corner of the rooftop at its own height and its own lift', () => {
    // (0,0) of `roof` is 8 levels up, and the whole map is lowered by the prototype's 40: 80 of the
    // 640 canvas pixels the board is wide.
    expect(cellToScreen({ x: 0, y: 0 }, 8, 40)).toEqual({ x: 640, y: 168 });
  });

  it('lowers the whole map by the lift it is given, one canvas pixel per prototype pixel', () => {
    const flatAt = cellToScreen({ x: 3, y: 3 }, 0, 0);
    const lifted = cellToScreen({ x: 3, y: 3 }, 0, 40);

    expect(lifted).toEqual({ x: flatAt.x, y: flatAt.y + 40 * PIXEL });
  });

  it('lifts the centre one height step per level', () => {
    for (const cell of everyCell()) {
      for (const level of BOARD_LEVELS.slice(0, -1)) {
        const lower = cellToScreen(cell, level);
        const higher = cellToScreen(cell, level + 1);
        expect(higher.x, `${cell.x},${cell.y} at ${level}`).toBe(lower.x);
        expect(lower.y - higher.y, `${cell.x},${cell.y} at ${level}`).toBe(HZ);
      }
    }
  });
});

describe('topFace', () => {
  it('gives the four corners N, E, S and W, clockwise from the top', () => {
    expect(topFace({ x: 3, y: 3 }, 0)).toEqual([
      { x: 640, y: 296 },
      { x: 672, y: 312 },
      { x: 640, y: 328 },
      { x: 608, y: 312 },
    ]);
  });

  it('keeps every face around its own centre, half a tile out', () => {
    for (const cell of everyCell()) {
      const centre = cellToScreen(cell, 1);
      const [n, e, s, w] = topFace(cell, 1);
      const where = `${cell.x},${cell.y}`;
      expect(n.x, where).toBe(centre.x);
      expect(s.x, where).toBe(centre.x);
      expect(e.y, where).toBe(centre.y);
      expect(w.y, where).toBe(centre.y);
      expect(centre.y - n.y, where).toBe(TILE_H / 2);
      expect(s.y - centre.y, where).toBe(TILE_H / 2);
      expect(e.x - centre.x, where).toBe(TILE_W / 2);
      expect(centre.x - w.x, where).toBe(TILE_W / 2);
    }
  });

  it('follows the centre when the map is lifted', () => {
    const [n] = topFace({ x: 3, y: 3 }, 0, 40);

    expect(n.y).toBe(topFace({ x: 3, y: 3 }, 0)[0].y + 40 * PIXEL);
  });
});

describe('cellAt', () => {
  it('is the inverse of cellToScreen for every cell, at every level of the relief', () => {
    for (const level of BOARD_LEVELS) {
      const levelAt = () => level;
      for (const cell of everyCell()) {
        expect(cellAt(cellToScreen(cell, level), SIZE, levelAt), `${cell.x},${cell.y} at ${level}`).toEqual(
          cell,
        );
      }
    }
  });

  it('finds the cell under a point four pixels inside each corner of its top face', () => {
    for (const level of [0, 5, 11]) {
      for (const cell of everyCell()) {
        const [n, e, s, w] = topFace(cell, level);
        const inside = [
          { x: n.x, y: n.y + 4 },
          { x: e.x - 4, y: e.y },
          { x: s.x, y: s.y - 4 },
          { x: w.x + 4, y: w.y },
        ];
        for (const point of inside) {
          expect(
            cellAt(point, SIZE, () => level),
            `${cell.x},${cell.y} at level ${level}, point ${point.x},${point.y}`,
          ).toEqual(cell);
        }
      }
    }
  });

  it('returns null far outside the board, on both axes', () => {
    expect(cellAt({ x: -500, y: 300 }, SIZE, flat)).toBeNull();
    expect(cellAt({ x: 640, y: 900 }, SIZE, flat)).toBeNull();
  });

  it('picks the raised block over the flat cell drawn at the same point behind it', () => {
    // Lifting (3,3) to level 2 puts its top face centre on (640, 280), exactly where the flat top
    // face of (2,2) sits. (3,3) is the nearer of the two, so it is the one the player means.
    const levelAt = (cell: Cell) => (cell.x === 3 && cell.y === 3 ? 2 : 0);
    expect(cellAt({ x: 640, y: 280 }, SIZE, levelAt)).toEqual({ x: 3, y: 3 });
  });

  it('picks the block under a point on its right side face', () => {
    // The right face of the (3,3) block runs from its E corner (672, 280) to its S corner (640, 296)
    // and drops 2 * HZ. The point is three quarters along that edge and low enough that no flat top
    // face behind the block reaches it, but inside the block's own silhouette.
    const levelAt = (cell: Cell) => (cell.x === 3 && cell.y === 3 ? 2 : 0);
    expect(cellAt({ x: 664, y: 312 }, SIZE, levelAt)).toEqual({ x: 3, y: 3 });
  });

  it('picks the side face of the tallest block, higher up than a low one reaches', () => {
    // The rooftop's relief goes up to 11, so a block can stand eleven steps above the ground and its
    // side face has to stay pickable all the way down.
    const levelAt = (cell: Cell) => (cell.x === 3 && cell.y === 3 ? 11 : 0);
    expect(cellAt({ x: 664, y: 312 }, SIZE, levelAt)).toEqual({ x: 3, y: 3 });
  });

  it('stops at the edge of the board it is given', () => {
    // The same point is the far corner of a 10x10 board and nothing at all on a smaller one.
    const centreOfCorner = cellToScreen({ x: 9, y: 9 }, 0);

    expect(cellAt(centreOfCorner, SIZE, flat)).toEqual({ x: 9, y: 9 });
    expect(cellAt(centreOfCorner, { width: 8, height: 8 }, flat)).toBeNull();
  });

  it('never answers with a gap, wherever on the map it is asked', () => {
    // A gap has no floor: the rooftop's column of `v` is the street seen from above, twenty-odd
    // levels below the deck, and nothing can stand on it. `terrainOf` answers NO_FLOOR for those
    // cells, and the projection skips them — at their own centre included.
    const roof = terrainOf('roof');
    let asked = 0;

    for (let y = 96; y <= 648; y += 4) {
      for (let x = 320; x <= 960; x += 4) {
        const cell = cellAt({ x, y }, roof.size, roof.levelAt, roof.lift);
        asked += 1;
        if (cell) expect(roof.isVoid(cell), `${cell.x},${cell.y} from ${x},${y}`).toBe(false);
      }
    }

    expect(asked).toBeGreaterThan(1000);
  });

  it('does not answer with the gap cell at its own centre either', () => {
    const roof = terrainOf('roof');

    for (const cell of everyCell()) {
      if (!roof.isVoid(cell)) continue;

      // Where the gap's top face would have been drawn had it a floor at all: the lowest the map
      // reaches. Whatever the click lands on there, it is not the hole itself.
      const centre = cellToScreen(cell, 0, roof.lift);
      expect(cellAt(centre, roof.size, roof.levelAt, roof.lift), `${cell.x},${cell.y}`).not.toEqual(cell);
    }
  });

  it('reads the level of a gap as no floor at all', () => {
    const roof = terrainOf('roof');

    expect(roof.isVoid({ x: 6, y: 0 })).toBe(true);
    expect(roof.levelAt({ x: 6, y: 0 })).toBe(NO_FLOOR);
    expect(roof.levelAt({ x: 0, y: 0 })).toBe(8);
  });
});

describe('the board fits the space the HUD leaves', () => {
  it('keeps every top face of every map between the carousel and the action bar', () => {
    // The box the projection draws the play area in: the carousel's bottom edge above it, the action
    // bar's top edge below, and the two columns of panels beside it. The blocks' side faces run
    // further down than their tops on purpose — the prototype's facades dive behind its HUD too —
    // so what has to fit is what the player aims at.
    for (const map of PROTOTYPE_MAPS) {
      const terrain = terrainOf(map.id);

      for (const cell of everyCell()) {
        if (terrain.isVoid(cell)) continue;

        for (const corner of topFace(cell, terrain.levelAt(cell), terrain.lift)) {
          const where = `${map.id} ${cell.x},${cell.y} at ${corner.x},${corner.y}`;
          expect(corner.y, where).toBeGreaterThanOrEqual(CAROUSEL_RECT.y + CAROUSEL_RECT.height);
          // The dashboard runs the whole width of the bottom edge, so the board ends above it.
          expect(corner.y, where).toBeLessThanOrEqual(DASHBOARD_RECT.y);
          expect(corner.x, where).toBeGreaterThanOrEqual(PADDING);
          // The camera panel took the top of the right column when the log moved to the left one, so
          // the board ends where that column starts.
          expect(corner.x, where).toBeLessThanOrEqual(CAMERA_RECT.x);
        }
      }
    }
  });
});

describe('depth', () => {
  it('orders a cell by the diagonal it sits on', () => {
    expect(depthOfCell({ x: 1, y: 2 })).toBe(3);
    expect(depthOfUnit({ x: 1, y: 2 })).toBe(3.5);
  });

  it('draws a unit after its own cell and before the cell in front of it', () => {
    expect(depthOfUnit({ x: 1, y: 2 })).toBeGreaterThan(depthOfCell({ x: 1, y: 2 }));
    expect(depthOfUnit({ x: 1, y: 2 })).toBeLessThan(depthOfCell({ x: 2, y: 2 }));
  });
});

describe('shade', () => {
  it('multiplies every channel by the factor and rounds down', () => {
    expect(shade(0x23283a, 0.5)).toBe(0x11141d);
  });

  it('returns the colour unchanged at 1 and black at 0', () => {
    expect(shade(0x23283a, 1)).toBe(0x23283a);
    expect(shade(0x23283a, 0)).toBe(0x000000);
  });

  it('refuses a factor outside 0..1', () => {
    expect(() => shade(0x23283a, -0.1)).toThrow(RangeError);
    expect(() => shade(0x23283a, 1.1)).toThrow(RangeError);
  });

  it('darkens the right face more than the left one', () => {
    // The light in the prototype comes from the left, so the left face keeps more of the top colour.
    expect(SHADE_LEFT).toBeGreaterThan(SHADE_RIGHT);
    expect(SHADE_RIGHT).toBeGreaterThan(0);
  });

  // DT-61: a wall's side face is the wall's, even where a flat cell behind it reaches the same pixel.
  it('gives a wall\'s side face to the wall, not to the flat cell hidden behind it', () => {
    const size = { width: 10, height: 10 };
    const levels = (cell: Cell) => (cell.x === 5 && cell.y === 5 ? 3 : 0);
    const wall = cellToScreen({ x: 5, y: 5 }, 3, 0);
    const ground = cellToScreen({ x: 5, y: 5 }, 0, 0);
    const sideFace = { x: wall.x + 20, y: (wall.y + ground.y) / 2 + 8 };

    expect(cellAt(sideFace, size, levels)).toEqual({ x: 5, y: 5 });
  });

  it('keeps the top of a wall for the wall, and a flat cell in front of it for that cell', () => {
    const size = { width: 10, height: 10 };
    const levels = (cell: Cell) => (cell.x === 5 && cell.y === 5 ? 3 : 0);
    const wall = cellToScreen({ x: 5, y: 5 }, 3, 0);
    const front = cellToScreen({ x: 6, y: 6 }, 0, 0);

    expect(cellAt({ x: wall.x, y: wall.y }, size, levels)).toEqual({ x: 5, y: 5 });
    expect(cellAt({ x: front.x, y: front.y }, size, levels)).toEqual({ x: 6, y: 6 });
  });
});
