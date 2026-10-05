import { describe, expect, it } from 'vitest';
import { clampCentre, MAX_ZOOM, MIN_ZOOM, zoomAbout } from './camera';
import type { Rect } from './layout';

const CANVAS = { width: 1280, height: 720 };
const CENTRE = { x: CANVAS.width / 2, y: CANVAS.height / 2 };
const BOARD: Rect = { x: 320, y: 200, width: 640, height: 360 };

/** Where a world point lands on the canvas for a view. */
function toScreen(view: { zoom: number; centre: { x: number; y: number } }, world: { x: number; y: number }) {
  return { x: CENTRE.x + (world.x - view.centre.x) * view.zoom, y: CENTRE.y + (world.y - view.centre.y) * view.zoom };
}

describe('zoomAbout', () => {
  // Only where the board does not fit the canvas can the camera hold a point: at the whole-board zoom
  // the centre is pinned to the middle, so the point moves with it, as it should.
  it('keeps the world point under the cursor in place when zooming in, away from the board edges', () => {
    const view = { zoom: 2.2, centre: { x: 640, y: 380 } };
    const cursor = { x: 700, y: 400 };
    const before = { x: view.centre.x + (cursor.x - CENTRE.x) / view.zoom, y: view.centre.y + (cursor.y - CENTRE.y) / view.zoom };

    const next = zoomAbout(view, cursor, CENTRE, 2.5 / 2.2, BOARD, CANVAS);

    const after = toScreen(next, before);
    expect(Math.abs(after.x - cursor.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - cursor.y)).toBeLessThanOrEqual(1);
  });

  it('keeps the world point under the cursor in place when zooming out, away from the board edges', () => {
    const view = { zoom: 2.5, centre: { x: 640, y: 380 } };
    const cursor = { x: 500, y: 300 };
    const before = { x: view.centre.x + (cursor.x - CENTRE.x) / view.zoom, y: view.centre.y + (cursor.y - CENTRE.y) / view.zoom };

    const next = zoomAbout(view, cursor, CENTRE, 2.2 / 2.5, BOARD, CANVAS);

    const after = toScreen(next, before);
    expect(Math.abs(after.x - cursor.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - cursor.y)).toBeLessThanOrEqual(1);
  });

  it('never zooms below the whole board or above the limit', () => {
    const view = { zoom: 1, centre: { x: 640, y: 360 } };

    expect(zoomAbout(view, CENTRE, CENTRE, 0.1, BOARD, CANVAS).zoom).toBe(MIN_ZOOM);
    const max = { zoom: MAX_ZOOM, centre: { x: 640, y: 360 } };
    expect(zoomAbout(max, CENTRE, CENTRE, 10, BOARD, CANVAS).zoom).toBe(MAX_ZOOM);
  });

  it('keeps the centre inside the board when zooming at its edge', () => {
    const view = { zoom: 2, centre: { x: 640, y: 360 } };
    const edge = { x: 60, y: 60 };

    const next = zoomAbout(view, edge, CENTRE, 1.25, BOARD, CANVAS);

    const halfWidth = CANVAS.width / 2 / next.zoom;
    expect(next.centre.x).toBeGreaterThanOrEqual(BOARD.x + halfWidth - 1e-9);
  });
});

describe('clampCentre', () => {
  it('puts the centre in the middle of the board at the whole-board zoom', () => {
    expect(clampCentre({ x: 0, y: 0 }, 1, BOARD, CANVAS)).toEqual({ x: 640, y: 380 });
  });

  it('keeps the visible part inside the board when zoomed in', () => {
    const centre = clampCentre({ x: 10000, y: -10000 }, 2, BOARD, CANVAS);

    expect(centre.x).toBeLessThanOrEqual(BOARD.x + BOARD.width - CANVAS.width / 2 / 2 + 1e-9);
    expect(centre.y).toBeGreaterThanOrEqual(BOARD.y + CANVAS.height / 2 / 2 - 1e-9);
  });
});
