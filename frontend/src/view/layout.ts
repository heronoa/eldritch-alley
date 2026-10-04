// Where every piece of the HUD sits on the canvas. Plain arithmetic, no Phaser: the scene reads
// these rectangles and draws them, so no coordinate is decided inside a drawing method.
//
// The board keeps the place it had. All of the extra width and height of the 1280x720 canvas is on
// the right and the bottom, which is also why `pixelToCell` keeps returning null for a click in the
// sidebar: the scene-wide pointer handler stays harmless there.
import { BOARD_HEIGHT, BOARD_WIDTH, ORIGIN, TILE_SIZE, type Pixel } from './grid';

/** A rectangle on the canvas. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

/** Space between a piece of the HUD and the edge of what contains it. */
export const PADDING = 16;

/** The board, exactly where `grid.ts` draws it. */
export const BOARD_RECT: Rect = {
  x: ORIGIN.x,
  y: ORIGIN.y,
  width: BOARD_WIDTH * TILE_SIZE,
  height: BOARD_HEIGHT * TILE_SIZE,
};

/** The column to the right of the board, which holds everything that is not the board. */
export const SIDEBAR = {
  x: BOARD_RECT.x + BOARD_RECT.width + 32,
  y: ORIGIN.y,
  width: CANVAS_WIDTH - (BOARD_RECT.x + BOARD_RECT.width + 32) - ORIGIN.x,
};

/** The turn-order carousel: one chip per unit still in play, the acting unit first. */
export const CAROUSEL_RECT: Rect = {
  x: SIDEBAR.x,
  y: SIDEBAR.y,
  width: SIDEBAR.width,
  height: 80,
};

export const CAROUSEL_SLOT = { width: 96, height: 64, gap: 8 };

/** The action bar: four buttons, `Mover` / `Atacar` / `Recarregar` / `Terminar turno`. */
export const ACTION_BAR_RECT: Rect = {
  x: SIDEBAR.x,
  y: CAROUSEL_RECT.y + CAROUSEL_RECT.height + PADDING,
  width: SIDEBAR.width,
  height: 56,
};

/** Four buttons and three gaps fill the bar exactly. */
export const ACTION_BUTTON = { width: 184, height: 56, gap: 16 };

/** The unit panel, under the action bar. */
export const PANEL_RECT: Rect = {
  x: SIDEBAR.x,
  y: ACTION_BAR_RECT.y + ACTION_BAR_RECT.height + PADDING,
  width: 368,
  height: 300,
};

/** The battle log, beside the panel. Between them they fill the width of the sidebar. */
export const LOG_RECT: Rect = {
  x: PANEL_RECT.x + PANEL_RECT.width + PADDING,
  y: PANEL_RECT.y,
  width: SIDEBAR.width - PANEL_RECT.width - PADDING,
  height: PANEL_RECT.height,
};

/** Height of one panel row, and the space the title above both boxes takes. */
export const PANEL_ROW_HEIGHT = 40;
export const TITLE_HEIGHT = 40;

/** The bar of a row sits under its label, inside the row's own height. */
export const PANEL_BAR_OFFSET = 22;
export const PANEL_BAR_HEIGHT = 6;

/** How many lines the log keeps. Twelve 18px lines fit under the title with room to spare. */
export const LOG_LINES = 12;

/** The top-left of the log's first line, under the title. */
export const LOG_TEXT_POINT: Pixel = { x: LOG_RECT.x + PADDING, y: LOG_RECT.y + TITLE_HEIGHT };

/** The top-left of the panel's title. */
export const PANEL_TITLE_POINT: Pixel = { x: PANEL_RECT.x + PADDING, y: PANEL_RECT.y + PADDING };

/** The legend and the status line sit under the board, in the column the board leaves free. */
export const LEGEND_Y = BOARD_RECT.y + BOARD_RECT.height + PADDING;
/** The legend wraps to two lines, so the status line clears both. */
export const STATUS_Y = LEGEND_Y + 44;

/** The rectangle of the nth button of the action bar, counting from the left. */
export function buttonRect(index: number): Rect {
  return {
    x: ACTION_BAR_RECT.x + index * (ACTION_BUTTON.width + ACTION_BUTTON.gap),
    y: ACTION_BAR_RECT.y,
    width: ACTION_BUTTON.width,
    height: ACTION_BUTTON.height,
  };
}

/** How many buttons the action bar holds: Mover, Atacar, Recarregar, Terminar turno. */
export const ACTION_BUTTONS = 4;

/**
 * Whether a point of the canvas is inside a rectangle. Half-open, like `pixelToCell`: the far edge
 * belongs to the neighbour, so two touching rectangles never both claim the same pixel.
 */
export function containsPoint(rect: Rect, point: Pixel): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

/**
 * The action button under a point, or null when the point is on none of them.
 *
 * The result is the same rectangle `buttonRect` draws (DT-30): a click lands on the button the
 * player sees, and the scene never has to know how a widget hit-tests itself.
 */
export function buttonIndexAt(point: Pixel): number | null {
  for (let index = 0; index < ACTION_BUTTONS; index += 1) {
    if (containsPoint(buttonRect(index), point)) return index;
  }
  return null;
}

/** The rectangle of the nth slot of the carousel, counting from the left, centred vertically. */
export function carouselSlotRect(index: number): Rect {
  return {
    x: CAROUSEL_RECT.x + index * (CAROUSEL_SLOT.width + CAROUSEL_SLOT.gap),
    y: CAROUSEL_RECT.y + (CAROUSEL_RECT.height - CAROUSEL_SLOT.height) / 2,
    width: CAROUSEL_SLOT.width,
    height: CAROUSEL_SLOT.height,
  };
}

/** The top-left of the nth row of the panel, below its title. */
export function panelRowPoint(index: number): Pixel {
  return {
    x: PANEL_RECT.x + PADDING,
    y: PANEL_RECT.y + TITLE_HEIGHT + index * PANEL_ROW_HEIGHT,
  };
}
