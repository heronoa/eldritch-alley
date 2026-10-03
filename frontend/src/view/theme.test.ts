import { describe, expect, it } from 'vitest';
import {
  BUTTON_FILL,
  BUTTON_FILL_DISABLED,
  BUTTON_FILL_SELECTED,
  CORPSE_COLOR,
  CURRENT_TURN_COLOR,
  DARK_LABEL_COLOR,
  FONT,
  FONT_SIZE,
  GRID_STROKE_COLOR,
  HIGHLIGHT_ATTACK_COLOR,
  HIGHLIGHT_MOVE_COLOR,
  LIGHT_LABEL_COLOR,
  PANEL_FILL,
  PANEL_STROKE,
  SELECTED_COLOR,
  TEAM_COLOR,
  TEXT_COLOR,
  TEXT_COLOR_DISABLED,
  cssColor,
  labelColorOn,
} from './theme';

/** Relative luminance of a 24-bit colour, 0..1, as WCAG defines it. */
function luminance(color: number): number {
  const channels = [16, 8, 0].map((shift) => {
    const value = ((color >> shift) & 0xff) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Contrast ratio between two colours, 1..21, as WCAG defines it. */
function contrast(a: number, b: number): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('theme', () => {
  it('exports the agreed colours, font and sizes', () => {
    expect(TEAM_COLOR).toEqual({ A: 0xd9d4c7, B: 0x3b2f4a });
    expect(TEXT_COLOR).toBe('#e8e2d0');
    expect(FONT).toBe('sans-serif');
    expect(FONT_SIZE).toEqual({ title: 32, unit: 18, log: 14 });
  });

  it('exports the colours the board already used, so the scene keeps none of its own', () => {
    expect(SELECTED_COLOR).toBe(0xffd166);
    expect(CORPSE_COLOR).toBe(0x4a4a4a);
    expect(GRID_STROKE_COLOR).toBe(0x000000);
  });

  it('exports the HUD palette as 24-bit numbers', () => {
    const palette = {
      CURRENT_TURN_COLOR,
      PANEL_FILL,
      PANEL_STROKE,
      BUTTON_FILL,
      BUTTON_FILL_DISABLED,
      BUTTON_FILL_SELECTED,
      HIGHLIGHT_MOVE_COLOR,
      HIGHLIGHT_ATTACK_COLOR,
    };

    for (const [name, color] of Object.entries(palette)) {
      expect(Number.isInteger(color), name).toBe(true);
      expect(color, name).toBeGreaterThanOrEqual(0);
      expect(color, name).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('keeps the dimmed text dimmer than the text it dims', () => {
    /** Perceived brightness of a `#rrggbb` string, good enough to order two shades. */
    function brightness(color: string): number {
      const value = Number.parseInt(color.slice(1), 16);
      return ((value >> 16) & 0xff) + ((value >> 8) & 0xff) + (value & 0xff);
    }

    expect(TEXT_COLOR_DISABLED).toMatch(/^#[0-9a-f]{6}$/);
    expect(brightness(TEXT_COLOR_DISABLED)).toBeLessThan(brightness(TEXT_COLOR));
  });

  it('writes a colour as the CSS string Phaser takes for text', () => {
    expect(cssColor(0x3b2f4a)).toBe('#3b2f4a');
    expect(cssColor(0x000000)).toBe('#000000');
    expect(cssColor(0xffffff)).toBe('#ffffff');
  });

  it('measures contrast the way WCAG does', () => {
    expect(contrast(0x000000, 0xffffff)).toBeCloseTo(21, 1);
    expect(contrast(0x777777, 0x777777)).toBeCloseTo(1, 5);
  });

  it('gives the letter of a team the colour of the other team', () => {
    expect(labelColorOn(TEAM_COLOR.A)).toBe(TEAM_COLOR.B);
    expect(labelColorOn(TEAM_COLOR.B)).toBe(TEAM_COLOR.A);
    expect(DARK_LABEL_COLOR).toBe(TEAM_COLOR.B);
    expect(LIGHT_LABEL_COLOR).toBe(TEAM_COLOR.A);
  });

  it('keeps the letter readable on every fill a unit can have', () => {
    // The corpse is the case a plain swap of the two team colours would get wrong: the body turns
    // dark grey, so the letter has to go light there whatever team the unit played for.
    for (const fill of [TEAM_COLOR.A, TEAM_COLOR.B, CORPSE_COLOR]) {
      const ratio = contrast(fill, labelColorOn(fill));
      expect(ratio, `#${fill.toString(16)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('tells apart the colours that carry meaning on the board and in the bar', () => {
    // A move and an attack must not look alike, and a disabled button must not look enabled.
    expect(HIGHLIGHT_MOVE_COLOR).not.toBe(HIGHLIGHT_ATTACK_COLOR);
    expect(BUTTON_FILL_DISABLED).not.toBe(BUTTON_FILL);
    expect(BUTTON_FILL_SELECTED).not.toBe(BUTTON_FILL);
    expect(BUTTON_FILL_SELECTED).not.toBe(BUTTON_FILL_DISABLED);
    expect(CORPSE_COLOR).not.toBe(TEAM_COLOR.A);
    expect(CORPSE_COLOR).not.toBe(TEAM_COLOR.B);
    expect(SELECTED_COLOR).not.toBe(TEAM_COLOR.A);
    expect(SELECTED_COLOR).not.toBe(TEAM_COLOR.B);
  });
});
