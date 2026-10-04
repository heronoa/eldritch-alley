import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, heightColor } from './grid';
import { BG_COLOR, FACE_COLORS } from './theme';

/** Every level the board can carry, from the low ground up to a wall. */
const BOARD_LEVELS = [0, 1, 2, 3];

describe('heightColor', () => {
  it('gives a distinct colour to each level', () => {
    expect(BOARD_LEVELS.map(heightColor)).toEqual([0x23283a, 0x30364a, 0x3f4152, 0x1a1e2c]);
    expect(new Set(BOARD_LEVELS.map(heightColor)).size).toBe(BOARD_LEVELS.length);
  });

  it('keeps the top of a block in the tone its faces table gives it', () => {
    // One level, one top colour: the board draws its tiles with `heightColor` and the side faces with
    // `FACE_COLORS`, so the two tables can never disagree about the tile the player sees.
    for (const level of BOARD_LEVELS) {
      expect(heightColor(level), `level ${level}`).toBe(FACE_COLORS[level].top);
    }
  });

  it('keeps every tile apart from the night behind the board', () => {
    // A tile the same value as the page would erase the edge of the board.
    for (const level of BOARD_LEVELS) {
      expect(heightColor(level), `level ${level}`).not.toBe(BG_COLOR);
    }
  });

  it('names the tallest level the board can carry', () => {
    expect(MAX_LEVEL).toBe(BOARD_LEVELS[BOARD_LEVELS.length - 1]);
    expect(() => heightColor(MAX_LEVEL)).not.toThrow();
  });

  it('refuses a level that is not on the board', () => {
    expect(() => heightColor(MAX_LEVEL + 1)).toThrow(RangeError);
    expect(() => heightColor(-1)).toThrow(RangeError);
  });
});
