import { describe, expect, it } from 'vitest';
import {
  ACTION_BAR_RECT,
  ACTION_BUTTON,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CAROUSEL_RECT,
  CAROUSEL_SLOT,
  LEGEND_RECT,
  LOG_RECT,
  PANEL_RECT,
  PANEL_ROW_HEIGHT,
  RESULT_BUTTON_RECT,
  STATUS_RECT,
  boardBounds,
  buttonIndexAt,
  buttonRect,
  carouselSlotRect,
  hudRects,
  panelRowPoint,
  type Rect,
} from './layout';

/** The six rows of `unitPanel`, which is as many as the panel ever has to hold. */
const PANEL_ROWS = 6;
/** Six slots: both squads field three units. */
const CAROUSEL_SLOTS = 6;
/** Mover, Atacar, Recarregar, Terminar turno. */
const ACTION_BUTTONS = 4;
/** The six pieces of the HUD, in the order `hudRects` returns them. */
const HUD_NAMES = ['carousel', 'action bar', 'panel', 'log', 'legend', 'status'];

function right(rect: Rect): number {
  return rect.x + rect.width;
}

function bottom(rect: Rect): number {
  return rect.y + rect.height;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
}

describe('layout', () => {
  it('draws on a 1280x720 canvas', () => {
    expect(CANVAS_WIDTH).toBe(1280);
    expect(CANVAS_HEIGHT).toBe(720);
  });

  it('keeps every piece of the HUD inside the canvas', () => {
    const rects = hudRects();

    expect(rects).toHaveLength(HUD_NAMES.length);
    rects.forEach((rect, index) => {
      const name = HUD_NAMES[index];
      expect(rect.x, name).toBeGreaterThanOrEqual(0);
      expect(rect.y, name).toBeGreaterThanOrEqual(0);
      expect(right(rect), name).toBeLessThanOrEqual(CANVAS_WIDTH);
      expect(bottom(rect), name).toBeLessThanOrEqual(CANVAS_HEIGHT);
    });
  });

  it('floats the pieces over the board without any of them overlapping another', () => {
    const rects = hudRects();

    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(overlaps(rects[i], rects[j]), `${HUD_NAMES[i]} over ${HUD_NAMES[j]}`).toBe(false);
      }
    }
  });

  it('lists the pieces in the order the scene reads them', () => {
    expect(hudRects()).toEqual([
      CAROUSEL_RECT,
      ACTION_BAR_RECT,
      PANEL_RECT,
      LOG_RECT,
      LEGEND_RECT,
      STATUS_RECT,
    ]);
  });

  it('measures the board as the box every block of it fits in', () => {
    expect(boardBounds()).toEqual({ x: 320, y: 200, width: 640, height: 360 });
  });

  it('leaves the board clear of the carousel and the action bar', () => {
    const board = boardBounds();

    expect(overlaps(board, CAROUSEL_RECT)).toBe(false);
    expect(overlaps(board, ACTION_BAR_RECT)).toBe(false);
  });

  it('fits four buttons inside the action bar', () => {
    const needed = ACTION_BUTTONS * ACTION_BUTTON.width + (ACTION_BUTTONS - 1) * ACTION_BUTTON.gap;

    expect(needed).toBeLessThanOrEqual(ACTION_BAR_RECT.width);
    expect(right(buttonRect(ACTION_BUTTONS - 1))).toBeLessThanOrEqual(right(ACTION_BAR_RECT));
    expect(bottom(buttonRect(ACTION_BUTTONS - 1))).toBeLessThanOrEqual(bottom(ACTION_BAR_RECT));
  });

  it('places the buttons from the left edge of the bar, evenly spaced', () => {
    expect(buttonRect(0).x).toBe(ACTION_BAR_RECT.x);
    expect(buttonRect(0).y).toBe(ACTION_BAR_RECT.y);
    for (let i = 0; i < ACTION_BUTTONS - 1; i += 1) {
      expect(buttonRect(i + 1).x - buttonRect(i).x).toBe(ACTION_BUTTON.width + ACTION_BUTTON.gap);
    }
  });

  it('fits six slots inside the carousel', () => {
    const needed = CAROUSEL_SLOTS * CAROUSEL_SLOT.width + (CAROUSEL_SLOTS - 1) * CAROUSEL_SLOT.gap;

    expect(needed).toBeLessThanOrEqual(CAROUSEL_RECT.width);
    expect(right(carouselSlotRect(CAROUSEL_SLOTS - 1))).toBeLessThanOrEqual(right(CAROUSEL_RECT));
    expect(bottom(carouselSlotRect(CAROUSEL_SLOTS - 1))).toBeLessThanOrEqual(bottom(CAROUSEL_RECT));
  });

  it('places the slots from the left edge of the carousel, evenly spaced', () => {
    expect(carouselSlotRect(0).x).toBe(CAROUSEL_RECT.x);
    expect(carouselSlotRect(0).y).toBeGreaterThanOrEqual(CAROUSEL_RECT.y);
    for (let i = 0; i < CAROUSEL_SLOTS - 1; i += 1) {
      expect(carouselSlotRect(i + 1).x - carouselSlotRect(i).x).toBe(CAROUSEL_SLOT.width + CAROUSEL_SLOT.gap);
    }
  });

  it('fits the six panel rows inside the panel', () => {
    for (let index = 0; index < PANEL_ROWS; index += 1) {
      const point = panelRowPoint(index);
      expect(point.x, `row ${index}`).toBeGreaterThanOrEqual(PANEL_RECT.x);
      expect(point.y, `row ${index}`).toBeGreaterThanOrEqual(PANEL_RECT.y);
      expect(point.y + PANEL_ROW_HEIGHT, `row ${index}`).toBeLessThanOrEqual(bottom(PANEL_RECT));
    }
    expect(panelRowPoint(1).y - panelRowPoint(0).y).toBe(PANEL_ROW_HEIGHT);
  });
});

// DT-30: the four action buttons are hit-tested from the same rectangle that draws them, so a click
// on a drawn button is a click on that button and nothing else.
describe('buttonIndexAt', () => {
  const centre = (index: number) => {
    const rect = buttonRect(index);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  };

  it('no two buttons overlap, so the answer is never ambiguous', () => {
    for (let i = 0; i < ACTION_BUTTONS; i += 1) {
      for (let j = i + 1; j < ACTION_BUTTONS; j += 1) {
        expect(overlaps(buttonRect(i), buttonRect(j)), `${i} over ${j}`).toBe(false);
      }
    }
  });

  it('finds each button under its own centre', () => {
    for (let index = 0; index < ACTION_BUTTONS; index += 1) {
      expect(buttonIndexAt(centre(index)), `button ${index}`).toBe(index);
    }
  });

  it('finds each button under all four of its corners, less the far edge', () => {
    for (let index = 0; index < ACTION_BUTTONS; index += 1) {
      const rect = buttonRect(index);
      expect(buttonIndexAt({ x: rect.x, y: rect.y }), `top-left ${index}`).toBe(index);
      expect(buttonIndexAt({ x: right(rect) - 1, y: bottom(rect) - 1 }), `bottom-right ${index}`).toBe(index);
    }
  });

  it('treats the far edge as outside', () => {
    const rect = buttonRect(0);
    expect(buttonIndexAt({ x: right(rect), y: rect.y + 1 })).toBeNull();
    expect(buttonIndexAt({ x: rect.x + 1, y: bottom(rect) })).toBeNull();
  });

  it('answers nothing for the gap between two buttons', () => {
    const gapX = right(buttonRect(0)) + ACTION_BUTTON.gap / 2;
    expect(buttonIndexAt({ x: gapX, y: buttonRect(0).y + 1 })).toBeNull();
  });

  it('answers nothing above or below the bar', () => {
    const { x } = centre(0);
    expect(buttonIndexAt({ x, y: buttonRect(0).y - 1 })).toBeNull();
    expect(buttonIndexAt({ x, y: bottom(buttonRect(0)) })).toBeNull();
  });

  it('answers nothing for a click on the board or off the canvas', () => {
    expect(buttonIndexAt({ x: 640, y: 300 })).toBeNull();
    expect(buttonIndexAt({ x: -1, y: -1 })).toBeNull();
    expect(buttonIndexAt({ x: CANVAS_WIDTH, y: CANVAS_HEIGHT })).toBeNull();
  });

  it('places the way out of a finished match inside the canvas, clear of the carousel and the action bar', () => {
    const r = RESULT_BUTTON_RECT;
    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(r.y + r.height).toBeLessThanOrEqual(CANVAS_HEIGHT);
    expect(overlaps(r, CAROUSEL_RECT)).toBe(false);
    expect(overlaps(r, ACTION_BAR_RECT)).toBe(false);
  });
});
