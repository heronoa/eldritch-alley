// The pure choices behind drawing a unit: which sheet and frame, how full the bars are, and which
// marker its team takes. The scene draws what this returns; nothing here knows about Phaser.
import type { Team, UnitState } from '../protocol';

/** The two sheets, one per side. */
export type SpriteSheet = 'ally' | 'enemy';

/** A row of pips above a unit's head: `filled` of `total`. */
export interface Pips {
  total: number;
  filled: number;
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

/** How much of the health the unit entered the match with it still has, 0..1. */
export function healthFraction(unit: { health: number; maxHealth: number }): number {
  if (unit.maxHealth <= 0) return 0;
  return Math.min(1, Math.max(0, unit.health / unit.maxHealth));
}

/**
 * The ammunition pips of a unit, or null for a class the engine gives no magazine. Mana is not a
 * resource yet (ADR 0002), so a wizard or a priest shows no pips at all.
 */
export function pipsFor(unit: { magazine: number | null; ammo: number }): Pips | null {
  if (unit.magazine === null) return null;
  return { total: unit.magazine, filled: Math.min(unit.magazine, Math.max(0, unit.ammo)) };
}

/** How the ground marker tells one team from the other: colour, and shape for the bot's side. */
export function markerStyle(team: Team): MarkerStyle {
  return { diamond: true, corners: team === 'B' };
}

/** The frame a turn-order chip shows: the idle pose of the unit's class. Unknown classes use row 0. */
export function chipFrameOf(unit: UnitState): number {
  return frameIndex(classRow(unit.primaryClass) ?? 0, 0);
}
