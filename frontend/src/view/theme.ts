// The palette and the type of the whole client, so the three scenes agree on both.
//
// Almost everything here is a fixed value. The board's own colours are not here any more: since map
// fidelity M2 the tiles are drawn with the prototype's palette, letter by letter, from
// `maps/prototype-palette.ts`. What is derived rather than chosen is the colour of the letter on a
// unit, which comes from the fill under it.

import { contrastRatio } from './contrast';

/** The canvas and the page behind it: the night the whole identity sits on. */
export const BG_COLOR = 0x0b0e18;

/** The fill of a unit, by team. A is the human side (ink blue), B the bot (stamp red). */
export const TEAM_COLOR = { A: 0x6f95d6, B: 0xd9473d };

/** Aged paper: the ink of every shape a player is meant to read as a mark. */
export const PAPER_COLOR = 0xe6dcc4;

/** The ink a letter takes on a paper fill: the night itself, so the two never clash. */
export const INK_COLOR = BG_COLOR;

/** The stamp red: a decoration, the outline of the primary action, and the warning line. */
export const ACCENT_COLOR = 0xc8322a;

/** The colour of every piece of text the player reads. */
export const TEXT_COLOR = cssColor(PAPER_COLOR);

/** Text that is there to hold the place but cannot be used yet: a placeholder row, a dead button. */
export const TEXT_COLOR_DISABLED = '#9b937f';

/** Text drawn on a light fill, such as the armed button. */
export const TEXT_COLOR_ON_LIGHT = cssColor(INK_COLOR);

/** The same red for the lines of text Phaser takes as a CSS string, such as a warning. */
export const TEXT_COLOR_ALERT = cssColor(ACCENT_COLOR);

/** The frame of the unit panel and of the log: carbon paper over the night. */
export const PANEL_FILL = 0x131622;
export const PANEL_STROKE = 0x3a3f55;

/** The second line of a panel, drawn just inside the frame: paper seen through the dark. */
export const PANEL_INNER_STROKE = PAPER_COLOR;
export const PANEL_INNER_ALPHA = 0.12;

/** The fill of a button: idle, out of reach, and armed. The armed one is paper, so it reads. */
export const BUTTON_FILL = 0x23283a;
export const BUTTON_FILL_DISABLED = 0x171b28;
export const BUTTON_FILL_SELECTED = PAPER_COLOR;

/** The stroke around the unit the player has selected, and the ring of the one on turn. */
export const SELECTED_COLOR = PAPER_COLOR;
export const CURRENT_TURN_COLOR = PAPER_COLOR;

/** A unit that fell keeps its tile, greyed out, until the body is removed. */
export const CORPSE_COLOR = 0x4a4a4a;

/** The outline of a fallen unit, so its silhouette reads on every height. */
export const CORPSE_OUTLINE_COLOR = PAPER_COLOR;

/** Ammunition pips. */
export const WARM_COLOR = 0xf0d9a0;

/** The cells the armed mode would act on. A move and an attack never look alike. */
export const HIGHLIGHT_MOVE_COLOR = TEAM_COLOR.A;
export const HIGHLIGHT_MOVE_ALPHA = 0.42;
export const HIGHLIGHT_ATTACK_COLOR = ACCENT_COLOR;
export const HIGHLIGHT_ATTACK_ALPHA = 0.48;

export const GRID_STROKE_COLOR = 0x000000;

/** The frame stamped around the result of a finished match. Decoration: it carries no information. */
export const STAMP_COLOR = ACCENT_COLOR;
export const STAMP_WIDTH = 4;

/** Titles, panel headings and the result: the typewriter of the identity. */
export const FONT_TITLE = '"Special Elite", "Courier New", monospace';

/** Everything else: the labels, the log, the panel rows. */
export const FONT_BODY = '"IBM Plex Mono", ui-monospace, monospace';

/**
 * Points, by the place the text appears. Phaser takes the number as pixels. The legend is smaller
 * than the log on purpose: its two lines have to fit the column left of the sidebar, and at the log
 * size the first one runs into the unit panel.
 */
export const FONT_SIZE = { title: 32, unit: 18, log: 14, legend: 12, result: 48 };

/** The colour as the CSS string Phaser takes for text. Shapes take the number instead. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * The letter that reads on `fill`: whichever of the two inks of the identity contrasts more with
 * it. It is never a team colour, so the fallen — whose fill turns grey whatever team they played
 * for — get a paper letter like any other dark fill.
 */
export function labelColorOn(fill: number): number {
  return contrastRatio(fill, INK_COLOR) >= contrastRatio(fill, PAPER_COLOR) ? INK_COLOR : PAPER_COLOR;
}
