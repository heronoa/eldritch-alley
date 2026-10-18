import { describe, expect, it } from 'vitest';
import { terrainOf } from '../maps/terrain';
import { PROTOTYPE_MAPS } from '../maps/prototype-maps';
import type { Cell } from './grid';
import { topFace } from './iso';
import {
  ABILITY_MENU_CLOSE_RECT,
  ABILITY_MENU_RECT,
  ABILITY_MENU_ROW,
  ABILITY_MENU_ROWS,
  ACTION_BAR_RECT,
  ACTION_BUTTON,
  ACTION_HINT_RECT,
  BATTLE_REPORT_CLOSE_RECT,
  BATTLE_REPORT_EXPORT_RECT,
  BATTLE_REPORT_LIST_RECT,
  BATTLE_REPORT_RECT,
  BATTLE_REPORT_REOPEN_RECT,
  BATTLE_REPORT_SCROLL_DOWN_RECT,
  BATTLE_REPORT_SCROLL_UP_RECT,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CAROUSEL_RECT,
  CAROUSEL_SLOT,
  DASHBOARD_RESOURCE_RECT,
  DASHBOARD_CELL,
  DASHBOARD_HEALTH_RECT,
  DASHBOARD_RECT,
  DASHBOARD_TURN_RECT,
  INSPECT_CLOSE_RECT,
  INSPECT_RECT,
  INSPECT_VALUE_X,
  REPORT_LINES,
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
  SETTINGS_BUTTON_RECT,
  SETTINGS_COVERS_ROW_RECT,
  SETTINGS_PANEL_RECT,
  SETTINGS_PAN_MINUS_RECT,
  SETTINGS_PAN_PLUS_RECT,
  SETTINGS_PAN_ROW_RECT,
  SETTINGS_PAN_VALUE_RECT,
  SETTINGS_TOGGLE_RECT,
  STATUS_RECT,
  CAMERA_CONTROLS,
  CAMERA_VIEW_RECT,
  CAMERA_ZOOM_RECT,
  boardBounds,
  abilityMenuRowIndexAt,
  abilityMenuRowRect,
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
/** Seven slots: what the strip holds once it is squeezed between the log and the camera panel. */
const CAROUSEL_CAPACITY = 7;
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

  it('holds a seventh chip, the headroom the short strip keeps', () => {
    // The carousel moved between the two columns to clear the top edge for the log and the camera
    // panel, so it is narrower than it was. The chips narrowed with it, which is what keeps the
    // seventh slot — one more than the roster fields — inside the strip.
    const needed = CAROUSEL_CAPACITY * CAROUSEL_SLOT.width + (CAROUSEL_CAPACITY - 1) * CAROUSEL_SLOT.gap;

    expect(needed).toBeLessThanOrEqual(CAROUSEL_RECT.width);
    expect(right(carouselSlotRect(CAROUSEL_CAPACITY - 1))).toBeLessThanOrEqual(right(CAROUSEL_RECT));
    expect(bottom(carouselSlotRect(CAROUSEL_CAPACITY - 1))).toBeLessThanOrEqual(bottom(CAROUSEL_RECT));
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
  const PARTS = [DASHBOARD_HEALTH_RECT, ACTION_BAR_RECT, DASHBOARD_RESOURCE_RECT, DASHBOARD_TURN_RECT];

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
    expect(DASHBOARD_RESOURCE_RECT.x).toBeGreaterThan(right(ACTION_BAR_RECT));
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

    // The view label reaches further right than any control does: the panel stops short of the gear,
    // so the last column of the grid is what says whether it still fits.
    expect(right(CAMERA_VIEW_RECT)).toBeLessThanOrEqual(right(CAMERA_RECT));
    expect(right(CAMERA_ZOOM_RECT)).toBeLessThanOrEqual(right(CAMERA_RECT));
  });

  it('puts each control under its own centre, and the gaps under none', () => {
    for (const control of Object.keys(CAMERA_CONTROLS) as CameraControl[]) {
      const rect = cameraControlRect(control);
      const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

      expect(cameraControlAt(centre), control).toBe(control);
    }
  });
});

// The owner's feedback after the smoke test: the log and the buttons of the map leave the middle of
// the screen to the board and take the top edge, which the carousel shares with them. Three pieces
// side by side in one band, with the gear in the corner — and no two of them may share a pixel,
// because `hudTakesPress` tells them apart by the order it reads them in, not by what is drawn last.
describe('the top edge', () => {
  const BAND = [logRect(true), CAROUSEL_RECT, CAMERA_RECT, SETTINGS_BUTTON_RECT, SETTINGS_PANEL_RECT];

  it('glues the log to the top of the left column, clear of the carousel', () => {
    expect(LOG_RECT.y).toBe(PADDING);
    expect(LOG_TOGGLE_RECT.y).toBe(PADDING);
    expect(right(LOG_RECT)).toBeLessThanOrEqual(CAROUSEL_RECT.x);
  });

  it('glues the camera panel to the top of the right column, clear of the carousel', () => {
    expect(CAMERA_RECT.y).toBe(PADDING);
    expect(CAMERA_RECT.x).toBeGreaterThanOrEqual(right(CAROUSEL_RECT));
  });

  it('leaves the corner to the gear, so the gear keeps its place', () => {
    expect(right(CAMERA_RECT)).toBeLessThanOrEqual(SETTINGS_BUTTON_RECT.x);
  });

  it('gives each piece of the band a place of its own', () => {
    for (let i = 0; i < BAND.length; i += 1) {
      for (let j = i + 1; j < BAND.length; j += 1) {
        expect(overlaps(BAND[i], BAND[j]), `${i} over ${j}`).toBe(false);
      }
    }
  });

  it('opens the settings under the camera panel, where nothing is drawn over it', () => {
    // The popup used to open under the gear, half of it behind the camera panel, which the HUD builds
    // later and draws on top of it. With the panel against the top edge it would hide the whole popup.
    expect(SETTINGS_PANEL_RECT.y).toBeGreaterThanOrEqual(bottom(CAMERA_RECT));
    expect(bottom(SETTINGS_PANEL_RECT)).toBeLessThanOrEqual(DASHBOARD_RECT.y);
  });

  it('keeps the row of the settings inside its own panel, and the panel inside the canvas', () => {
    expect(SETTINGS_TOGGLE_RECT.x).toBeGreaterThanOrEqual(SETTINGS_PANEL_RECT.x);
    expect(right(SETTINGS_TOGGLE_RECT)).toBeLessThanOrEqual(right(SETTINGS_PANEL_RECT));
    expect(SETTINGS_TOGGLE_RECT.y).toBeGreaterThanOrEqual(SETTINGS_PANEL_RECT.y);
    expect(bottom(SETTINGS_TOGGLE_RECT)).toBeLessThanOrEqual(bottom(SETTINGS_PANEL_RECT));
    expect(right(SETTINGS_PANEL_RECT)).toBeLessThanOrEqual(CANVAS_WIDTH);
  });

  // The drag sensitivity (owner's request) took the second row of that panel, so the popup is now two
  // rows tall and the stepper inside the lower one has to fit it.
  it('gives the settings a second row, and the panel room for both', () => {
    // The test that fails if the height of the panel did not grow with the row: the row would hang out
    // of the bottom of its own box, where nothing is drawn over it and no press is read.
    expect(SETTINGS_PAN_ROW_RECT.x).toBeGreaterThanOrEqual(SETTINGS_PANEL_RECT.x);
    expect(right(SETTINGS_PAN_ROW_RECT)).toBeLessThanOrEqual(right(SETTINGS_PANEL_RECT));
    expect(SETTINGS_PAN_ROW_RECT.y).toBeGreaterThanOrEqual(bottom(SETTINGS_TOGGLE_RECT));
    expect(bottom(SETTINGS_PAN_ROW_RECT)).toBeLessThanOrEqual(bottom(SETTINGS_PANEL_RECT));
    expect(bottom(SETTINGS_PANEL_RECT)).toBeLessThanOrEqual(DASHBOARD_RECT.y);
  });

  // The marks of the rules became a setting (owner's request), and its row took the third line of the
  // panel, which grew with it.
  it('gives the settings a third row for the cover marks, and the panel room for all three', () => {
    expect(SETTINGS_COVERS_ROW_RECT.x).toBeGreaterThanOrEqual(SETTINGS_PANEL_RECT.x);
    expect(right(SETTINGS_COVERS_ROW_RECT)).toBeLessThanOrEqual(right(SETTINGS_PANEL_RECT));
    expect(SETTINGS_COVERS_ROW_RECT.y).toBeGreaterThanOrEqual(bottom(SETTINGS_PAN_ROW_RECT));
    expect(bottom(SETTINGS_COVERS_ROW_RECT)).toBeLessThanOrEqual(bottom(SETTINGS_PANEL_RECT));
    expect(bottom(SETTINGS_PANEL_RECT)).toBeLessThanOrEqual(DASHBOARD_RECT.y);
    expect(bottom(SETTINGS_PANEL_RECT)).toBeLessThanOrEqual(CANVAS_HEIGHT);
  });

  it('lays the stepper of the drag out as − value +, the three inside their row', () => {
    const pieces = [
      ['minus', SETTINGS_PAN_MINUS_RECT],
      ['value', SETTINGS_PAN_VALUE_RECT],
      ['plus', SETTINGS_PAN_PLUS_RECT],
    ] as const;

    for (const [name, rect] of pieces) {
      expect(rect.x, name).toBeGreaterThanOrEqual(SETTINGS_PAN_ROW_RECT.x);
      expect(right(rect), name).toBeLessThanOrEqual(right(SETTINGS_PAN_ROW_RECT));
      expect(rect.y, name).toBeGreaterThanOrEqual(SETTINGS_PAN_ROW_RECT.y);
      expect(bottom(rect), name).toBeLessThanOrEqual(bottom(SETTINGS_PAN_ROW_RECT));
    }

    // They touch, in the order the scene reads them, so no press ever falls in a gap between them.
    expect(right(SETTINGS_PAN_MINUS_RECT)).toBe(SETTINGS_PAN_VALUE_RECT.x);
    expect(right(SETTINGS_PAN_VALUE_RECT)).toBe(SETTINGS_PAN_PLUS_RECT.x);

    // The label is drawn at the left of the row and the stepper may not eat its room: at the log size
    // the longest label the panel carries is fifteen characters, a bit over 130 px of monospace.
    expect(SETTINGS_PAN_MINUS_RECT.x - SETTINGS_PAN_ROW_RECT.x).toBeGreaterThanOrEqual(140);
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

/**
 * EA-16: the modal `Habilidade` opens before the aim. Its rectangle, its close button and the rows the
 * scene hit-tests are laid out here, so a press on a drawn row is a press on that row.
 */
describe('the ability menu', () => {
  it('fits inside the canvas, over the board', () => {
    expect(ABILITY_MENU_RECT.x).toBeGreaterThanOrEqual(0);
    expect(ABILITY_MENU_RECT.y).toBeGreaterThanOrEqual(0);
    expect(right(ABILITY_MENU_RECT)).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(bottom(ABILITY_MENU_RECT)).toBeLessThanOrEqual(CANVAS_HEIGHT);
    expect(ABILITY_MENU_RECT.x).toBeLessThan(CANVAS_WIDTH / 2);
    expect(right(ABILITY_MENU_RECT)).toBeGreaterThan(CANVAS_WIDTH / 2);
  });

  it('holds its close button inside itself, at its top right', () => {
    expect(ABILITY_MENU_CLOSE_RECT.x).toBeGreaterThanOrEqual(ABILITY_MENU_RECT.x);
    expect(ABILITY_MENU_CLOSE_RECT.y).toBeGreaterThanOrEqual(ABILITY_MENU_RECT.y);
    expect(right(ABILITY_MENU_CLOSE_RECT)).toBeLessThanOrEqual(right(ABILITY_MENU_RECT));
    expect(bottom(ABILITY_MENU_CLOSE_RECT)).toBeLessThanOrEqual(bottom(ABILITY_MENU_RECT));
    expect(ABILITY_MENU_CLOSE_RECT.x).toBeGreaterThan(ABILITY_MENU_RECT.x + ABILITY_MENU_RECT.width / 2);
  });

  it('fits its rows under the close button and inside the panel', () => {
    for (let index = 0; index < ABILITY_MENU_ROWS; index += 1) {
      const row = abilityMenuRowRect(index);
      expect(row.x, `row ${index}`).toBeGreaterThan(ABILITY_MENU_RECT.x);
      expect(row.y, `row ${index}`).toBeGreaterThanOrEqual(bottom(ABILITY_MENU_CLOSE_RECT));
      expect(right(row), `row ${index}`).toBeLessThan(right(ABILITY_MENU_RECT));
      expect(bottom(row), `row ${index}`).toBeLessThanOrEqual(bottom(ABILITY_MENU_RECT));
    }
  });

  it('grows to two rows for the second active set, with the panel growing with them (ADR 0023 §2)', () => {
    // The first row stays where it was; the second one sits under it and the panel takes the room. The
    // scene builds the panel once from this rectangle, so a height that did not follow the constant
    // would hide the row it still lets the player press.
    expect(ABILITY_MENU_ROWS).toBe(2);
    expect(ABILITY_MENU_RECT.height).toBe(
      PADDING + ABILITY_MENU_CLOSE_RECT.height + 8 + ABILITY_MENU_ROWS * ABILITY_MENU_ROW + PADDING,
    );
    expect(bottom(abilityMenuRowRect(1))).toBeLessThanOrEqual(bottom(ABILITY_MENU_RECT));
  });

  it('never overlaps two rows, so the row under a press is never ambiguous', () => {
    for (let i = 0; i < ABILITY_MENU_ROWS; i += 1) {
      for (let j = i + 1; j < ABILITY_MENU_ROWS; j += 1) {
        expect(overlaps(abilityMenuRowRect(i), abilityMenuRowRect(j)), `${i} over ${j}`).toBe(false);
      }
    }
  });

  it('names the row under a point, and nothing for the title, the close button or a gap', () => {
    const centreOf = (index: number) => {
      const row = abilityMenuRowRect(index);
      return { x: row.x + row.width / 2, y: row.y + row.height / 2 };
    };

    for (let index = 0; index < ABILITY_MENU_ROWS; index += 1) {
      expect(abilityMenuRowIndexAt(centreOf(index)), `row ${index}`).toBe(index);
    }

    // The title band and the close button are the panel's own: a press there arms nothing.
    const title = { x: ABILITY_MENU_RECT.x + 8, y: ABILITY_MENU_RECT.y + 8 };
    const close = { x: ABILITY_MENU_CLOSE_RECT.x + 1, y: ABILITY_MENU_CLOSE_RECT.y + 1 };
    expect(abilityMenuRowIndexAt(title)).toBeNull();
    expect(abilityMenuRowIndexAt(close)).toBeNull();
    // And so is every point outside the panel, which is what closes it.
    expect(abilityMenuRowIndexAt({ x: 0, y: 0 })).toBeNull();
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

/**
 * EA-17: the full match log, opened the moment the match ends. The same fixed-rectangle-plus-close-
 * button shape the sheet and the ability menu already use, with a scrollable list, two chevrons and
 * an export button besides.
 */
describe('the battle report', () => {
  it('fits inside the canvas, over the board', () => {
    expect(BATTLE_REPORT_RECT.x).toBeGreaterThanOrEqual(0);
    expect(BATTLE_REPORT_RECT.y).toBeGreaterThanOrEqual(0);
    expect(right(BATTLE_REPORT_RECT)).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(bottom(BATTLE_REPORT_RECT)).toBeLessThanOrEqual(CANVAS_HEIGHT);
    expect(BATTLE_REPORT_RECT.x).toBeLessThan(CANVAS_WIDTH / 2);
    expect(right(BATTLE_REPORT_RECT)).toBeGreaterThan(CANVAS_WIDTH / 2);
  });

  it('holds its close button inside itself, at its top right', () => {
    expect(BATTLE_REPORT_CLOSE_RECT.x).toBeGreaterThanOrEqual(BATTLE_REPORT_RECT.x);
    expect(BATTLE_REPORT_CLOSE_RECT.y).toBeGreaterThanOrEqual(BATTLE_REPORT_RECT.y);
    expect(right(BATTLE_REPORT_CLOSE_RECT)).toBeLessThanOrEqual(right(BATTLE_REPORT_RECT));
    expect(bottom(BATTLE_REPORT_CLOSE_RECT)).toBeLessThanOrEqual(bottom(BATTLE_REPORT_RECT));
    expect(BATTLE_REPORT_CLOSE_RECT.x).toBeGreaterThan(BATTLE_REPORT_RECT.x + BATTLE_REPORT_RECT.width / 2);
  });

  it('holds the list, both chevrons and the export button inside the panel, none of them overlapping', () => {
    const pieces = [
      BATTLE_REPORT_LIST_RECT,
      BATTLE_REPORT_SCROLL_UP_RECT,
      BATTLE_REPORT_SCROLL_DOWN_RECT,
      BATTLE_REPORT_EXPORT_RECT,
    ];

    for (const piece of pieces) {
      expect(piece.x).toBeGreaterThanOrEqual(BATTLE_REPORT_RECT.x);
      expect(piece.y).toBeGreaterThanOrEqual(BATTLE_REPORT_RECT.y);
      expect(right(piece)).toBeLessThanOrEqual(right(BATTLE_REPORT_RECT));
      expect(bottom(piece)).toBeLessThanOrEqual(bottom(BATTLE_REPORT_RECT));
    }
    for (let i = 0; i < pieces.length; i += 1) {
      for (let j = i + 1; j < pieces.length; j += 1) {
        expect(overlaps(pieces[i]!, pieces[j]!), `${i} over ${j}`).toBe(false);
      }
    }
  });

  it('fits at least a dozen lines in the visible list', () => {
    expect(REPORT_LINES).toBeGreaterThanOrEqual(12);
  });

  it('sits under the way-out button, so a finished match can still open it again', () => {
    expect(BATTLE_REPORT_REOPEN_RECT.x).toBeGreaterThanOrEqual(0);
    expect(right(BATTLE_REPORT_REOPEN_RECT)).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(bottom(BATTLE_REPORT_REOPEN_RECT)).toBeLessThanOrEqual(CANVAS_HEIGHT);
    expect(overlaps(BATTLE_REPORT_REOPEN_RECT, RESULT_BUTTON_RECT)).toBe(false);
  });
});
