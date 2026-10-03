import { describe, expect, it } from 'vitest';
import { BOARD_HEIGHT, BOARD_WIDTH, ORIGIN, TILE_SIZE } from './grid';
import {
  ACTION_BAR_RECT,
  ACTION_BUTTON,
  BOARD_RECT,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CAROUSEL_RECT,
  CAROUSEL_SLOT,
  LEGEND_Y,
  LOG_RECT,
  PANEL_RECT,
  PANEL_ROW_HEIGHT,
  SIDEBAR,
  STATUS_Y,
  buttonRect,
  carouselSlotRect,
  panelRowPoint,
  type Rect,
} from './layout';

/** The six rows of `unitPanel`, which is as many as the panel ever has to hold. */
const PANEL_ROWS = 6;
/** Six slots: both squads field three units. */
const CAROUSEL_SLOTS = 6;
/** Mover, Atacar, Recarregar, Terminar turno. */
const ACTION_BUTTONS = 4;

const SIDEBAR_PIECES: [string, Rect][] = [
  ['carousel', CAROUSEL_RECT],
  ['action bar', ACTION_BAR_RECT],
  ['panel', PANEL_RECT],
  ['log', LOG_RECT],
];

const EVERY_PIECE: [string, Rect][] = [['board', BOARD_RECT], ...SIDEBAR_PIECES];

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

  it('keeps every rectangle inside the canvas', () => {
    for (const [name, rect] of EVERY_PIECE) {
      expect(rect.x, name).toBeGreaterThanOrEqual(0);
      expect(rect.y, name).toBeGreaterThanOrEqual(0);
      expect(right(rect), name).toBeLessThanOrEqual(CANVAS_WIDTH);
      expect(bottom(rect), name).toBeLessThanOrEqual(CANVAS_HEIGHT);
    }
  });

  it('leaves the board where it was, clear of the sidebar', () => {
    expect(BOARD_RECT).toEqual({
      x: ORIGIN.x,
      y: ORIGIN.y,
      width: BOARD_WIDTH * TILE_SIZE,
      height: BOARD_HEIGHT * TILE_SIZE,
    });
    expect(right(BOARD_RECT)).toBeLessThan(SIDEBAR.x);
  });

  it('keeps every sidebar piece inside the sidebar', () => {
    for (const [name, rect] of SIDEBAR_PIECES) {
      expect(rect.x, name).toBeGreaterThanOrEqual(SIDEBAR.x);
      expect(right(rect), name).toBeLessThanOrEqual(SIDEBAR.x + SIDEBAR.width);
    }
  });

  it('stacks the sidebar pieces without overlapping each other', () => {
    for (let i = 0; i < SIDEBAR_PIECES.length; i += 1) {
      for (let j = i + 1; j < SIDEBAR_PIECES.length; j += 1) {
        const [nameA, rectA] = SIDEBAR_PIECES[i];
        const [nameB, rectB] = SIDEBAR_PIECES[j];
        expect(overlaps(rectA, rectB), `${nameA} over ${nameB}`).toBe(false);
      }
    }
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

  it('puts the legend and the status line under the board, clear of the sidebar', () => {
    expect(LEGEND_Y).toBeGreaterThanOrEqual(bottom(BOARD_RECT));
    expect(STATUS_Y).toBeGreaterThan(LEGEND_Y);
    expect(STATUS_Y).toBeLessThan(CANVAS_HEIGHT);
    expect(ORIGIN.x).toBeLessThan(SIDEBAR.x);
  });
});
