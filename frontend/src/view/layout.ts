// Where every piece of the HUD sits on the canvas. Plain arithmetic, no Phaser: the scene reads
// these rectangles and draws them, so no coordinate is decided inside a drawing method.
//
// The HUD floats over the board instead of sitting beside it, so the rectangles are placed from the
// edges of the canvas and the board keeps the middle. Every point inside one of them belongs to the
// HUD, which is what lets a panel cover a tile without a click reaching the tile.
import { BOARD_HEIGHT, BOARD_WIDTH, type Pixel } from './grid';
import { HZ, TILE_H, TILE_W, TOP_Y, cellToScreen } from './iso';

/** A rectangle on the canvas. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

/** Space between a piece of the HUD and the edge of the canvas. */
export const PADDING = 16;

/** The widest level the board can reach, which is what the board's lowest block is drawn for. */
const HIGHEST_LEVEL = 2;

/** The carousel and the action bar share one column, centred on the canvas. */
const CENTRED_X = 248;
const CENTRED_WIDTH = 784;

/** The panel and the log sit on one line, each in its own column against the edge. */
const COLUMN_WIDTH = 300;
const LEFT_COLUMN_X = PADDING;
const RIGHT_COLUMN_X = CANVAS_WIDTH - PADDING - COLUMN_WIDTH;
const COLUMN_Y = 120;
const COLUMN_HEIGHT = 300;

/** The turn-order carousel: one chip per unit still in play, the acting unit first. */
export const CAROUSEL_RECT: Rect = { x: CENTRED_X, y: PADDING, width: CENTRED_WIDTH, height: 80 };

export const CAROUSEL_SLOT = { width: 96, height: 64, gap: 8 };

/** The action bar: four buttons, `Mover` / `Atacar` / `Recarregar` / `Terminar turno`. */
export const ACTION_BAR_RECT: Rect = { x: CENTRED_X, y: 648, width: CENTRED_WIDTH, height: 56 };

/** Four buttons and three gaps fill the bar exactly. */
export const ACTION_BUTTON = { width: 184, height: 56, gap: 16 };

/** The unit panel, over the board on the left. */
export const PANEL_RECT: Rect = {
  x: LEFT_COLUMN_X,
  y: COLUMN_Y,
  width: COLUMN_WIDTH,
  height: COLUMN_HEIGHT,
};

/**
 * How solid the fill of a panel is. A panel floats over the board, so it has to let a little of the
 * tiles under it through to stay readable as something laid on top; the text and the frame are drawn
 * at full strength over it.
 */
export const PANEL_ALPHA = 0.94;

/** The battle log, over the board on the right. */
export const LOG_RECT: Rect = {
  x: RIGHT_COLUMN_X,
  y: COLUMN_Y,
  width: COLUMN_WIDTH,
  height: COLUMN_HEIGHT,
};

/** The legend and the status line, under the panel in the left column. */
export const LEGEND_RECT: Rect = { x: LEFT_COLUMN_X, y: 440, width: COLUMN_WIDTH, height: 44 };
export const STATUS_RECT: Rect = { x: LEFT_COLUMN_X, y: 492, width: COLUMN_WIDTH, height: 24 };

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

/**
 * The box that holds every top face and every block of the board, drawn at the highest level the
 * board can reach: the west corner of the leftmost cell to the east corner of the rightmost one,
 * and the north corner of the top cell down past the base of the tallest block.
 */
export function boardBounds(): Rect {
  const north = TOP_Y;
  const west = cellToScreen({ x: 0, y: BOARD_HEIGHT - 1 }, 0).x - TILE_W / 2;
  const east = cellToScreen({ x: BOARD_WIDTH - 1, y: 0 }, 0).x + TILE_W / 2;
  const south = cellToScreen({ x: BOARD_WIDTH - 1, y: BOARD_HEIGHT - 1 }, 0).y + TILE_H / 2 + HIGHEST_LEVEL * HZ;

  return { x: west, y: north, width: east - west, height: south - north };
}

/** The six rectangles that cover the board, in the order the scene reads them. */
export function hudRects(): Rect[] {
  return [CAROUSEL_RECT, ACTION_BAR_RECT, PANEL_RECT, LOG_RECT, LEGEND_RECT, STATUS_RECT];
}

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
 * Whether a point of the canvas is inside a rectangle. Half-open, like `cellAt`'s top faces: the far
 * edge belongs to the neighbour, so two touching rectangles never both claim the same pixel.
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
