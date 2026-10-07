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

/** The action bar, centred on the canvas, and the dashboard line that follows it. */
const CENTRED_X = 248;
const CENTRED_WIDTH = 784;

/**
 * The two columns of the HUD, one against each edge. Each holds a piece at the top and a piece at the
 * bottom and leaves the middle to the board: the log and the camera panel hug the top edge, the legend
 * and the status line keep the bottom of the left column, and the dashboard runs along the bottom of
 * the canvas.
 */
const COLUMN_WIDTH = 300;
const LEFT_COLUMN_X = PADDING;
const RIGHT_COLUMN_X = CANVAS_WIDTH - PADDING - COLUMN_WIDTH;

/** The way out of a finished match, under the result, centred on the canvas. */
export const RESULT_BUTTON_RECT: Rect = { x: 540, y: 440, width: 200, height: 56 };

/**
 * The banner of a turn change: centred on the canvas, narrow enough to fall between the two columns
 * of the HUD. It is deliberately not one of `hudRects` — it fades over the board, and the map and the
 * action bar stay usable underneath it.
 */
export const BANNER_RECT: Rect = { x: 340, y: 324, width: 600, height: 72 };

/**
 * The turn-order carousel: one chip per unit still in play, the acting unit first. It keeps the middle
 * of the top band, between the two columns, which is what lets the log and the camera panel be glued to
 * the top edge without any of the three covering another. It is narrower than the action bar for that
 * reason, and still centred on the canvas.
 */
export const CAROUSEL_RECT: Rect = {
  x: LEFT_COLUMN_X + COLUMN_WIDTH,
  y: PADDING,
  width: RIGHT_COLUMN_X - LEFT_COLUMN_X - COLUMN_WIDTH,
  height: 80,
};

/**
 * One chip of that carousel. The strip is 648 px wide, and seven of these fill 636 of it — one more
 * than the roster fields, which is the headroom the narrower strip was left with (the owner's decision
 * when the top band was set out).
 */
export const CAROUSEL_SLOT = { width: 84, height: 64, gap: 8 };

/**
 * The dashboard: a band along the bottom edge that holds everything the unit's data used to take a
 * whole column for (smoke test 2, slice B). The unit's numbers sit at the two ends of it and the turn's
 * own line under the buttons, so the board keeps the middle of the screen and the columns beside it.
 *
 * It is one of `hudRects`, so a press on it is the HUD's and never reaches a tile under it.
 */
export const DASHBOARD_HEIGHT = 104;

export const DASHBOARD_RECT: Rect = {
  x: PADDING,
  y: CANVAS_HEIGHT - PADDING - DASHBOARD_HEIGHT,
  width: CANVAS_WIDTH - 2 * PADDING,
  height: DASHBOARD_HEIGHT,
};

/** The action bar: four buttons, `Mover` / `Atacar` / `Recarregar` / `Terminar turno`. */
export const ACTION_BAR_RECT: Rect = {
  x: CENTRED_X,
  y: DASHBOARD_RECT.y + 12,
  width: CENTRED_WIDTH,
  height: 56,
};

/** Four buttons and three gaps fill the bar exactly. */
export const ACTION_BUTTON = { width: 184, height: 56, gap: 16 };

/** How wide and how tall one of the two cells of the dashboard that hold a number is. */
export const DASHBOARD_CELL = { width: 208, height: ACTION_BAR_RECT.height, inset: 12 };

/** The cell of the unit's health, at the left end of the dashboard. */
export const DASHBOARD_HEALTH_RECT: Rect = {
  x: DASHBOARD_RECT.x + DASHBOARD_CELL.inset,
  y: ACTION_BAR_RECT.y,
  width: DASHBOARD_CELL.width,
  height: DASHBOARD_CELL.height,
};

/** The cell of the unit's resource: the rounds of a magazine, or the energy of a magic class. */
export const DASHBOARD_RESOURCE_RECT: Rect = {
  x: DASHBOARD_RECT.x + DASHBOARD_RECT.width - DASHBOARD_CELL.inset - DASHBOARD_CELL.width,
  y: ACTION_BAR_RECT.y,
  width: DASHBOARD_CELL.width,
  height: DASHBOARD_CELL.height,
};

/** The line of the turn — its movement, its action and its reaction — under the buttons. */
export const DASHBOARD_TURN_RECT: Rect = {
  x: ACTION_BAR_RECT.x,
  y: ACTION_BAR_RECT.y + ACTION_BAR_RECT.height + 4,
  width: CENTRED_WIDTH,
  height: 20,
};

/** How far inside a cell of the dashboard its own text sits, and where its bar runs under it. */
export const CELL_PADDING = 12;
export const CELL_BAR_OFFSET = 34;
export const CELL_BAR_HEIGHT = 6;

/** The top-left of a cell's label, and the end of the cell its value is aligned against. */
export function cellLabelPoint(cell: Rect): Pixel {
  return { x: cell.x + CELL_PADDING, y: cell.y + CELL_PADDING };
}

export function cellValuePoint(cell: Rect): Pixel {
  return { x: cell.x + cell.width - CELL_PADDING, y: cell.y + CELL_PADDING };
}

/** The left end of a cell's bar, and how wide it runs between the cell's own paddings. */
export function cellBarPoint(cell: Rect): Pixel {
  return { x: cell.x + CELL_PADDING, y: cell.y + CELL_BAR_OFFSET };
}

export function cellBarWidth(cell: Rect): number {
  return cell.width - 2 * CELL_PADDING;
}

/**
 * The middle of the turn's line, which is centred on the canvas the way the bar over it is: the two
 * share a column, so the line reads as the bar's own footnote.
 */
export const DASHBOARD_TURN_POINT: Pixel = {
  x: CANVAS_WIDTH / 2,
  y: DASHBOARD_TURN_RECT.y + 2,
};

/**
 * How solid the fill of a panel is. A panel floats over the board, so it has to let a little of the
 * tiles under it through to stay readable as something laid on top; the text and the frame are drawn
 * at full strength over it.
 */
export const PANEL_ALPHA = 0.94;

/**
 * The battle log: a small box at the top of the left column, against the edge, which the dashboard
 * freed (smoke test 2, slices B and C), with its own header as the toggle that opens it (decision Q3).
 *
 * Closed, which is how it starts, it shows its header and the last thing said; open, it shows the last
 * `LOG_LINES` of them. The header is what the player presses either way, so it is the one part that is
 * always in the same place.
 *
 * The log is deliberately not one of `hudRects`: it is as tall as it is open, so the scene reads its
 * own box — `logRect` — before the pieces that are always the same size.
 */
export const LOG_HEADER_HEIGHT = 46;
export const LOG_LINE_HEIGHT = 22;
export const LOG_LINES = 6;

/** The open box: the header, and the lines under it. */
export const LOG_RECT: Rect = {
  x: LEFT_COLUMN_X,
  y: PADDING,
  width: COLUMN_WIDTH,
  height: LOG_HEADER_HEIGHT + LOG_LINES * LOG_LINE_HEIGHT,
};

/** The header, which is the toggle and takes the same press whether the box is open or closed. */
export const LOG_TOGGLE_RECT: Rect = { ...LOG_RECT, height: LOG_HEADER_HEIGHT };

/** The box as it is drawn now: the whole of it open, its header and the last line closed. */
export function logRect(open: boolean): Rect {
  return open ? LOG_RECT : { ...LOG_RECT, height: LOG_HEADER_HEIGHT + LOG_LINE_HEIGHT };
}

/** The legend and the status line, under the panel in the left column. */
export const LEGEND_RECT: Rect = { x: LEFT_COLUMN_X, y: 440, width: COLUMN_WIDTH, height: 44 };
export const STATUS_RECT: Rect = { x: LEFT_COLUMN_X, y: 492, width: COLUMN_WIDTH, height: 24 };

/** Height of one row of a panel, and the space the title above both boxes takes. */
export const PANEL_ROW_HEIGHT = 40;
export const TITLE_HEIGHT = 40;

/** The top-left of the log's first line, under the header. */
export const LOG_TEXT_POINT: Pixel = { x: LOG_RECT.x + PADDING, y: LOG_RECT.y + LOG_HEADER_HEIGHT };

/** The right end of the header, where the glyph that says whether the box is open sits. */
export const LOG_TOGGLE_POINT: Pixel = {
  x: LOG_RECT.x + LOG_RECT.width - PADDING,
  y: LOG_RECT.y + PADDING,
};

/**
 * The automatic end of turn (EA-4): the gear that opens the settings, in the top-right corner of the
 * screen and outside the action bar (decision D3). The corner is the gear's own — the camera panel
 * stops short of it — so the gear has not moved. It is not one of `hudRects`, which lists the pieces
 * that cover the board always: the scene reads it the way it reads the way out of a finished match,
 * before the bar and the board.
 *
 * The panel it opens is defined under the camera panel, because that is where it is drawn.
 */
export const SETTINGS_BUTTON_RECT: Rect = {
  x: CANVAS_WIDTH - PADDING - 32,
  y: PADDING,
  width: 32,
  height: 32,
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
 * The two chips of a pending move (EA-5, D6): "Confirm move" and "Cancel move". The action bar is
 * exactly full — four buttons and three gaps fill it — so they sit outside it, over the board, one
 * row above the dashboard and starting at the bar's own left edge. They exist only while a move waits
 * to be confirmed, and they take a click, so the scene reads them the way it reads the bar.
 *
 * A chip is as tall as the text it carries with room around it (DT-83): at 24 px the labels of the two
 * chips were clipped by their own box.
 */
export const MOVE_CHIP = { width: 184, height: 32, gap: 16 };

/** The rectangle of the nth chip of a pending move, counting from the left. */
export function moveChipRect(index: number): Rect {
  return {
    x: ACTION_BAR_RECT.x + index * (MOVE_CHIP.width + MOVE_CHIP.gap),
    y: DASHBOARD_RECT.y - 8 - MOVE_CHIP.height,
    width: MOVE_CHIP.width,
    height: MOVE_CHIP.height,
  };
}

/** How many chips a pending move floats: the confirmation and the cancel. */
export const MOVE_CHIPS = 2;

/** The chip under a point, or null when the point is on none of them. */
export function moveChipIndexAt(point: Pixel): number | null {
  for (let index = 0; index < MOVE_CHIPS; index += 1) {
    if (containsPoint(moveChipRect(index), point)) return index;
  }
  return null;
}

/**
 * The hint the "End turn" button gives when the automatic end of turn is off (EA-4): one line over
 * the action bar, which is where the button it is about is. It takes no click of its own, and the
 * band above the bar belongs to the chips of a pending move (EA-5, D6), so the hint sits one row
 * higher, keeping its own line and its width.
 */
export const ACTION_HINT_RECT: Rect = {
  x: CENTRED_X,
  y: moveChipRect(0).y - 8 - 24,
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

/**
 * The rectangles that cover the board, in the order the scene reads them. The log is not among them:
 * it is as tall as it is open, so the scene reads `logRect` on its own, the way it reads the settings
 * panel. Neither is the camera panel, for the same reason.
 */
export function hudRects(): Rect[] {
  return [CAROUSEL_RECT, DASHBOARD_RECT, LEGEND_RECT, STATUS_RECT];
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
 * The slot under a point, or null when the point is on none of them. `slots` is how many the queue
 * has now: the carousel shrinks as units fall, and a press right of the last portrait is on the empty
 * part of the strip, which is no unit at all (EA-8).
 *
 * The result is the same rectangle `carouselSlotRect` draws, so the portrait a player presses is the
 * unit they pressed (DT-30, the rule the action bar follows).
 */
export function carouselSlotIndexAt(point: Pixel, slots: number): number | null {
  for (let index = 0; index < slots; index += 1) {
    if (containsPoint(carouselSlotRect(index), point)) return index;
  }
  return null;
}

/**
 * The tip of the arrow that marks the unit on turn, in the sprite's own coordinates: straight above
 * the feet of the figure, clear of its head (48 px up), its health bar (54) and its pips (64).
 */
export const TURN_ARROW_POINT: Pixel = { x: 0, y: -72 };

/** Half the width of that arrow, and how far its base sits above its tip. */
export const TURN_ARROW = { halfWidth: 9, height: 14 };

/**
 * The unit inspection window (EA-6, extended by the smoke test 2 feedback): the sheet a right-click on
 * a unit opens, over the middle of the board, with the button that closes it at the top right.
 *
 * It closes with that button and with nothing else (Q4), so a press on the board acts as it always
 * does and leaves the window standing. Like the settings panel, it is deliberately not one of
 * `hudRects`: the scene reads it before the board, and it swallows the presses it covers only while it
 * is open.
 */
export const INSPECT_RECT: Rect = { x: 440, y: 168, width: 400, height: 240 };

/** How wide the box of the close button is, at the top right of the window. */
export const INSPECT_CLOSE = 32;

export const INSPECT_CLOSE_RECT: Rect = {
  x: INSPECT_RECT.x + INSPECT_RECT.width - PADDING - INSPECT_CLOSE,
  y: INSPECT_RECT.y + PADDING,
  width: INSPECT_CLOSE,
  height: INSPECT_CLOSE,
};

/** How far under the close button the first row of the sheet starts. */
const INSPECT_ROWS_TOP = PADDING + INSPECT_CLOSE + 8;

/** The top-left of the nth row of the sheet, below the title and the close button. */
export function inspectRowPoint(index: number): Pixel {
  return { x: INSPECT_RECT.x + PADDING, y: INSPECT_RECT.y + INSPECT_ROWS_TOP + index * PANEL_ROW_HEIGHT };
}

/** The end of the window its values are aligned against, clear of the close button above them. */
export const INSPECT_VALUE_X = INSPECT_RECT.x + INSPECT_RECT.width - PADDING;

/**
 * The camera panel (EA-12): the two buttons that turn the view with the view they are looking from, the
 * two that zoom with the step they are on, and the one that brings the map back to the middle of the
 * canvas. It floats over the board at the top of the right column, against the edge, the way the
 * prototype keeps it on the edge of the screen.
 *
 * Like the gear and the panel it opens, it is deliberately not one of `hudRects`: the scene reads it
 * before the board, and it swallows every press it covers, controls and gaps alike.
 */
export const CAMERA_BUTTON = { width: 48, height: 32, gap: 8 };

/** Space between the two rows of the grid the panel is laid out on. */
export const CAMERA_ROW_GAP = 6;

/** Where each control of the panel sits on that grid: a row, and a column counted from the left. */
export const CAMERA_CONTROLS = {
  rotateLeft: { row: 0, column: 0 },
  rotateRight: { row: 0, column: 1 },
  zoomIn: { row: 1, column: 0 },
  zoomOut: { row: 1, column: 2 },
  centre: { row: 1, column: 3 },
} as const;

export type CameraControl = keyof typeof CAMERA_CONTROLS;

/**
 * The panel is a title over those two rows, glued to the top of the right column: the log used to sit
 * here, and it has moved to the left one, which the dashboard freed (smoke test 2, slices B, C and D).
 * It stops short of the gear, whose corner it leaves alone.
 */
export const CAMERA_RECT: Rect = {
  x: RIGHT_COLUMN_X,
  y: PADDING,
  width: COLUMN_WIDTH - SETTINGS_BUTTON_RECT.width - PADDING,
  height: TITLE_HEIGHT + 2 * CAMERA_BUTTON.height + CAMERA_ROW_GAP + PADDING,
};

/** The cell of that grid at a row and a column, which is where a control or a label is drawn. */
function cameraCell(row: number, column: number): Rect {
  return {
    x: CAMERA_RECT.x + PADDING + column * (CAMERA_BUTTON.width + CAMERA_BUTTON.gap),
    y: CAMERA_RECT.y + TITLE_HEIGHT + row * (CAMERA_BUTTON.height + CAMERA_ROW_GAP),
    width: CAMERA_BUTTON.width,
    height: CAMERA_BUTTON.height,
  };
}

/** The rectangle of a control, which is the rectangle its button is built from (DT-30). */
export function cameraControlRect(control: CameraControl): Rect {
  const { row, column } = CAMERA_CONTROLS[control];
  return cameraCell(row, column);
}

/**
 * The two labels of the panel: the view the camera looks from, and the zoom step it is on. Neither is
 * pressed, so neither is one of the controls `cameraControlAt` answers with.
 */
export const CAMERA_VIEW_RECT: Rect = {
  ...cameraCell(0, 2),
  width: 2 * CAMERA_BUTTON.width + CAMERA_BUTTON.gap,
};
export const CAMERA_ZOOM_RECT: Rect = cameraCell(1, 1);

/** The control of the panel under a point, or null when the point is on none of them. */
export function cameraControlAt(point: Pixel): CameraControl | null {
  const controls = Object.keys(CAMERA_CONTROLS) as CameraControl[];
  return controls.find((control) => containsPoint(cameraControlRect(control), point)) ?? null;
}

/**
 * The panel the gear opens (EA-4): a title and two rows — the automatic end of turn, and the drag
 * sensitivity the owner asked to have in his hands. It opens under the camera panel, which is the one
 * place in the right column that overlaps nothing: the top of the column belongs to the camera, the
 * corner to the gear, and this popup to the space below them both.
 */
export const SETTINGS_PANEL_RECT: Rect = {
  x: RIGHT_COLUMN_X,
  y: CAMERA_RECT.y + CAMERA_RECT.height + PADDING,
  width: COLUMN_WIDTH,
  height: TITLE_HEIGHT + 2 * PANEL_ROW_HEIGHT + PADDING,
};

/** The first row of that panel: the toggle of "Passar o turno automaticamente". */
export const SETTINGS_TOGGLE_RECT: Rect = {
  x: SETTINGS_PANEL_RECT.x + PADDING,
  y: SETTINGS_PANEL_RECT.y + TITLE_HEIGHT,
  width: SETTINGS_PANEL_RECT.width - 2 * PADDING,
  height: PANEL_ROW_HEIGHT,
};

/**
 * The second row: the drag sensitivity, a − and a + with the value read between them. The label is
 * drawn at the left of the row and the stepper takes the rest, against its right end, which leaves the
 * label the 164 px of the row the stepper does not use. At the size of the log that is a little over
 * nineteen characters in monospace, and the label has to stay inside them: text is not clipped, so a
 * longer one would run under the −.
 */
export const SETTINGS_PAN_ROW_RECT: Rect = {
  ...SETTINGS_TOGGLE_RECT,
  y: SETTINGS_TOGGLE_RECT.y + PANEL_ROW_HEIGHT,
};

/** How wide the two signs of that stepper are, and the box the reading between them sits in. */
export const SETTINGS_STEPPER_BUTTON = 32;
export const SETTINGS_STEPPER_VALUE_WIDTH = 40;

/**
 * The − of the stepper. The three pieces are laid out from its left edge inwards, so the width of the
 * reading is fixed: the value going from 25 to 100 must never shift the signs under the player's hand.
 */
export const SETTINGS_PAN_MINUS_RECT: Rect = {
  x:
    SETTINGS_PAN_ROW_RECT.x +
    SETTINGS_PAN_ROW_RECT.width -
    SETTINGS_STEPPER_VALUE_WIDTH -
    2 * SETTINGS_STEPPER_BUTTON,
  y: SETTINGS_PAN_ROW_RECT.y + (SETTINGS_PAN_ROW_RECT.height - SETTINGS_STEPPER_BUTTON) / 2,
  width: SETTINGS_STEPPER_BUTTON,
  height: SETTINGS_STEPPER_BUTTON,
};

/** The reading between the two signs, which is where the value is drawn. */
export const SETTINGS_PAN_VALUE_RECT: Rect = {
  x: SETTINGS_PAN_MINUS_RECT.x + SETTINGS_STEPPER_BUTTON,
  y: SETTINGS_PAN_ROW_RECT.y,
  width: SETTINGS_STEPPER_VALUE_WIDTH,
  height: SETTINGS_PAN_ROW_RECT.height,
};

/** The + of the stepper, against the right end of the row, where the − leads into it. */
export const SETTINGS_PAN_PLUS_RECT: Rect = {
  ...SETTINGS_PAN_MINUS_RECT,
  x: SETTINGS_PAN_MINUS_RECT.x + SETTINGS_STEPPER_BUTTON + SETTINGS_STEPPER_VALUE_WIDTH,
};
