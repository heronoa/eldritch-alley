import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import {
  ACCENT_COLOR,
  BG_COLOR,
  BUTTON_FILL,
  BUTTON_FILL_DISABLED,
  BUTTON_FILL_SELECTED,
  CORPSE_COLOR,
  CORPSE_OUTLINE_COLOR,
  CURRENT_TURN_COLOR,
  FONT_BODY,
  FONT_SIZE,
  FONT_TITLE,
  GRID_STROKE_COLOR,
  HIGHLIGHT_ATTACK_ALPHA,
  HIGHLIGHT_ATTACK_COLOR,
  HIGHLIGHT_MOVE_ALPHA,
  HIGHLIGHT_MOVE_COLOR,
  INK_COLOR,
  PANEL_FILL,
  PANEL_INNER_ALPHA,
  PANEL_INNER_STROKE,
  PANEL_STROKE,
  PAPER_COLOR,
  SELECTED_COLOR,
  STAMP_COLOR,
  STAMP_WIDTH,
  TEAM_COLOR,
  TEXT_COLOR,
  TEXT_COLOR_ALERT,
  TEXT_COLOR_DISABLED,
  TEXT_COLOR_ON_LIGHT,
  WARM_COLOR,
  cssColor,
  labelColorOn,
} from './theme';
import * as theme from './theme';

/** A letter is never below the floor WCAG sets for body text. */
const LETTER_FLOOR = 4.5;

/** Perceived brightness of a `#rrggbb` string, good enough to order two shades. */
function brightness(color: string): number {
  const value = Number.parseInt(color.slice(1), 16);
  return ((value >> 16) & 0xff) + ((value >> 8) & 0xff) + (value & 0xff);
}

describe('theme', () => {
  it('carries the palette of the identity', () => {
    expect(BG_COLOR).toBe(0x0b0e18);
    expect(PANEL_FILL).toBe(0x131622);
    expect(PANEL_STROKE).toBe(0x3a3f55);
    expect(PAPER_COLOR).toBe(0xe6dcc4);
    expect(INK_COLOR).toBe(0x0b0e18);
    expect(ACCENT_COLOR).toBe(0xc8322a);
    expect(WARM_COLOR).toBe(0xf0d9a0);
  });

  it('paints each team with the colour of the armband in the prototype', () => {
    expect(TEAM_COLOR).toEqual({ A: 0x6f95d6, B: 0xd9473d });
  });

  it('carries the colours of the board and of the units on it', () => {
    expect(SELECTED_COLOR).toBe(0xe6dcc4);
    expect(CURRENT_TURN_COLOR).toBe(0xe6dcc4);
    expect(CORPSE_COLOR).toBe(0x4a4a4a);
    expect(CORPSE_OUTLINE_COLOR).toBe(0xe6dcc4);
    expect(GRID_STROKE_COLOR).toBe(0x000000);
  });

  it('carries the HUD palette as 24-bit numbers', () => {
    const palette = {
      CORPSE_COLOR,
      CORPSE_OUTLINE_COLOR,
      CURRENT_TURN_COLOR,
      PANEL_FILL,
      PANEL_STROKE,
      BUTTON_FILL,
      BUTTON_FILL_DISABLED,
      BUTTON_FILL_SELECTED,
      HIGHLIGHT_MOVE_COLOR,
      HIGHLIGHT_ATTACK_COLOR,
      SELECTED_COLOR,
    };

    for (const [name, color] of Object.entries(palette)) {
      expect(Number.isInteger(color), name).toBe(true);
      expect(color, name).toBeGreaterThanOrEqual(0);
      expect(color, name).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('writes every text colour as a `#rrggbb` string', () => {
    const texts = { TEXT_COLOR, TEXT_COLOR_DISABLED, TEXT_COLOR_ON_LIGHT, TEXT_COLOR_ALERT };

    for (const [name, color] of Object.entries(texts)) {
      expect(color, name).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(TEXT_COLOR).toBe('#e6dcc4');
    expect(TEXT_COLOR_DISABLED).toBe('#9b937f');
    expect(TEXT_COLOR_ON_LIGHT).toBe('#0b0e18');
  });

  it('names the two typefaces of the identity and a size for each place', () => {
    expect(FONT_TITLE).toContain('Special Elite');
    expect(FONT_BODY).toContain('IBM Plex Mono');
    expect(FONT_SIZE).toEqual({ title: 32, unit: 18, log: 14, legend: 12, result: 48 });
  });

  it('no longer carries the FONT alias the scenes used to read', () => {
    // Every scene names the face it wants now, so the alias has no readers left (section 4.4).
    expect('FONT' in theme).toBe(false);
  });

  it('carries the stamp and the inner line the chrome is drawn with', () => {
    expect(STAMP_COLOR).toBe(ACCENT_COLOR);
    expect(STAMP_WIDTH).toBe(4);
    expect(PANEL_INNER_STROKE).toBe(PAPER_COLOR);
    expect(PANEL_INNER_ALPHA).toBeCloseTo(0.12, 2);
  });

  it('keeps the highlights apart from each other and faint on the board', () => {
    expect(HIGHLIGHT_MOVE_COLOR).not.toBe(HIGHLIGHT_ATTACK_COLOR);
    for (const alpha of [HIGHLIGHT_MOVE_ALPHA, HIGHLIGHT_ATTACK_ALPHA]) {
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('keeps the three button states apart', () => {
    expect(BUTTON_FILL_DISABLED).not.toBe(BUTTON_FILL);
    expect(BUTTON_FILL_SELECTED).not.toBe(BUTTON_FILL);
    expect(BUTTON_FILL_SELECTED).not.toBe(BUTTON_FILL_DISABLED);
    expect(BUTTON_FILL_SELECTED).toBe(PAPER_COLOR);
    expect(TEXT_COLOR_ON_LIGHT).toBe(cssColor(INK_COLOR));
  });

  it('keeps the dimmed text dimmer than the text it dims', () => {
    expect(brightness(TEXT_COLOR_DISABLED)).toBeLessThan(brightness(TEXT_COLOR));
  });

  it('writes a colour as the CSS string Phaser takes for text', () => {
    expect(cssColor(0x3b2f4a)).toBe('#3b2f4a');
    expect(cssColor(0x000000)).toBe('#000000');
    expect(cssColor(0xffffff)).toBe('#ffffff');
  });
});

describe('labelColorOn', () => {
  it('picks ink or paper, never a team colour', () => {
    for (const fill of [TEAM_COLOR.A, TEAM_COLOR.B, CORPSE_COLOR]) {
      expect([INK_COLOR, PAPER_COLOR]).toContain(labelColorOn(fill));
    }
  });

  it('takes the letter that reads best on the fill', () => {
    expect(labelColorOn(TEAM_COLOR.A)).toBe(INK_COLOR);
    expect(labelColorOn(TEAM_COLOR.B)).toBe(INK_COLOR);
    expect(labelColorOn(CORPSE_COLOR)).toBe(PAPER_COLOR);
  });

  it('reaches the ratio the palette was chosen against, and the floor', () => {
    // The enemy red only clears 4.5:1 with the ink `#0b0e18`, and only just: any change of either
    // colour has to come back through this test.
    const expected = [
      { fill: TEAM_COLOR.A, ratio: 6.37 },
      { fill: TEAM_COLOR.B, ratio: 4.51 },
      { fill: CORPSE_COLOR, ratio: 6.5 },
    ];

    for (const { fill, ratio } of expected) {
      const measured = contrastRatio(fill, labelColorOn(fill));
      expect(measured, `#${fill.toString(16)}`).toBeCloseTo(ratio, 2);
      expect(measured, `#${fill.toString(16)}`).toBeGreaterThanOrEqual(LETTER_FLOOR);
    }
  });
});
