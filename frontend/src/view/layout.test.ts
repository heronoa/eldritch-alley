import { describe, expect, it } from 'vitest';
import { terrainOf } from '../maps/terrain';
import { PROTOTYPE_MAPS } from '../maps/prototype-maps';
import type { Cell } from './grid';
import { topFace } from './iso';
import {
  ACTION_BAR_RECT,
  ACTION_BUTTON,
  ACTION_HINT_RECT,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CAROUSEL_RECT,
  CAROUSEL_SLOT,
  DASHBOARD_AMMO_RECT,
  DASHBOARD_CELL,
  DASHBOARD_HEALTH_RECT,
  DASHBOARD_RECT,
  DASHBOARD_TURN_RECT,
  INSPECT_CLOSE_RECT,
  INSPECT_RECT,
  INSPECT_VALUE_X,
  CAMERA_RECT,
  LEGEND_RECT,
  LOG_HEADER_HEIGHT,
  LOG_LINE_HEIGHT,
  LOG_LINES,
  LOG_RECT,
  LOG_TEXT_POINT,
  LOG_TOGGLE_POINT,
  LOG_TOGGLE_RECT,
  MOVE_CHIP,
  MOVE_CHIPS,
  PADDING,
  PANEL_ROW_HEIGHT,
  RESULT_BUTTON_RECT,
  STATUS_RECT,
  CAMERA_CONTROLS,
  boardBounds,
  buttonIndexAt,
  buttonRect,
  cameraControlAt,
  cameraControlRect,
  carouselSlotIndexAt,
  carouselSlotRect,
  containsPoint,
  hudRects,
  inspectRowPoint,
  logRect,
  moveChipRect,
  type CameraControl,
  type Rect,
} from './layout';

/** Six slots: both squads field three units. */
const CAROUSEL_SLOTS = 6;
/** Mover, Atacar, Recarregar, Terminar turno. */
const ACTION_BUTTONS = 4;
/** The four pieces of the HUD, in the order `hudRects` returns them. */
const HUD_NAMES = ['carousel', 'dashboard', 'legend', 'status'];

/** The board the client draws now: the prototype's 10x10, a size the state carries. */
const BOARD_SIZE = { width: 10, height: 10 };

/** Every cell of that board, in reading order. */
function everyCell(): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < BOARD_SIZE.height; y += 1) {
    for (let x = 0; x < BOARD_SIZE.width; x += 1) cells.push({ x, y });
  }
  return cells;
}

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
    expect(hudRects()).toEqual([CAROUSEL_RECT, DASHBOARD_RECT, LEGEND_RECT, STATUS_RECT]);
  });

  it('measures a flat board as the box its top faces fill', () => {
    // The west corner of the leftmost cell to the east corner of the rightmost, and the top vertex
    // of the first cell down to the front corner of the last.
    expect(boardBounds(BOARD_SIZE, () => 0)).toEqual({ x: 320, y: 200, width: 640, height: 320 });
  });

  it('measures each map as the box of its own relief', () => {
    // The street's tallest cells are the buildings of its first row, six and seven levels up; its
    // lowest ground is the parking lot in front, at zero. The box is the relief, not a level range.
    const street = terrainOf('street');

    expect(boardBounds(BOARD_SIZE, street.levelAt, street.lift)).toEqual({
      x: 320,
      y: 104,
      width: 640,
      height: 416,
    });
  });

  it('holds every top face of every map', () => {
    for (const map of PROTOTYPE_MAPS) {
      const terrain = terrainOf(map.id);
      const board = boardBounds(BOARD_SIZE, terrain.levelAt, terrain.lift);

      for (const cell of everyCell()) {
        if (terrain.isVoid(cell)) continue;

        for (const corner of topFace(cell, terrain.levelAt(cell), terrain.lift)) {
          const where = `${map.id} ${cell.x},${cell.y}`;
          expect(corner.x, where).toBeGreaterThanOrEqual(board.x);
          expect(corner.x, where).toBeLessThanOrEqual(right(board));
          expect(corner.y, where).toBeGreaterThanOrEqual(board.y);
          expect(corner.y, where).toBeLessThanOrEqual(bottom(board));
        }
      }
    }
  });

  it('leaves every map clear of the pieces of the HUD', () => {
    for (const map of PROTOTYPE_MAPS) {
      const terrain = terrainOf(map.id);
      const board = boardBounds(BOARD_SIZE, terrain.levelAt, terrain.lift);

      expect(overlaps(board, CAROUSEL_RECT), map.id).toBe(false);
      expect(overlaps(board, ACTION_BAR_RECT), map.id).toBe(false);
      // The dashboard runs the whole width of the bottom edge, so the map has to end above it.
      expect(bottom(board), map.id).toBeLessThanOrEqual(DASHBOARD_RECT.y);
    }
  });

  it('keeps every map clear of the column the camera panel sits in', () => {
    // The camera panel floats over the board against the right edge, so the board fits beside it.
    for (const map of PROTOTYPE_MAPS) {
      const terrain = terrainOf(map.id);
      const board = boardBounds(BOARD_SIZE, terrain.levelAt, terrain.lift);

      expect(right(board), map.id).toBeLessThanOrEqual(CAMERA_RECT.x);
    }
  });

  it('grows with the size it is given', () => {
    const small = boardBounds({ width: 8, height: 8 }, () => 0);
    const large = boardBounds(BOARD_SIZE, () => 0);

    expect(small.width).toBeLessThan(large.width);
    expect(small.height).toBeLessThan(large.height);
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

});

// Smoke test 2, slice B: the unit's data moves from the left column to a band along the bottom edge,
// so the board keeps the middle of the screen. Every part of that band has to be inside the canvas,
// inside the band, and clear of every other part.
describe('the dashboard', () => {
  const PARTS = [DASHBOARD_HEALTH_RECT, ACTION_BAR_RECT, DASHBOARD_AMMO_RECT, DASHBOARD_TURN_RECT];

  it('runs along the bottom edge of the canvas', () => {
    expect(DASHBOARD_RECT.x).toBe(PADDING);
    expect(right(DASHBOARD_RECT)).toBe(CANVAS_WIDTH - PADDING);
    expect(bottom(DASHBOARD_RECT)).toBe(CANVAS_HEIGHT - PADDING);
  });

  it('holds every part of the unit’s data and the buttons', () => {
    for (const part of PARTS) {
      expect(part.x, 'left').toBeGreaterThanOrEqual(DASHBOARD_RECT.x);
      expect(right(part), 'right').toBeLessThanOrEqual(right(DASHBOARD_RECT));
      expect(part.y, 'top').toBeGreaterThanOrEqual(DASHBOARD_RECT.y);
      expect(bottom(part), 'bottom').toBeLessThanOrEqual(bottom(DASHBOARD_RECT));
    }
  });

  it('gives each part a place of its own', () => {
    for (let i = 0; i < PARTS.length; i += 1) {
      for (let j = i + 1; j < PARTS.length; j += 1) {
        expect(overlaps(PARTS[i], PARTS[j]), `${i} over ${j}`).toBe(false);
      }
    }
  });

  it('keeps the action bar centred on the canvas, between the two cells', () => {
    expect(ACTION_BAR_RECT.x + ACTION_BAR_RECT.width / 2).toBe(CANVAS_WIDTH / 2);
    expect(right(DASHBOARD_HEALTH_RECT)).toBeLessThan(ACTION_BAR_RECT.x);
    expect(DASHBOARD_AMMO_RECT.x).toBeGreaterThan(right(ACTION_BAR_RECT));
  });

  it('fits the label and the bar of a cell side by side', () => {
    const needed = 2 * DASHBOARD_CELL.inset + DASHBOARD_CELL.width;

    expect(needed).toBeLessThanOrEqual(ACTION_BAR_RECT.x - DASHBOARD_RECT.x);
    expect(2 * needed).toBeLessThanOrEqual(DASHBOARD_RECT.width);
  });

  it('floats the chips of a pending move and the hint above the dashboard', () => {
    for (let index = 0; index < MOVE_CHIPS; index += 1) {
      expect(bottom(moveChipRect(index)), `chip ${index}`).toBeLessThanOrEqual(DASHBOARD_RECT.y);
      expect(moveChipRect(index).x).toBeGreaterThanOrEqual(DASHBOARD_RECT.x);
      expect(right(moveChipRect(index))).toBeLessThanOrEqual(right(DASHBOARD_RECT));
    }

    expect(bottom(ACTION_HINT_RECT)).toBeLessThanOrEqual(moveChipRect(0).y);
  });

  it('gives a chip room for the label it carries (DT-83)', () => {
    // The text of a chip is drawn at 18 px with its own leading; 32 leaves it that and a padding.
    expect(MOVE_CHIP.height).toBeGreaterThanOrEqual(32);
    expect(MOVE_CHIP.height).toBeLessThanOrEqual(DASHBOARD_RECT.y);
  });
});

// Smoke test 2, slices B and C: the log leaves the right column — which the camera panel takes — for
// the left one the dashboard freed, and by default it is closed, showing its header and the last line.
describe('the log', () => {
  it('starts closed, with its header and one line of text', () => {
    const closed = logRect(false);

    expect(closed.height).toBe(LOG_TOGGLE_RECT.height + LOG_LINE_HEIGHT);
    expect(LOG_TEXT_POINT.y).toBeGreaterThanOrEqual(LOG_TOGGLE_RECT.y + LOG_TOGGLE_RECT.height);
    expect(LOG_TEXT_POINT.y + LOG_LINE_HEIGHT).toBeLessThanOrEqual(bottom(closed));
  });

  it('fits every line it keeps inside the open box', () => {
    expect(LOG_TEXT_POINT.y + LOG_LINES * LOG_LINE_HEIGHT).toBeLessThanOrEqual(bottom(logRect(true)));
    expect(bottom(logRect(true))).toBeLessThanOrEqual(bottom(LOG_RECT));
  });

  it('keeps the header in the same place whether the box is open or closed', () => {
    expect(logRect(false).x).toBe(logRect(true).x);
    expect(logRect(false).y).toBe(logRect(true).y);
    expect(LOG_TOGGLE_RECT.y).toBe(LOG_RECT.y);
    expect(LOG_TOGGLE_RECT.height).toBeLessThan(LOG_RECT.height);
  });

  it('lies in the left column, clear of the dashboard and of the legend', () => {
    expect(LOG_RECT.x).toBeGreaterThanOrEqual(0);
    expect(right(LOG_RECT)).toBeLessThanOrEqual(DASHBOARD_RECT.x + DASHBOARD_RECT.width);
    // The legend and the status line keep the bottom of that same column.
    expect(bottom(logRect(true))).toBeLessThanOrEqual(LEGEND_RECT.y);
  });

  it('puts its toggle where the header is, right of the middle of the box', () => {
    expect(containsPoint(LOG_TOGGLE_RECT, LOG_TOGGLE_POINT)).toBe(true);
    expect(LOG_TOGGLE_POINT.x).toBeGreaterThan(LOG_TOGGLE_RECT.x + LOG_TOGGLE_RECT.width / 2);
  });
});

// Smoke test 2, slice D: with the log gone from the right column, the camera panel takes it from the
// top.
describe('the camera panel', () => {
  it('sits at the top of the right column, clear of the dashboard', () => {
    expect(CAMERA_RECT.y).toBe(LOG_RECT.y);
    expect(right(CAMERA_RECT)).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(bottom(CAMERA_RECT)).toBeLessThanOrEqual(DASHBOARD_RECT.y);
  });

  it('keeps every control inside itself, and inside the canvas', () => {
    for (const control of Object.keys(CAMERA_CONTROLS) as CameraControl[]) {
      const rect = cameraControlRect(control);

      expect(rect.x, control).toBeGreaterThanOrEqual(CAMERA_RECT.x);
      expect(rect.y, control).toBeGreaterThanOrEqual(CAMERA_RECT.y);
      expect(right(rect), control).toBeLessThanOrEqual(right(CAMERA_RECT));
      expect(bottom(rect), control).toBeLessThanOrEqual(bottom(CAMERA_RECT));
    }
  });

  it('puts each control under its own centre, and the gaps under none', () => {
    for (const control of Object.keys(CAMERA_CONTROLS) as CameraControl[]) {
      const rect = cameraControlRect(control);
      const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

      expect(cameraControlAt(centre), control).toBe(control);
    }
  });
});

// Smoke test 2, slice E: the sheet a right-click on a unit opens, and the one button that closes it.
describe('the inspection window', () => {
  const SHEET_ROWS = 4;

  it('fits inside the canvas, over the board', () => {
    expect(INSPECT_RECT.x).toBeGreaterThanOrEqual(0);
    expect(INSPECT_RECT.y).toBeGreaterThanOrEqual(0);
    expect(right(INSPECT_RECT)).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(bottom(INSPECT_RECT)).toBeLessThanOrEqual(CANVAS_HEIGHT);
    // It is a window over the board, not a panel beside it: it covers the middle of the screen.
    expect(INSPECT_RECT.x).toBeLessThan(CANVAS_WIDTH / 2);
    expect(right(INSPECT_RECT)).toBeGreaterThan(CANVAS_WIDTH / 2);
  });

  it('holds its close button inside itself, at its top right', () => {
    expect(INSPECT_CLOSE_RECT.x).toBeGreaterThanOrEqual(INSPECT_RECT.x);
    expect(INSPECT_CLOSE_RECT.y).toBeGreaterThanOrEqual(INSPECT_RECT.y);
    expect(right(INSPECT_CLOSE_RECT)).toBeLessThanOrEqual(right(INSPECT_RECT));
    expect(bottom(INSPECT_CLOSE_RECT)).toBeLessThanOrEqual(bottom(INSPECT_RECT));
    expect(INSPECT_CLOSE_RECT.x).toBeGreaterThan(INSPECT_RECT.x + INSPECT_RECT.width / 2);
  });

  it('fits the four rows of the sheet under the close button', () => {
    for (let index = 0; index < SHEET_ROWS; index += 1) {
      const point = inspectRowPoint(index);
      expect(point.x, `row ${index}`).toBeGreaterThanOrEqual(INSPECT_RECT.x);
      expect(point.y, `row ${index}`).toBeGreaterThanOrEqual(bottom(INSPECT_CLOSE_RECT));
      expect(point.y + PANEL_ROW_HEIGHT, `row ${index}`).toBeLessThanOrEqual(bottom(INSPECT_RECT));
    }
  });

  it('runs its values back to the right edge, inside the window', () => {
    expect(INSPECT_VALUE_X).toBeLessThanOrEqual(right(INSPECT_RECT));
    expect(INSPECT_VALUE_X).toBeGreaterThan(INSPECT_RECT.x + INSPECT_RECT.width / 2);
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

// EA-8: the same rule the buttons follow, for the portraits of the turn queue — a press is read from
// the rectangle that draws the slot, so the portrait a player presses is the unit they pressed.
describe('carouselSlotIndexAt', () => {
  const centre = (index: number) => {
    const rect = carouselSlotRect(index);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  };

  it('finds each slot of a full queue under its own centre', () => {
    for (let index = 0; index < CAROUSEL_SLOTS; index += 1) {
      expect(carouselSlotIndexAt(centre(index), CAROUSEL_SLOTS), `slot ${index}`).toBe(index);
    }
  });

  it('never names a slot the queue does not have', () => {
    expect(carouselSlotIndexAt(centre(CAROUSEL_SLOTS - 1), CAROUSEL_SLOTS - 4)).toBeNull();
  });

  it('answers nothing for the gap between two slots', () => {
    const gapX = right(carouselSlotRect(0)) + CAROUSEL_SLOT.gap / 2;
    expect(carouselSlotIndexAt({ x: gapX, y: carouselSlotRect(0).y + 1 }, CAROUSEL_SLOTS)).toBeNull();
  });

  it('answers nothing for a click on the board', () => {
    expect(carouselSlotIndexAt({ x: 640, y: 300 }, CAROUSEL_SLOTS)).toBeNull();
  });
});
