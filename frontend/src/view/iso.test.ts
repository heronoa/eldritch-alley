import { describe, expect, it } from 'vitest';
import type { Cell } from './grid';
import { HUD_DEPTH } from './layout';
import {
  EFFECT_DEPTH,
  HZ,
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

/** Every level the board can carry, the wall included. */
const LEVELS = [0, 1, 2, 3];

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
  it('reproduces the checked values of the plan at the new scale', () => {
    expect(cellToScreen({ x: 0, y: 0 }, 0)).toEqual({ x: 640, y: 216 });
    expect(cellToScreen({ x: 9, y: 0 }, 0)).toEqual({ x: 928, y: 360 });
    expect(cellToScreen({ x: 0, y: 9 }, 0)).toEqual({ x: 352, y: 360 });
    expect(cellToScreen({ x: 9, y: 9 }, 0)).toEqual({ x: 640, y: 504 });
    // 200 + (3 + 3 + 1) * 16 - 2 * 16 = 280: a block one level higher draws one HZ above the one below.
    expect(cellToScreen({ x: 3, y: 3 }, 2)).toEqual({ x: 640, y: 280 });
  });

  it('lifts the centre one height step per level', () => {
    for (const cell of everyCell()) {
      for (const level of LEVELS.slice(0, -1)) {
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
});

describe('cellAt', () => {
  it('is the inverse of cellToScreen for every cell, at every level', () => {
    for (const level of LEVELS) {
      const levelAt = () => level;
      for (const cell of everyCell()) {
        expect(cellAt(cellToScreen(cell, level), SIZE, levelAt), `${cell.x},${cell.y} at ${level}`).toEqual(
          cell,
        );
      }
    }
  });

  it('finds the cell under a point four pixels inside each corner of its top face', () => {
    for (const cell of everyCell()) {
      const [n, e, s, w] = topFace(cell, 0);
      const inside = [
        { x: n.x, y: n.y + 4 },
        { x: e.x - 4, y: e.y },
        { x: s.x, y: s.y - 4 },
        { x: w.x + 4, y: w.y },
      ];
      for (const point of inside) {
        expect(cellAt(point, SIZE, flat), `${cell.x},${cell.y} at ${point.x},${point.y}`).toEqual(cell);
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

  it('picks the side face of a level-3 wall, higher up than a level-2 block reaches', () => {
    // A four-tone board has to pick as well as a three-tone one. The wall's right face starts one HZ
    // higher than the same block at level 2, and the point sits in that extra band.
    const levelAt = (cell: Cell) => (cell.x === 3 && cell.y === 3 ? 3 : 0);
    expect(cellAt({ x: 664, y: 310 }, SIZE, levelAt)).toEqual({ x: 3, y: 3 });
  });

  it('stops at the edge of the board it is given', () => {
    // The same point is the far corner of a 10x10 board and nothing at all on a smaller one.
    const centreOfCorner = cellToScreen({ x: 9, y: 9 }, 0);

    expect(cellAt(centreOfCorner, SIZE, flat)).toEqual({ x: 9, y: 9 });
    expect(cellAt(centreOfCorner, { width: 8, height: 8 }, flat)).toBeNull();
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

  it('draws the effects above every piece of the board and below the HUD', () => {
    // A 10x10 board reaches 18.5 at its far corner, four steps deeper than the 8x8 board this
    // constant was chosen for. The margin is checked here so a bigger board fails loudly.
    const deepest = { x: SIZE.width - 1, y: SIZE.height - 1 };

    expect(EFFECT_DEPTH).toBeGreaterThan(depthOfUnit(deepest));
    expect(EFFECT_DEPTH).toBeLessThan(HUD_DEPTH);
  });
});
