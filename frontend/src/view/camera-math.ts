// Pan and zoom, as arithmetic. Plain: the scene hands pointer positions in and draws the answer out.
//
// EA-12 adds to the camera what the prototype worked out: whole-number zoom, a focal point that stays
// under the fingers that are pinching, and a pan limit that lets the map be pushed out of the way
// without ever being lost.
import type { CameraView } from './camera';
import type { Rect } from './layout';

/** The whole board, which is where a map opens. */
export const MIN_ZOOM = 1;

/**
 * As close as the camera goes. The steps are whole numbers: fractional zoom leaves the pixel art with
 * seams, which is why a pinch snaps when the fingers lift.
 */
export const MAX_ZOOM = 4;

/**
 * A gesture that travels less than this many canvas pixels is a tap; past it the player is panning the
 * map, and panning must never pick a cell by accident.
 */
export const TAP_SLOP_PX = 6;

/** How far past the edge of the map the camera may be pushed, as a fraction of the canvas. */
const PAST_EDGE = 0.25;

interface Point {
  x: number;
  y: number;
}

interface CanvasSize {
  width: number;
  height: number;
}

/** The nearest whole step to `zoom`, kept between the whole board and the closest view. */
export function snapZoom(zoom: number): number {
  return clampZoom(Math.round(zoom));
}

/**
 * Zooms to `zoom` about a point of the canvas, so the world under that point stays under it. The zoom
 * may be fractional: two fingers pinching are still moving, and their point is what matters. The
 * caller snaps once they lift.
 */
export function zoomAround(
  view: CameraView,
  focal: Point,
  zoom: number,
  bounds: Rect,
  canvas: CanvasSize,
): CameraView {
  const next = clampZoom(zoom);
  // The world point under the focal point keeps its place on the canvas if the centre moves by what
  // the focal point's offset from the middle of the canvas is worth at the two zoom levels.
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const centre = {
    x: view.centre.x + (focal.x - cx) * (1 / view.zoom - 1 / next),
    y: view.centre.y + (focal.y - cy) * (1 / view.zoom - 1 / next),
  };

  return { zoom: next, centre: clampPan(centre, next, bounds, canvas) };
}

/**
 * Keeps the map within reach. The centre may travel as far as it takes to bring an edge of the map to
 * the edge of the canvas, plus a quarter of a screen of slack beyond that, so the map can be pushed
 * aside but never lost.
 */
export function clampPan(centre: Point, zoom: number, bounds: Rect, canvas: CanvasSize): Point {
  const half = { x: canvas.width / 2 / zoom, y: canvas.height / 2 / zoom };
  const slack = {
    x: Math.max(0, bounds.width / 2 - half.x) + (canvas.width * PAST_EDGE) / zoom,
    y: Math.max(0, bounds.height / 2 - half.y) + (canvas.height * PAST_EDGE) / zoom,
  };
  const middle = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

  return {
    x: clamp(middle.x - slack.x, middle.x + slack.x, centre.x),
    y: clamp(middle.y - slack.y, middle.y + slack.y, centre.y),
  };
}

/** Whether a gesture that went from `start` to `end` was a tap rather than a drag. */
export function isTap(start: Point, end: Point): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) < TAP_SLOP_PX;
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function clamp(low: number, high: number, value: number): number {
  return Math.min(high, Math.max(low, value));
}
