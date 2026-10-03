// The palette and the type of the whole client, so the three scenes agree on both.
//
// The colours of the board's heights are deliberately absent: they belong to `heightColor`, which
// derives them from the level of the tile. Everything here is a fixed value, nothing is computed.

/** Fill of a unit, by team. The letter on top tells the teams apart as well; both are kept. */
export const TEAM_COLOR = { A: 0xd9d4c7, B: 0x3b2f4a };

/** The colour of every piece of text the player reads. */
export const TEXT_COLOR = '#e8e2d0';

export const FONT = 'sans-serif';

/** Points, by the place the text appears. Phaser takes the number as pixels. */
export const FONT_SIZE = { title: 32, unit: 18, log: 14 };
