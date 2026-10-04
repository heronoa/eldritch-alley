// The contrast matrix the palette of the identity was chosen against.
//
// Every pair the player has to read is measured here rather than argued about, so a later change of
// one colour has to come back through this file. Two floors are in play: the WCAG AA floor for body
// text, and the AAA floor for the outlines, which are what separate a unit from the tile under it —
// the fills themselves are allowed to sit below 3:1 against a height, as section 4.1 of the M3 plan
// records.
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { heightColor } from './grid';
import {
  BG_COLOR,
  BUTTON_FILL,
  BUTTON_FILL_SELECTED,
  CORPSE_OUTLINE_COLOR,
  INK_COLOR,
  PANEL_FILL,
  PAPER_COLOR,
  TEAM_COLOR,
  TEXT_COLOR,
  TEXT_COLOR_DISABLED,
  TEXT_COLOR_ON_LIGHT,
  labelColorOn,
} from './theme';

/** WCAG 2.1 AA, the floor for anything the player reads as a sentence. */
const BODY_FLOOR = 4.5;

/** WCAG 2.1 AAA, asked of the outlines only. */
const OUTLINE_FLOOR = 7;

/** The three heights the board draws. */
const BOARD_LEVELS = [0, 1, 2];

/** The text colours are CSS strings; a ratio is measured on the 24-bit number. */
function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/** A text colour and the fill it is drawn on. */
const TEXT_PAIRS: [string, string, number][] = [
  ['body text on the night', TEXT_COLOR, BG_COLOR],
  ['panel and log copy', TEXT_COLOR, PANEL_FILL],
  ['an idle button label', TEXT_COLOR, BUTTON_FILL],
  ['a disabled label on an idle button', TEXT_COLOR_DISABLED, BUTTON_FILL],
  ['the armed button label', TEXT_COLOR_ON_LIGHT, BUTTON_FILL_SELECTED],
];

describe('text contrast', () => {
  for (const [name, text, fill] of TEXT_PAIRS) {
    it(`keeps ${name} at or above ${BODY_FLOOR}:1`, () => {
      expect(contrastRatio(hex(text), fill)).toBeGreaterThanOrEqual(BODY_FLOOR);
    });
  }

  it('keeps a team letter readable on the fill of its own unit', () => {
    for (const [team, fill] of Object.entries(TEAM_COLOR)) {
      const letter = labelColorOn(fill);

      expect([INK_COLOR, PAPER_COLOR], team).toContain(letter);
      expect(contrastRatio(fill, letter), team).toBeGreaterThanOrEqual(BODY_FLOOR);
    }
  });
});

describe('outline contrast', () => {
  it('keeps the paper marker legible on every height of the board', () => {
    for (const level of BOARD_LEVELS) {
      expect(contrastRatio(PAPER_COLOR, heightColor(level)), `level ${level}`).toBeGreaterThanOrEqual(
        OUTLINE_FLOOR,
      );
    }
  });

  it('keeps the outline of a fallen unit legible on every height of the board', () => {
    for (const level of BOARD_LEVELS) {
      expect(
        contrastRatio(CORPSE_OUTLINE_COLOR, heightColor(level)),
        `level ${level}`,
      ).toBeGreaterThanOrEqual(OUTLINE_FLOOR);
    }
  });
});
