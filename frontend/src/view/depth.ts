// The draw order of the match, in one place (DT-47). The scenes take every depth from here, so the
// order is tested once in `depth.test.ts`, and a scene that declares its own value fails
// `scenes/depth-usage.test.ts`.
//
// The HUD is not in the numeric order. It is a scene of its own, added after the match scene in
// `main.ts`, so Phaser draws it above by its place in the scene list.
import { depthOfCell, depthOfUnit } from './iso';
import type { Cell } from './grid';

/** The backdrop is under every cell: the shallowest of them is at 0. */
const BACKDROP_DEPTH = -1;

/** A highlight sits on its cell, and under the unit standing on it (a unit is at +0.5). */
const HIGHLIGHT_STEP = 0.1;

/**
 * Mud covers the whole cell (ADR 0023 §4): over the highlight that marks it, and still under the
 * unit standing in it, so a figure or a body in the mud is never painted over by it.
 */
const MUD_STEP = 0.15;

/**
 * The mark of the tile under the mouse sits over the highlight of that same cell, so its outline is
 * read over the wash it may be drawn on, and it is still under the unit standing there.
 */
const HOVER_STEP = 0.2;

/**
 * The wires and the clotheslines: over every cell and every unit — the deepest of the maps puts a unit
 * at 18.5 — and under the attack effects, which are thrown over the whole board.
 */
const OVERLAY_DEPTH = 19;

/**
 * Draw order of the attack effects: above every piece of the board — the deepest of the maps the
 * server ships puts a unit on (9, 9), at 18.5.
 */
const EFFECT_DEPTH = 20;

export const LAYER = {
  backdrop: BACKDROP_DEPTH,
  board: depthOfCell,
  highlight: (cell: Cell): number => depthOfCell(cell) + HIGHLIGHT_STEP,
  mud: (cell: Cell): number => depthOfCell(cell) + MUD_STEP,
  hover: (cell: Cell): number => depthOfCell(cell) + HOVER_STEP,
  unit: depthOfUnit,
  overlay: OVERLAY_DEPTH,
  effect: EFFECT_DEPTH,
  hud: 'scene-order',
} as const;
