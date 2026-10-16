// The pure choices behind drawing a unit: which sheet and frame, how full the bars are, and which
// marker its team takes. The scene draws what this returns; nothing here knows about Phaser.
import type { ResourceKind, Team, UnitState } from '../protocol';

/** The two sheets, one per side. */
export type SpriteSheet = 'ally' | 'enemy';

/**
 * A row of pips above a unit's head: `filled` of `total`. `resource` is which pool they count, so the
 * drawer knows the colour to fill them with (ADR 0011).
 */
export interface Pips {
  total: number;
  filled: number;
  resource: ResourceKind;
}

/** The ground marker of a team. Every unit gets the diamond; only the bot's side gets the corners. */
export interface MarkerStyle {
  diamond: true;
  corners: boolean;
}

/**
 * Columns of one row of the sheet, in the order the characters README lists them: idle 1 and 2,
 * walk 1 and 2, melee 1 and 2, ranged 1 and 2, resource 1 and 2.
 */
const FRAMES_PER_ROW = 10;

/** One frame of a sheet, in its own pixels: the box every pose of the character art is drawn in. */
export const FRAME = { width: 16, height: 24 };

/** How much bigger than its own pixels the board draws a frame: twice, the prototype's own size. */
export const BODY_SCALE = 2;

/**
 * The box a figure is drawn in, standing on its feet: the frame at the scale of the board. It is the
 * one place that says how big a unit is, so what the player sees and what a press lands on cannot
 * drift apart (EA-8).
 */
export const SPRITE_SIZE = { width: FRAME.width * BODY_SCALE, height: FRAME.height * BODY_SCALE };

/** How tall the figure stands above its feet, which is what the bars and the shot leave from. */
export const BODY_HEIGHT = SPRITE_SIZE.height;

/** The sheet of a team. A is the human side, B the bot. */
export function spriteSheetOf(team: Team): SpriteSheet {
  return team === 'A' ? 'ally' : 'enemy';
}

/**
 * The row of the sheet a class is drawn from. The sheet carries seven rows, but only the three
 * classes of the roster are in use; any other class has no row, and the caller falls back to row 0.
 */
export function classRow(primaryClass: string): number | null {
  switch (primaryClass) {
    case 'sniper':
      return 3;
    case 'wizard':
      return 4;
    case 'priest':
      return 5;
    default:
      return null;
  }
}

/** The index of a frame in the sheet: ten columns per row. */
export function frameIndex(row: number, column: number): number {
  return row * FRAMES_PER_ROW + column;
}

/** The row a frame index falls in, which is the row of the class that owns it. */
export function frameRow(frame: number): number {
  return Math.floor(frame / FRAMES_PER_ROW);
}

/** The column a frame index falls in, counted from the left of the row. */
export function frameColumn(frame: number): number {
  return frame % FRAMES_PER_ROW;
}

/** Where a frame sits in its sheet: the box a drawing cuts out of it, in the sheet's own pixels. */
export interface FrameBox {
  column: number;
  row: number;
  width: number;
  height: number;
}

/** The box of a frame in the sheet, which is what a `drawImage` of one needs. */
export function frameBox(frame: number): FrameBox {
  return { column: frameColumn(frame), row: frameRow(frame), width: FRAME.width, height: FRAME.height };
}

/**
 * The columns of a row that hold the two idle poses. A row starts with them, so the resting pose of
 * every class is next to the left edge of the sheet.
 */
export const IDLE_COLUMNS: readonly number[] = [0, 1];

/**
 * The idle frame of one row. `phase` is which of the two poses: the breathing cycle the animation
 * module works out, or a plain turn count. Any integer is read as one of the two.
 */
export function rowIdleFrame(row: number, phase: number): number {
  return frameIndex(row, IDLE_COLUMNS[((phase % IDLE_COLUMNS.length) + IDLE_COLUMNS.length) % IDLE_COLUMNS.length]);
}

/**
 * The frame a unit is drawn with when it is doing nothing: the idle pose of its class, in the row of
 * that class, or the first row for a class the sheet does not carry.
 *
 * This is the one place that answers it, so the sprite standing on the board and the flat figure the
 * turn draws (smoke test 2, slice A) are the same drawing of the same character.
 */
export function idleFrameOf(unit: { primaryClass: string }, phase = 0): number {
  return rowIdleFrame(classRow(unit.primaryClass) ?? 0, phase);
}

/** How much of the health the unit entered the match with it still has, 0..1. */
export function healthFraction(unit: { health: number; maxHealth: number }): number {
  if (unit.maxHealth <= 0) return 0;
  return Math.min(1, Math.max(0, unit.health / unit.maxHealth));
}

/**
 * The pips of a unit's basic-attack pool, or null for a class the engine gives no pool at all. A
 * weapon class counts its rounds and a magic one its mana (ADR 0011); the count is the same rule, and
 * only the colour the drawer picks differs.
 */
export function pipsFor(unit: {
  magazine: number | null;
  ammo: number;
  resourceKind: ResourceKind | null;
}): Pips | null {
  if (unit.magazine === null) return null;
  return {
    total: unit.magazine,
    filled: Math.min(unit.magazine, Math.max(0, unit.ammo)),
    // A unit that carries a magazine and names no kind is a weapon class, which is the rule the
    // engine fills the field in with: a pool that exists is always of one kind.
    resource: unit.resourceKind ?? 'ammo',
  };
}

/**
 * How solid a unit is drawn while somebody else is on turn. Decision D2 of the EA-3 plan assumed
 * 0.6 for the units that are not acting, to be confirmed or changed after a phone test.
 */
export const DIM_ALPHA = 0.6;

/** What the turn says about drawing a unit: the one on turn carries the arrow, the others step back. */
export interface TurnLook {
  /** True only for the unit acting now: it carries the arrow over its head. */
  arrow: boolean;
  /** Alpha of the whole figure, 0..1. */
  alpha: number;
}

/** How a unit is drawn: on turn it is at full strength under the arrow, off turn it steps back. */
export function turnLook(isActive: boolean): TurnLook {
  return { arrow: isActive, alpha: isActive ? 1 : DIM_ALPHA };
}

/** How the ground marker tells one team from the other: colour, and shape for the bot's side. */
export function markerStyle(team: Team): MarkerStyle {
  return { diamond: true, corners: team === 'B' };
}

/** The frame a turn-order chip shows: the idle pose of the unit's class. Unknown classes use row 0. */
export function chipFrameOf(unit: UnitState): number {
  return idleFrameOf(unit);
}
