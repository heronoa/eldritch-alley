import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../view/contrast';

// Title M3 — the contrast matrix of the title screen. The colours are read from `title.css` itself, so
// a palette change cannot leave the test checking values the page no longer uses.
const css = readFileSync(new URL('./title.css', import.meta.url), 'utf8');

/** The hex colour a custom property is set to on `:root`. */
function token(name: string): number {
  const found = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (found === null) throw new Error(`title.css does not set --${name}`);
  return parseInt(found[1].slice(1), 16);
}

/** The hex colour a rule sets its property to, for a selector written exactly as it is in the file. */
function literal(selector: string, property: string): number {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (block === null) throw new Error(`title.css has no rule for ${selector}`);
  const found = new RegExp(`${property}:\\s*(#[0-9a-fA-F]{6})`).exec(block[1]);
  if (found === null) throw new Error(`${selector} does not set ${property} to a hex colour`);
  return parseInt(found[1].slice(1), 16);
}

const night = token('night');
const ink = token('ink');
const muted = token('muted');
const stamp = token('stamp');
const game = token('game');
const cta = literal('.cta', 'background');
const ctaHover = literal('.cta:hover:enabled', 'background');
const ctaText = literal('.cta', 'color');
const footer = literal('footer', 'color');
const noticeBar = literal('.notice-heading', 'background');
const noticePanel = literal('.notice-card', 'background');

describe('the title screen contrast matrix', () => {
  it('keeps the ink readable on the night background at 7:1', () => {
    expect(contrastRatio(ink, night)).toBeGreaterThanOrEqual(7);
  });

  it('keeps the muted meta and tagline text at 4.5:1 on the night background', () => {
    expect(contrastRatio(muted, night)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the stamp at 4.5:1 on the night background, where the meta line uses it', () => {
    expect(contrastRatio(stamp, night)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the granted stamp at 3:1, which is the bar for large text', () => {
    expect(contrastRatio(stamp, night)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the button text at 4.5:1 on the button, with the prototype value at 5.56', () => {
    expect(contrastRatio(ctaText, cta)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(ctaText, cta)).toBeCloseTo(5.56, 2);
  });

  // Known gap, recorded and not fixed here: the hovered button is about 4.1:1 under the ink, below the
  // 4.5:1 the plan asks for. The hover colour is part of the approved look, so the owner decides.
  it('records the ink on the hovered button, which is below 4.5:1', () => {
    expect(contrastRatio(ink, ctaHover)).toBeCloseTo(4.15, 2);
  });

  // Known gap, recorded and not fixed here: the footer is 11 px text at about 4.0:1, below the 4.5:1 the
  // plan asks for. Raising it changes the approved look, so the owner decides. This test records the value
  // so a change to the footer colour shows up here.
  it('records the footer colour on the night background, which is below 4.5:1', () => {
    expect(contrastRatio(footer, night)).toBeCloseTo(4.02, 2);
  });
});

describe('the failure notice contrast matrix', () => {
  // The bar is the button's red and not `--accent`: the ink on `--accent` is 3.90, under the 4.5 a 12px
  // line needs. The value is pinned so a palette edit that quietly revisits this has to say so.
  it('keeps the heading readable on the bar', () => {
    expect(contrastRatio(ink, noticeBar)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(ink, noticeBar)).toBeCloseTo(4.88, 2);
  });

  // The panel is opaque on purpose, so the sentence's contrast does not depend on what the city behind it
  // happens to be drawing. That is what lets this be a flat 14:1 instead of a worst case over the canvas.
  it('keeps the sentence well past 7:1 on the panel it sits on', () => {
    expect(contrastRatio(ink, noticePanel)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(ink, noticePanel)).toBeCloseTo(14.12, 2);
  });

  // The two colours the notice borrows, held to the things they are borrowed from: the bar is the button's
  // red, so the warning and the action are one red, and the panel is the game's own background. A palette
  // edit therefore cannot leave the notice behind without failing here.
  it('holds the bar to the button red, and the panel to the game background', () => {
    expect(noticeBar).toBe(cta);
    expect(noticePanel).toBe(game);
  });
});
