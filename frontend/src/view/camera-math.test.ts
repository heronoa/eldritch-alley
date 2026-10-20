import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, clampPan, isTap, snapZoom, zoomAround } from './camera-math';
import type { Rect } from './layout';

const CANVAS = { width: 1280, height: 720 };
const CENTRE = { x: CANVAS.width / 2, y: CANVAS.height / 2 };
const BOARD: Rect = { x: 320, y: 200, width: 640, height: 360 };

/** Where a world point lands on the canvas for a view, which is what the focal point is read in. */
function toScreen(
  view: { zoom: number; centre: { x: number; y: number } },
  world: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: CENTRE.x + (world.x - view.centre.x) * view.zoom,
    y: CENTRE.y + (world.y - view.centre.y) * view.zoom,
  };
}

/** The world point under a point of the canvas. */
function under(view: { zoom: number; centre: { x: number; y: number } }, point: { x: number; y: number }) {
  return {
    x: view.centre.x + (point.x - CENTRE.x) / view.zoom,
    y: view.centre.y + (point.y - CENTRE.y) / view.zoom,
  };
}

describe('snapZoom', () => {
  it('answers a whole step of the four the camera has', () => {
    expect(snapZoom(1)).toBe(1);
    expect(snapZoom(1.4)).toBe(1);
    expect(snapZoom(1.6)).toBe(2);
    expect(snapZoom(2)).toBe(2);
    expect(snapZoom(3.5)).toBe(4);
    expect(snapZoom(4)).toBe(4);
  });

  it('stays between the whole board and the closest view, whichever way it is asked', () => {
    expect(snapZoom(0.2)).toBe(MIN_ZOOM);
    expect(snapZoom(0)).toBe(MIN_ZOOM);
    expect(snapZoom(9)).toBe(MAX_ZOOM);
  });
});

describe('zoomAround', () => {
  it('keeps the world point under the fingers in place when zooming in', () => {
    const view = { zoom: 2, centre: { x: 640, y: 380 } };
    const focal = { x: 700, y: 400 };
    const before = under(view, focal);

    const next = zoomAround(view, focal, 4, BOARD, CANVAS);

    const after = toScreen(next, before);
    expect(Math.abs(after.x - focal.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - focal.y)).toBeLessThanOrEqual(1);
  });

  it('keeps the world point under the fingers in place when zooming out', () => {
    const view = { zoom: 4, centre: { x: 655, y: 390 } };
    const focal = { x: 700, y: 400 };
    const before = under(view, focal);

    const next = zoomAround(view, focal, 2, BOARD, CANVAS);

    const after = toScreen(next, before);
    expect(Math.abs(after.x - focal.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - focal.y)).toBeLessThanOrEqual(1);
  });

  it('holds the zoom between the whole board and the closest view', () => {
    const view = { zoom: 2, centre: { x: 640, y: 380 } };

    expect(zoomAround(view, CENTRE, 0.5, BOARD, CANVAS).zoom).toBe(MIN_ZOOM);
    expect(zoomAround(view, CENTRE, 99, BOARD, CANVAS).zoom).toBe(MAX_ZOOM);
  });

  it('keeps a fractional zoom while the fingers are still moving', () => {
    const view = { zoom: 2, centre: { x: 640, y: 380 } };

    expect(zoomAround(view, CENTRE, 2.4, BOARD, CANVAS).zoom).toBe(2.4);
  });

  it('leaves the centre inside the pan limit, zooming at the very corner of the canvas', () => {
    const view = { zoom: 2, centre: { x: 640, y: 380 } };

    const next = zoomAround(view, { x: 0, y: 0 }, 4, BOARD, CANVAS);

    expect(next.centre).toEqual(clampPan(next.centre, next.zoom, BOARD, CANVAS));
  });
});

describe('clampPan', () => {
  it('lets the board be dragged a quarter of the screen past its edge, and no more', () => {
    // At 3x the board is wider than the canvas, so the centre may travel until its edge sits a
    // quarter of the canvas inside the canvas edge.
    const centre = clampPan({ x: 99999, y: 99999 }, 3, BOARD, CANVAS);

    expect(centre.x).toBeCloseTo(640 + (BOARD.width / 2 - CANVAS.width / 2 / 3) + CANVAS.width / 4 / 3);
    expect(centre.y).toBeCloseTo(380 + (BOARD.height / 2 - CANVAS.height / 2 / 3) + CANVAS.height / 4 / 3);
  });

  it('lets a board smaller than the canvas be dragged a quarter of the screen about its middle', () => {
    // At 1x the whole board fits with room to spare: the quarter of a screen is all the travel there
    // is, so the board can be pushed until its edge reaches the edge of the canvas.
    const centre = clampPan({ x: -99999, y: -99999 }, 1, BOARD, CANVAS);

    expect(centre.x).toBe(640 - CANVAS.width / 4);
    expect(centre.y).toBe(380 - CANVAS.height / 4);
  });

  it('leaves a centre that is already inside the limit where it is', () => {
    expect(clampPan({ x: 700, y: 400 }, 2, BOARD, CANVAS)).toEqual({ x: 700, y: 400 });
  });
});

describe('isTap', () => {
  it('counts a gesture under the threshold as a tap', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
    // Three and four across is five on the diagonal.
    expect(isTap({ x: 100, y: 100 }, { x: 103, y: 104 })).toBe(true);
  });

  it('counts the threshold itself, and anything past it, as a pan', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 106, y: 100 })).toBe(false);
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 106 })).toBe(false);
    expect(isTap({ x: 100, y: 100 }, { x: 120, y: 130 })).toBe(false);
  });
});
