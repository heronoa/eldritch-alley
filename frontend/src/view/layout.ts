// Where every piece of the HUD sits on the canvas. Plain arithmetic, no Phaser: the scene reads
// these rectangles and draws them, so no coordinate is decided inside a drawing method.
//
// The HUD floats over the board instead of sitting beside it, so the rectangles are placed from the
// edges of the canvas and the board keeps the middle. Every point inside one of them belongs to the
// HUD, which is what lets a panel cover a tile without a click reaching the tile.
import { NO_FLOOR, type BoardSize, type Cell, type Pixel } from './grid';
import { topFace } from './iso';

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

/** The carousel and the action bar share one column, centred on the canvas. */
const CENTRED_X = 248;
const CENTRED_WIDTH = 784;

/** The panel and the log sit on one line, each in its own column against the edge. */
const COLUMN_WIDTH = 300;
const LEFT_COLUMN_X = PADDING;
const RIGHT_COLUMN_X = CANVAS_WIDTH - PADDING - COLUMN_WIDTH;
const COLUMN_Y = 120;
const COLUMN_HEIGHT = 300;

/** The way out of a finished match, under the result, centred on the canvas. */
export const RESULT_BUTTON_RECT: Rect = { x: 540, y: 440, width: 200, height: 56 };

/**
 * The banner of a turn change: centred on the canvas, narrow enough to fall between the two columns
 * of the HUD. It is deliberately not one of `hudRects` — it fades over the board, and the map and the
 * action bar stay usable underneath it.
 */
export const BANNER_RECT: Rect = { x: 340, y: 324, width: 600, height: 72 };

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
 * The automatic end of turn (EA-4): the gear that opens the settings, in the top-right corner of the
 * screen and outside the action bar (decision D3), and the panel it opens, in the log's own column.
 *
 * Neither the gear nor its panel is one of `hudRects`, which lists the pieces that cover the board
 * always: the gear is read by the scene the way the way out of a finished match is, before the bar
 * and the board, and the panel swallows the clicks it covers only while it is open.
 */
export const SETTINGS_BUTTON_RECT: Rect = {
  x: CANVAS_WIDTH - PADDING - 32,
  y: PADDING,
  width: 32,
  height: 32,
};

/** The panel holds a title and one row, which is all this feature has to offer. */
export const SETTINGS_PANEL_RECT: Rect = {
  x: RIGHT_COLUMN_X,
  y: SETTINGS_BUTTON_RECT.y + SETTINGS_BUTTON_RECT.height + PADDING,
  width: COLUMN_WIDTH,
  height: TITLE_HEIGHT + PANEL_ROW_HEIGHT + PADDING,
};

/** The one row of that panel: the toggle of "Passar o turno automaticamente". */
export const SETTINGS_TOGGLE_RECT: Rect = {
  x: SETTINGS_PANEL_RECT.x + PADDING,
  y: SETTINGS_PANEL_RECT.y + TITLE_HEIGHT,
  width: SETTINGS_PANEL_RECT.width - 2 * PADDING,
  height: PANEL_ROW_HEIGHT,
};

/**
 * The countdown of that automatic end, under the banner and in the same column: the line the
 * countdown shows, and the link under it. Both are pressed, so both take the click — the first keeps
 * the turn, the second turns the feature off — and they are two lines rather than one because those
 * are two different decisions.
 */
export const COUNTDOWN_RECT: Rect = {
  x: BANNER_RECT.x,
  y: BANNER_RECT.y + BANNER_RECT.height + 8,
  width: BANNER_RECT.width,
  height: 24,
};

export const COUNTDOWN_LINK_RECT: Rect = {
  x: COUNTDOWN_RECT.x,
  y: COUNTDOWN_RECT.y + COUNTDOWN_RECT.height,
  width: COUNTDOWN_RECT.width,
  height: COUNTDOWN_RECT.height,
};

/**
 * The hint the "End turn" button gives when the automatic end of turn is off (EA-4): one line over
 * the action bar, which is where the button it is about is. It takes no click of its own.
 */
export const ACTION_HINT_RECT: Rect = {
  x: CENTRED_X,
  y: ACTION_BAR_RECT.y - 32,
  width: CENTRED_WIDTH,
  height: 24,
};

/**
 * The box that holds every top face of the board: the shape of the map's own relief, not a level
 * range. The westmost corner, the northmost, and so on, over the cells that have a floor — a gap has
 * nothing to aim at and is not part of the area the player plays on.
 *
 * The blocks' side faces run below their tops, and the prototypes' facades dive under the HUD on
 * purpose, so what has to fit the space the panels leave is what the player aims at.
 */
export function boardBounds(size: BoardSize, levelAt: (cell: Cell) => number, lift = 0): Rect {
  let north = Number.POSITIVE_INFINITY;
  let south = Number.NEGATIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const cell = { x, y };
      const level = levelAt(cell);
      if (level === NO_FLOOR) continue;

      for (const corner of topFace(cell, level, lift)) {
        north = Math.min(north, corner.y);
        south = Math.max(south, corner.y);
        west = Math.min(west, corner.x);
        east = Math.max(east, corner.x);
      }
    }
  }

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

/**
 * The tip of the arrow that marks the unit on turn, in the sprite's own coordinates: straight above
 * the feet of the figure, clear of its head (48 px up), its health bar (54) and its pips (64).
 */
export const TURN_ARROW_POINT: Pixel = { x: 0, y: -72 };

/** Half the width of that arrow, and how far its base sits above its tip. */
export const TURN_ARROW = { halfWidth: 9, height: 14 };

/** The top-left of the nth row of the panel, below its title. */
export function panelRowPoint(index: number): Pixel {
  return {
    x: PANEL_RECT.x + PADDING,
    y: PANEL_RECT.y + TITLE_HEIGHT + index * PANEL_ROW_HEIGHT,
  };
}
