import { describe, expect, it } from 'vitest';
import { EFFECTS, attackStyle } from './effects';
import {
  BUTTON_FILL,
  BUTTON_FILL_DISABLED,
  BUTTON_FILL_SELECTED,
  HIGHLIGHT_ATTACK_COLOR,
  HIGHLIGHT_MOVE_COLOR,
  TEAM_COLOR,
} from './theme';

/** The timelines of the prototype, section 3 of the characters README. */
const RANGED_TRAVEL_MS = { sniper: 140, wizard: 520, priest: 300 };

/** Neon is the colour of magic and of nothing else. */
const MAGIC_COLORS = [0xff3df2, 0x3de9ff];

describe('attackStyle', () => {
  it('is melee when the target is adjacent, orthogonally or diagonally', () => {
    expect(attackStyle({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe('melee');
    expect(attackStyle({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe('melee');
  });

  it('is ranged from two cells away, orthogonally or diagonally', () => {
    expect(attackStyle({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe('ranged');
    expect(attackStyle({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe('ranged');
  });
});

describe('EFFECTS', () => {
  it('covers the three classes of the roster', () => {
    expect(Object.keys(EFFECTS).sort()).toEqual(['priest', 'sniper', 'wizard']);
  });

  it('gives every class both an attack at reach and one at range', () => {
    for (const [name, pair] of Object.entries(EFFECTS)) {
      expect(pair.melee, name).toBeDefined();
      expect(pair.ranged, name).toBeDefined();
      expect(pair.melee.travelMs, name).toBe(0);
      expect(pair.ranged.travelMs, name).toBe(RANGED_TRAVEL_MS[name as keyof typeof RANGED_TRAVEL_MS]);
    }
  });

  it('names the effect of each class and distance', () => {
    expect(EFFECTS.sniper.melee.kind).toBe('pistol-flash');
    expect(EFFECTS.sniper.ranged.kind).toBe('tracer');
    expect(EFFECTS.wizard.melee.kind).toBe('gust');
    expect(EFFECTS.wizard.ranged.kind).toBe('missiles');
    expect(EFFECTS.priest.melee.kind).toBe('glow-impact');
    expect(EFFECTS.priest.ranged.kind).toBe('sky-column');
  });

  it('staggers the three darts of the magic missiles', () => {
    expect(EFFECTS.wizard.ranged.staggerMs).toBe(70);
  });

  it('keeps neon out of the mundane palette', () => {
    const mundane = [
      TEAM_COLOR.A,
      TEAM_COLOR.B,
      BUTTON_FILL,
      BUTTON_FILL_DISABLED,
      BUTTON_FILL_SELECTED,
      HIGHLIGHT_MOVE_COLOR,
      HIGHLIGHT_ATTACK_COLOR,
    ];

    for (const color of MAGIC_COLORS) {
      expect(mundane, `#${color.toString(16)}`).not.toContain(color);
    }

    // Magenta is the wizard's and cyan is the priest's; no class borrows the other's neon.
    expect(EFFECTS.wizard.ranged.color).toBe(0xff3df2);
    expect(EFFECTS.priest.ranged.color).toBe(0x3de9ff);
    expect(EFFECTS.priest.melee.color).toBe(0x3de9ff);
  });
});
