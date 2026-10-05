import { describe, expect, it } from 'vitest';
import { LAYER } from './depth';
import { depthOfCell, depthOfUnit } from './iso';
import type { Cell } from './grid';

// DT-47 — the order of the match's layers, checked in Node. The scenes draw with these values, so an
// order broken here is an effect or a unit drawn in the wrong layer on screen.

/** A 10x10 board: the largest the prototype ships. */
const SIZE = 10;

function everyCell(): Cell[] {
  const cells: Cell[] = [];
  for (let x = 0; x < SIZE; x += 1) {
    for (let y = 0; y < SIZE; y += 1) cells.push({ x, y });
  }
  return cells;
}

describe('the board layers', () => {
  it('draws the highlight of a cell above the cell and below the unit standing on it', () => {
    for (const cell of everyCell()) {
      expect(LAYER.highlight(cell)).toBeGreaterThan(depthOfCell(cell));
      expect(LAYER.highlight(cell)).toBeLessThan(depthOfUnit(cell));
    }
  });

  it('draws a unit above the board of its own cell and below the board of the next cell', () => {
    for (const cell of everyCell()) {
      const next = { x: cell.x + 1, y: cell.y };
      if (next.x >= SIZE) continue;

      expect(depthOfCell(cell)).toBeLessThan(depthOfUnit(cell));
      expect(depthOfUnit(cell)).toBeLessThan(depthOfCell(next));
    }
  });

  it('draws the backdrop below every cell of the board', () => {
    for (const cell of everyCell()) {
      expect(LAYER.backdrop).toBeLessThan(depthOfCell(cell));
    }
  });

  it('draws the map overlay above every cell and every unit, and below the effects', () => {
    const deepest = everyCell().reduce((max, cell) => Math.max(max, depthOfUnit(cell)), -Infinity);

    expect(LAYER.overlay).toBeGreaterThan(deepest);
    expect(LAYER.overlay).toBeLessThan(LAYER.effect);
  });

  it('draws the effects above every piece of the board', () => {
    const deepest = everyCell().reduce((max, cell) => Math.max(max, depthOfUnit(cell)), -Infinity);

    expect(LAYER.effect).toBeGreaterThan(deepest);
  });

  it('keeps the HUD out of the numeric order: it is drawn above by its scene, not by a depth', () => {
    expect(LAYER.hud).toBe('scene-order');
  });
});
