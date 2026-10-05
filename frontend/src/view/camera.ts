// The map camera: how far the board is zoomed, and where its centre sits. Plain arithmetic, no Phaser.
// The HUD is not part of it: the HUD lives in its own scene and is never zoomed.
import type { Rect } from './layout';

/** The whole board, which is where the map starts. */
export const MIN_ZOOM = 1;

/** Enough to read a unit's face; more than that and the board no longer fits the canvas at all. */
export const MAX_ZOOM = 2.5;

export interface CameraView {
  zoom: number;
  centre: { x: number; y: number };
}

interface Point {
  x: number;
  y: number;
}

/**
 * Zooms by `factor` and keeps the world point under `cursor` in place, then clamps the centre so the
 * visible part of the board stays on the board. The zoom itself stays within MIN_ZOOM..MAX_ZOOM.
 */
export function zoomAbout(
  view: CameraView,
  cursor: Point,
  canvasCentre: Point,
  factor: number,
  bounds: Rect,
  canvas: { width: number; height: number },
): CameraView {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  // The world point under the cursor before the zoom, and the centre that keeps it there after it.
  const under = {
    x: view.centre.x + (cursor.x - canvasCentre.x) / view.zoom,
    y: view.centre.y + (cursor.y - canvasCentre.y) / view.zoom,
  };
  const centre = {
    x: under.x - (cursor.x - canvasCentre.x) / zoom,
    y: under.y - (cursor.y - canvasCentre.y) / zoom,
  };

  return { zoom, centre: clampCentre(centre, zoom, bounds, canvas) };
}

/**
 * Keeps the visible part of the world inside the board. On an axis where the visible part is wider than
 * the board, the centre goes to the middle of the board on that axis.
 */
export function clampCentre(
  centre: Point,
  zoom: number,
  bounds: Rect,
  canvas: { width: number; height: number },
): Point {
  return {
    x: clampAxis(centre.x, bounds.x, bounds.width, canvas.width / 2 / zoom),
    y: clampAxis(centre.y, bounds.y, bounds.height, canvas.height / 2 / zoom),
  };
}

function clampAxis(value: number, start: number, length: number, half: number): number {
  const low = start + half;
  const high = start + length - half;
  if (low > high) return start + length / 2;
  return Math.min(high, Math.max(low, value));
}
