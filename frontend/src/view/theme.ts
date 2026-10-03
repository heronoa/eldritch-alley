// The palette and the type of the whole client, so the three scenes agree on both.
//
// Almost everything here is a fixed value. Two colours are derived instead of chosen: the ones of
// the board's heights, which belong to `heightColor` in `grid.ts` because they come from the level
// of the tile, and the colour of the letter on a unit, which comes from the fill under it.

/** Fill of a unit, by team. The letter on top tells the teams apart as well; both are kept. */
export const TEAM_COLOR = { A: 0xd9d4c7, B: 0x3b2f4a };

/** The colour of every piece of text the player reads. */
export const TEXT_COLOR = '#e8e2d0';

/** Text that is there to hold the place but cannot be used yet: a placeholder row, a dead button. */
export const TEXT_COLOR_DISABLED = '#6f6b7d';

/** Text drawn on a light fill, such as the armed button. The dark of the canvas background. */
export const TEXT_COLOR_ON_LIGHT = '#1b1a24';

export const FONT = 'sans-serif';

/** Points, by the place the text appears. Phaser takes the number as pixels. */
export const FONT_SIZE = { title: 32, unit: 18, log: 14 };

/** The amber of everything that is active. Shapes take it as a 24-bit number. */
const ACTIVE_AMBER = 0xe0b050;

/** The same amber for the lines of text Phaser takes as a CSS string, such as a warning. */
export const TEXT_COLOR_ALERT = cssColor(ACTIVE_AMBER);

/** The stroke around the unit the player has selected. */
export const SELECTED_COLOR = 0xffd166;

/** The slot of the unit whose turn it is, in the carousel. */
export const CURRENT_TURN_COLOR = ACTIVE_AMBER;

/** A unit that fell keeps its tile, greyed out, until the body is removed. */
export const CORPSE_COLOR = 0x4a4a4a;

export const GRID_STROKE_COLOR = 0x000000;

/** The frame of the unit panel and of the log. */
export const PANEL_FILL = 0x23222e;
export const PANEL_STROKE = 0x3a3846;

/** The fill of a button: idle, out of reach, and armed. */
export const BUTTON_FILL = 0x353341;
export const BUTTON_FILL_DISABLED = 0x26252f;
export const BUTTON_FILL_SELECTED = ACTIVE_AMBER;

/** The cells the armed mode would act on. A move and an attack never look alike. */
export const HIGHLIGHT_MOVE_COLOR = 0x4fa3d1;
export const HIGHLIGHT_ATTACK_COLOR = 0xd15b5b;

/**
 * The letter drawn on a unit. Each team takes the colour of the other one, which is what makes the
 * letter readable: on team A's light fill a light letter was invisible, at 1.14:1 against 8.4:1.
 */
export const DARK_LABEL_COLOR = TEAM_COLOR.B;
export const LIGHT_LABEL_COLOR = TEAM_COLOR.A;

/** The colour as the CSS string Phaser takes for text. Shapes take the number instead. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * The letter that reads on `fill`. The fallen are the case a plain swap of the two team colours
 * gets wrong: the body turns dark grey, so its letter has to go light whatever team it played for.
 */
export function labelColorOn(fill: number): number {
  const channels = [16, 8, 0].map((shift) => {
    const value = ((fill >> shift) & 0xff) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];

  return luminance > 0.5 ? DARK_LABEL_COLOR : LIGHT_LABEL_COLOR;
}
