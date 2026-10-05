// The contrast matrix the palette of the identity was chosen against.
//
// Every pair the player has to read is measured here rather than argued about, so a later change of
// one colour has to come back through this file. Two floors are in play: the WCAG AA floor for body
// text, and the AAA floor for the outlines, which are what separate a unit from the tile under it —
// the fills themselves are allowed to sit below 3:1 against a tile top, as section 4.1 of the M3 plan
// records.
//
// Since map fidelity M2 the board is drawn with the prototype's own tiles, so the ground the marker
// and the panels are measured against is the palette of `prototype-palette.ts`, letter by letter.
import { describe, expect, it } from 'vitest';
import { TILE_PALETTE } from '../maps/prototype-palette';
import { PROTOTYPE_MAPS } from '../maps/prototype-maps';
import { contrastRatio, luminance } from './contrast';
import { PANEL_ALPHA } from './layout';
import {
  BG_COLOR,
  BUTTON_FILL,
  BUTTON_FILL_SELECTED,
  CORPSE_OUTLINE_COLOR,
  INK_COLOR,
  PANEL_FILL,
  PANEL_INNER_ALPHA,
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

/** How visible the line drawn just inside a panel has to stay. It is decoration, but not invisible. */
const INNER_LINE_FLOOR = 1.2;

/** Every tile the three maps draw, which is every ground a unit or a panel can stand on. */
const LETTERS_IN_USE: readonly string[] = [
  ...new Set(PROTOTYPE_MAPS.flatMap((map) => [...map.tiles.join('')])),
].sort();

/** The text colours are CSS strings; a ratio is measured on the 24-bit number. */
function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/** The top face of a tile, as the 24-bit number the contrast helpers measure. */
function topOf(letter: string): number {
  return hex(TILE_PALETTE[letter].top);
}

/** The lightest tile a panel can end up over, which is the worst case for the text on it. */
const LIGHTEST_TOP = LETTERS_IN_USE.map(topOf).reduce((lightest, top) =>
  luminance(top) > luminance(lightest) ? top : lightest,
);

/**
 * The colour a player sees when `fill` is drawn at `alpha` over `back`, channel by channel: what
 * Phaser's `setAlpha` composes. A panel floats over the board, so this is the colour its text
 * really sits on, not `PANEL_FILL` on its own.
 */
function over(fill: number, alpha: number, back: number): number {
  const channel = (shift: number) => {
    const front = (fill >> shift) & 0xff;
    const behind = (back >> shift) & 0xff;
    return Math.round(front * alpha + behind * (1 - alpha));
  };

  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** The panel as it looks over a tile. */
function panelOver(back: number): number {
  return over(PANEL_FILL, PANEL_ALPHA, back);
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
  it('keeps the paper marker legible on every tile the three maps draw', () => {
    for (const letter of LETTERS_IN_USE) {
      expect(contrastRatio(PAPER_COLOR, topOf(letter)), `${letter} ${TILE_PALETTE[letter].top}`).toBeGreaterThanOrEqual(
        OUTLINE_FLOOR,
      );
    }
  });

  it('keeps the outline of a fallen unit legible on every tile the three maps draw', () => {
    for (const letter of LETTERS_IN_USE) {
      expect(
        contrastRatio(CORPSE_OUTLINE_COLOR, topOf(letter)),
        `${letter} ${TILE_PALETTE[letter].top}`,
      ).toBeGreaterThanOrEqual(OUTLINE_FLOOR);
    }
  });
});

// The panels float over the board, so their copy is read on the fill composed with the tile behind
// it, not on `PANEL_FILL` alone.
describe('overlay contrast', () => {
  it('keeps panel copy readable over the night behind the board', () => {
    expect(contrastRatio(hex(TEXT_COLOR), panelOver(BG_COLOR))).toBeGreaterThanOrEqual(BODY_FLOOR);
  });

  it('keeps panel copy readable over the lightest tile a panel can cover', () => {
    expect(contrastRatio(hex(TEXT_COLOR), panelOver(LIGHTEST_TOP))).toBeGreaterThanOrEqual(BODY_FLOOR);
  });

  it('keeps a disabled row readable over the panel', () => {
    expect(
      contrastRatio(hex(TEXT_COLOR_DISABLED), panelOver(BG_COLOR)),
    ).toBeGreaterThanOrEqual(BODY_FLOOR);
  });

  it('keeps the line drawn just inside a panel visible over its fill', () => {
    const line = over(PAPER_COLOR, PANEL_INNER_ALPHA, PANEL_FILL);

    expect(contrastRatio(line, PANEL_FILL)).toBeGreaterThanOrEqual(INNER_LINE_FLOOR);
  });

  it('measures against the lightest tile the three maps actually draw', () => {
    // The cases above keep meaning what they meant: the constant is the lightest of the letters in
    // use, so no tile of any of the three maps is lighter than the worst case measured here.
    for (const letter of LETTERS_IN_USE) {
      expect(luminance(topOf(letter)), `${letter} ${TILE_PALETTE[letter].top}`).toBeLessThanOrEqual(
        luminance(LIGHTEST_TOP),
      );
    }
  });
});
