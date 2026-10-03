import { describe, expect, it } from 'vitest';
import { FONT, FONT_SIZE, TEAM_COLOR, TEXT_COLOR } from './theme';

describe('theme', () => {
  it('exports the agreed colours, font and sizes', () => {
    expect(TEAM_COLOR).toEqual({ A: 0xd9d4c7, B: 0x3b2f4a });
    expect(TEXT_COLOR).toBe('#e8e2d0');
    expect(FONT).toBe('sans-serif');
    expect(FONT_SIZE).toEqual({ title: 32, unit: 18, log: 14 });
  });
});
