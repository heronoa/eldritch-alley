import { describe, expect, it } from 'vitest';
import { BOARD_HEIGHT, BOARD_WIDTH, type Cell } from './grid';
import {
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

const LEVELS = [0, 1, 2];

/** Every cell of the 8x8 board. */
function everyCell(): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) cells.push({ x, y });
  }
  return cells;
}

describe('cellToScreen', () => {
  it('reproduces the checked values of the plan', () => {
    expect(cellToScreen({ x: 0, y: 0 }, 0)).toEqual({ x: 640, y: 220 });
    expect(cellToScreen({ x: 7, y: 0 }, 0)).toEqual({ x: 920, y: 360 });
    expect(cellToScreen({ x: 0, y: 7 }, 0)).toEqual({ x: 360, y: 360 });
    expect(cellToScreen({ x: 7, y: 7 }, 0)).toEqual({ x: 640, y: 500 });
    // 200 + (3 + 3 + 1) * 20 - 2 * 20 = 300. The plan's table gives 340 for this row, which is the
    // level-0 value of the same cell; the formula the plan declares fixed gives 300, and a block one
    // level higher has to draw one HZ above the one below it.
    expect(cellToScreen({ x: 3, y: 3 }, 2)).toEqual({ x: 640, y: 300 });
  });

  it('lifts the centre one height step per level', () => {
    for (const cell of everyCell()) {
      for (const level of [0, 1]) {
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
      { x: 640, y: 320 },
      { x: 680, y: 340 },
      { x: 640, y: 360 },
      { x: 600, y: 340 },
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
        expect(cellAt(cellToScreen(cell, level), levelAt), `${cell.x},${cell.y} at ${level}`).toEqual(cell);
      }
    }
  });

  it('finds the cell under a point four pixels inside each corner of its top face', () => {
    const levelAt = () => 0;
    for (const cell of everyCell()) {
      const [n, e, s, w] = topFace(cell, 0);
      const inside = [
        { x: n.x, y: n.y + 4 },
        { x: e.x - 4, y: e.y },
        { x: s.x, y: s.y - 4 },
        { x: w.x + 4, y: w.y },
      ];
      for (const point of inside) {
        expect(cellAt(point, levelAt), `${cell.x},${cell.y} at ${point.x},${point.y}`).toEqual(cell);
      }
    }
  });

  it('returns null far outside the board, on both axes', () => {
    const levelAt = () => 0;
    expect(cellAt({ x: -500, y: 300 }, levelAt)).toBeNull();
    expect(cellAt({ x: 640, y: 900 }, levelAt)).toBeNull();
  });

  it('picks the raised block over the flat cell drawn at the same point behind it', () => {
    // Lifting (3,3) to level 2 puts its top face on (640, 300), where the flat top face of (2,2)
    // sits. (3,3) is the nearer of the two, so it is the one the player means.
    const levelAt = (cell: Cell) => (cell.x === 3 && cell.y === 3 ? 2 : 0);
    expect(cellAt({ x: 640, y: 300 }, levelAt)).toEqual({ x: 3, y: 3 });
  });

  it('picks the block under a point on its right side face', () => {
    // The right face of the (3,3) block runs from S (640, 320) and E (680, 300) down 2 * HZ. The
    // point is 0.75 along S->E and 0.95 down the face: inside the face, outside every flat top face,
    // and inside the block's own silhouette (rule 3).
    const levelAt = (cell: Cell) => (cell.x === 3 && cell.y === 3 ? 2 : 0);
    expect(cellAt({ x: 670, y: 343 }, levelAt)).toEqual({ x: 3, y: 3 });
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
});
