// The account (m4-04) — the contrast matrix of the control, the five cards and the two mailed-link
// pages. The security card and the deletion confirmation joined the matrix in m5.
//
// The colours are read from the two stylesheets themselves, so a palette edit cannot leave this test
// checking values the page no longer uses: `account.css` is the sheet under test and `title.css` is
// where its tokens come from. That is also the second thing held here — the account borrows the title's
// night, paper ink, stamp red and card recipe, and invents none of its own.
//
// Every pair is a number and not an opinion: the states are in the matrix from the start, hover and
// focus included, and each value is pinned so a quiet palette edit has to say so.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../view/contrast';

const accountCss = readFileSync(new URL('./account.css', import.meta.url), 'utf8');
const titleCss = readFileSync(new URL('../title/title.css', import.meta.url), 'utf8');

/** A selector as CSS writes it, ready to be searched for inside the sheet. */
function escape(selector: string): string {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The declarations of the rule that carries `selector`, and not those of a rule written after it. */
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

/** Every colour written as a literal in a sheet: the hexes, and the functional notations. */
function literals(sheet: string): string[] {
  // Whitespace is dropped so the same colour written two ways counts as one, which is what makes this a
  // test about inventing colours rather than about formatting them.
  return [...sheet.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((found) =>
    found[0].toLowerCase().replace(/\s+/g, ''),
  );
}

const game = titleToken('game');
const night = titleToken('night');
const ink = titleToken('ink');
const muted = titleToken('muted');

describe('the account contrast matrix', () => {
  it('keeps the ink readable on the card at 7:1, the notice panel’s own floor', () => {
    // The card is opaque on purpose, so this is a flat ratio and not a worst case over the city.
    expect(contrastRatio(colour(accountCss, '.account-card-title', 'color'), game)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(colour(accountCss, '.account-name', 'color'), game)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(ink, game)).toBeCloseTo(14.12, 2);
  });

  it('keeps the muted labels, hints and section titles at 4.5:1 on the card', () => {
    expect(contrastRatio(colour(accountCss, '.account-field', 'color'), game)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colour(accountCss, '.account-hint', 'color'), game)).toBeCloseTo(6.3, 2);
    expect(contrastRatio(colour(accountCss, '.account-section', 'color'), game)).toBeCloseTo(6.3, 2);
  });

  it('keeps the problem line at 4.5:1 on the card it is said on', () => {
    expect(contrastRatio(colour(accountCss, '.account-problem', 'color'), game)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colour(accountCss, '.account-problem', 'color'), game)).toBeCloseTo(6.59, 2);
  });

  it('keeps the security card’s method line at 4.5:1 on the card', () => {
    const methods = colour(accountCss, '.account-security-methods', 'color');

    expect(methods).toBe(muted);
    expect(contrastRatio(methods, game)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(methods, game)).toBeCloseTo(6.3, 2);
  });

  it('keeps the exit recognisable: its red at 4.5:1 for the label and 3:1 for the edge', () => {
    const danger = colour(accountCss, '.account-danger', 'color');

    expect(contrastRatio(danger, game)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(danger, game)).toBeCloseTo(6.59, 2);

    // The border is a graphic pair, so its floor is 3:1. It is written as a shorthand, so the colour
    // is read out of it rather than assumed.
    const border = /^1px solid (#[0-9a-fA-F]{6})$/.exec(declared(accountCss, '.account-danger', 'border'));
    if (border === null) throw new Error('the danger border is not written as a 1px solid colour');
    expect(contrastRatio(parseInt(border[1].slice(1), 16), game)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the danger’s focus ring in the dialog’s ink, at 3:1 on the card', () => {
    expect(ring(accountCss, '.account-danger:focus-visible')).toBe(ink);
    expect(contrastRatio(ink, game)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the fields and the rows readable on the night they sit in', () => {
    // The inputs, the provider buttons, the squad rows and the history rows are wells of the title's
    // night on the card: their pairs are therefore the title's own, and the field border is a graphic
    // pair at 3:1 rather than a second colour.
    const fieldInk = colour(accountCss, '.account-field input', 'color');
    const fieldBackground = colour(accountCss, '.account-field input', 'background');
    const rowInk = colour(accountCss, '.history-row', 'color');
    const rowBackground = colour(accountCss, '.history-row', 'background');

    expect(fieldBackground).toBe(night);
    expect(rowBackground).toBe(night);
    expect(contrastRatio(fieldInk, fieldBackground)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(fieldInk, fieldBackground)).toBeCloseTo(14.75, 2);
    expect(contrastRatio(rowInk, rowBackground)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(colour(accountCss, '.history-date', 'color'), rowBackground)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrastRatio(colour(accountCss, '.history-date', 'color'), rowBackground)).toBeCloseTo(6.59, 2);

    // The border of a field is a graphic pair, so its floor is 3:1. It is written as a shorthand, so
    // the colour is read out of it rather than assumed.
    const fieldBorder = /var\(--([a-z-]+)\)/.exec(declared(accountCss, '.account-field input', 'border'));
    if (fieldBorder === null) throw new Error('the field border is not written in a token');
    expect(fieldBorder[1]).toBe('muted');
    expect(contrastRatio(titleToken(fieldBorder[1]), night)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the history’s result red at 4.5:1 on its row', () => {
    expect(contrastRatio(colour(accountCss, '.history-result', 'color'), night)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colour(accountCss, '.history-result', 'color'), night)).toBeCloseTo(6.88, 2);
  });

  it('keeps the control readable on its pool, at rest, hovered and signed in', () => {
    // The pool is the language switcher's own: the account borrows it rather than growing a second
    // half-transparent night. Over the plain night it is the night, so the title's pairs are the floor.
    const rest = colour(accountCss, '.account-control', 'color');
    const hovered = colour(accountCss, '.account-control:hover', 'color');
    const signedIn = colour(accountCss, '.account-control.on', 'color');

    expect(rest).toBe(muted);
    expect(contrastRatio(rest, night)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(rest, night)).toBeCloseTo(6.59, 2);
    expect(hovered).toBe(ink);
    expect(signedIn).toBe(ink);
    expect(contrastRatio(hovered, night)).toBeCloseTo(14.75, 2);
  });

  it('keeps the focus ring at 3:1 wherever it is drawn: on the card and on the night', () => {
    // A ring is not text, and it is the only thing that says where the keyboard is: 3:1 is its floor.
    expect(ring(accountCss, '.account-control:focus-visible')).toBe(ink);
    expect(contrastRatio(ink, game)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(ink, night)).toBeGreaterThanOrEqual(3);
  });

  it('holds the card to the game’s background and the mail page to the night', () => {
    expect(colour(accountCss, '.account-card-body', 'background')).toBe(game);
    expect(colour(accountCss, '.mail-card', 'background')).toBe(game);
    expect(colour(accountCss, '.mail', 'background')).toBe(night);
  });

  it('stands the control on the pool the language switcher already stands on', () => {
    // Two controls in the two corners of the same screen: a different opacity would read as a seam.
    expect(declared(accountCss, '.account', 'background')).toBe(
      declared(titleCss, '.lang', 'background'),
    );
  });

  it('holds the card’s border to the one the notice and the onboarding already draw', () => {
    expect(declared(accountCss, '.account-card-body', 'border')).toBe(
      declared(titleCss, '.notice-card', 'border'),
    );
  });
});

describe('the account palette', () => {
  it('invents no colour of its own: every literal here is one title.css already writes', () => {
    const known = literals(titleCss);

    for (const found of literals(accountCss)) expect(known, found).toContain(found);
    expect(literals(accountCss).length).toBeGreaterThan(0);
  });

  it('borrows only tokens the title screen defines, so a renamed token fails here and not on the screen', () => {
    const defined = new Set([...titleCss.matchAll(/--([a-z-]+)\s*:/g)].map((found) => found[1]));
    const used = new Set([...accountCss.matchAll(/var\(--([a-z-]+)\)/g)].map((found) => found[1]));

    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(defined, name).toContain(name);
  });
});
