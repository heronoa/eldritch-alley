// Onboarding M3 — the contrast matrix of the sequence over the title.
//
// The colours are read from the two stylesheets themselves, so a palette edit cannot leave this test
// checking values the page no longer uses: `onboarding.css` is the sheet under test and `title.css` is
// where its tokens come from. That is also the second thing held here — the overlay borrows the title's
// night, its paper ink and its stamp red, and invents none of its own.
//
// Every pair is a number and not an opinion (`visual-identity.lesson.md`): the states are in the matrix
// from the start, hover and focus included, and the one value below the floor is recorded rather than
// hidden.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../view/contrast';

const overlayCss = readFileSync(new URL('./onboarding.css', import.meta.url), 'utf8');
const titleCss = readFileSync(new URL('../title/title.css', import.meta.url), 'utf8');

/** A selector as CSS writes it, ready to be searched for inside the sheet. */
function escape(selector: string): string {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The declarations of the rule that carries `selector`, which may be one of several the rule groups.
 * Matching is exact: `.onboarding-back` finds its own rule and not the `:hover` one after it.
 */
function declarations(sheet: string, selector: string): string {
  const found = new RegExp(`(?:^|[,\\n])\\s*${escape(selector)}\\s*(?:,[^{}]*)?\\{([^{}]*)\\}`, 'm').exec(
    sheet,
  );
  if (found === null) throw new Error(`no rule for ${selector}`);
  return found[1];
}

/** What a rule sets one property to, as written. */
function declared(sheet: string, selector: string, property: string): string {
  const found = new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`).exec(declarations(sheet, selector));
  if (found === null) throw new Error(`${selector} does not set ${property}`);
  return found[1].trim();
}

/** The hex colour a custom property is set to on `:root` in the title screen, where the palette lives. */
function titleToken(name: string): number {
  const found = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(titleCss);
  if (found === null) throw new Error(`title.css does not set --${name}`);
  return parseInt(found[1].slice(1), 16);
}

/**
 * The colour a rule sets one property to: a token of the title's palette, or a literal both sheets
 * already write. A value that is neither is an error and not a silent zero.
 */
function colour(sheet: string, selector: string, property: string): number {
  const value = declared(sheet, selector, property);
  const borrowed = /^var\(--([a-z-]+)\)$/.exec(value);

  if (borrowed !== null) return titleToken(borrowed[1]);
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return parseInt(value.slice(1), 16);

  throw new Error(`${selector} sets ${property} to ${value}, which is neither a token nor a hex colour`);
}

/** The colour a rule draws its focus ring in, read from the `outline` shorthand it is written as. */
function ring(sheet: string, selector: string): number {
  const value = declared(sheet, selector, 'outline');
  const borrowed = /var\(--([a-z-]+)\)/.exec(value);

  if (borrowed === null) throw new Error(`${selector} draws its ring in ${value}, which is not a token`);
  return titleToken(borrowed[1]);
}

/** A colour drawn over another at an opacity, channel by channel: what the eye ends up seeing. */
function blendOver(top: number, bottom: number, alpha: number): number {
  const channel = (shift: number): number =>
    Math.round(((top >> shift) & 0xff) * alpha + ((bottom >> shift) & 0xff) * (1 - alpha));

  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Every colour written as a literal in a sheet: the hexes, and the functional notations. */
function literals(sheet: string): string[] {
  // Whitespace is dropped so the same colour written two ways counts as one, which is what makes this a
  // test about inventing colours rather than about formatting them.
  return [...sheet.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((found) =>
    found[0].toLowerCase().replace(/\s+/g, ''),
  );
}

const card = colour(overlayCss, '.onboarding-card', 'background');
const night = titleToken('night');
const ink = titleToken('ink');

describe('the overlay contrast matrix', () => {
  it('keeps the card readable on the card itself, at the 7:1 the notice panel is held to', () => {
    // The card is opaque on purpose, so this is a flat ratio and not a worst case over whatever the city
    // behind it is drawing.
    expect(contrastRatio(colour(overlayCss, '.onboarding-heading', 'color'), card)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(colour(overlayCss, '.onboarding-body', 'color'), card)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(colour(overlayCss, '.onboarding-body', 'color'), card)).toBeCloseTo(14.12, 2);
  });

  it('keeps the back and skip controls readable at rest, in the muted ink', () => {
    const rest = colour(overlayCss, '.onboarding-back', 'color');

    expect(rest).toBe(titleToken('muted'));
    expect(contrastRatio(rest, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(rest, card)).toBeCloseTo(6.3, 2);
  });

  it('keeps them readable on hover, where the words come up to the card’s own ink', () => {
    const hovered = colour(overlayCss, '.onboarding-back:hover:enabled', 'color');

    expect(hovered).toBe(ink);
    expect(contrastRatio(hovered, card)).toBeCloseTo(14.12, 2);
  });

  it('keeps the focus ring at 3:1 wherever it is drawn: on the card, and on the night of the footer', () => {
    // A ring is not text, and it is the only thing that says where the keyboard is: 3:1 is its floor.
    expect(ring(overlayCss, '.onboarding-back:focus-visible')).toBe(ink);
    expect(contrastRatio(ink, card)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(ring(overlayCss, '.how-to-play:focus-visible'), night)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the step dots readable as markers: unlit and lit, at the 3:1 bar for graphics', () => {
    // A dot is a marker and not a sentence, so its bar is 3:1. The lit one is the stamp red the title
    // screen already uses for the mark it lands on the call to action.
    const unlit = colour(overlayCss, '.onboarding-dots span', 'background');
    const lit = colour(overlayCss, '.onboarding-dots span.on', 'background');

    expect(contrastRatio(unlit, card)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(lit, card)).toBeGreaterThanOrEqual(3);
    expect(unlit).toBe(titleToken('muted'));
    expect(lit).toBe(titleToken('stamp'));
  });

  it('keeps the forward button readable on the title screen’s own red, which it wears instead of restyling', () => {
    // The button carries `.cta` from the title, so its numbers are the title's own — and this rule
    // re-declares neither the colour nor the background, which is what keeps the two screens from
    // drifting into two reds and two inks.
    const forward = declarations(overlayCss, '.onboarding-forward');
    const label = colour(titleCss, '.cta', 'color');
    const resting = colour(titleCss, '.cta', 'background');
    const hovered = colour(titleCss, '.cta:hover:enabled', 'background');

    expect(forward).not.toMatch(/(^|[;{\s])(color|background)\s*:/);
    expect(contrastRatio(label, resting)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(label, resting)).toBeCloseTo(5.56, 2);
    expect(contrastRatio(label, hovered)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(label, hovered)).toBeCloseTo(4.73, 2);
  });

  it('keeps the footer link readable on the night it sits on, at rest and hovered', () => {
    // The footer's own grey is the recorded 4.02:1 gap of the title screen, so the link does not inherit
    // it: it reads in the muted ink and comes up to the paper ink under the pointer.
    const rest = colour(overlayCss, '.how-to-play', 'color');
    const hovered = colour(overlayCss, '.how-to-play:hover', 'color');

    expect(contrastRatio(rest, night)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(rest, night)).toBeCloseTo(6.59, 2);
    expect(contrastRatio(hovered, night)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hovered, night)).toBeCloseTo(14.75, 2);
  });

  // Known gap, recorded and not fixed here: the back button of the first card is disabled, and the
  // `opacity` that says so takes --muted down to about 3.8:1. WCAG exempts a disabled control from the
  // text floor, and dimming it is the whole cue, so this records the number instead of hiding it. Raising
  // it means another way of saying "disabled", which changes the look.
  it('records the disabled back button, which is below the 4.5:1 floor', () => {
    const dimmed = Number(declared(overlayCss, '.onboarding-back:disabled', 'opacity'));

    expect(dimmed).toBeCloseTo(0.72, 2);
    expect(contrastRatio(blendOver(titleToken('muted'), card, dimmed), card)).toBeCloseTo(3.79, 2);
  });

  it('holds the card to the game’s background, so a bright pixel behind it cannot reach the words', () => {
    expect(card).toBe(titleToken('game'));
  });
});

describe('the overlay palette', () => {
  it('invents no colour of its own: every literal here is one title.css already writes', () => {
    const known = literals(titleCss);

    for (const found of literals(overlayCss)) expect(known, found).toContain(found);
    expect(literals(overlayCss).length).toBeGreaterThan(0);
  });

  it('borrows only tokens the title screen defines, so a renamed token fails here and not on the screen', () => {
    const defined = new Set([...titleCss.matchAll(/--([a-z-]+)\s*:/g)].map((found) => found[1]));
    const used = new Set([...overlayCss.matchAll(/var\(--([a-z-]+)\)/g)].map((found) => found[1]));

    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(defined, name).toContain(name);
  });
});
