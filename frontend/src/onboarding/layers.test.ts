// Onboarding — the layers of the page, read as numbers: what the sequence, the notice, the language
// switcher and the board are painted in, and what that order is for.
//
// The switcher is why this file exists. The sequence borrows the title's language instead of carrying a
// switcher of its own, so it has to leave it reachable while the cards are up, and the order below is
// what makes it reachable. The numbers alone do not carry that, and a real browser settled the rest:
// with the switcher inside `.title` the overlay swallows the click whatever `z-index` the box is given,
// because `.title` is `position: fixed` and a fixed box opens a stacking context of its own that no
// descendant climbs out of; with the switcher a box of its own outside `.title` the click lands on its
// button, and `#game` one number higher keeps it under the board when a match takes the screen. The
// reading here holds the numbers and the structure they rest on — the pointer is the browser's to
// confirm.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const titleCss = readFileSync(new URL('../title/title.css', import.meta.url), 'utf8');
const overlayCss = readFileSync(new URL('./onboarding.css', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

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

/**
 * The layer a rule paints in. Every box in the stack has to say it in full: `auto` is not a number to
 * order by, so a rule that leaves `z-index` out is an error here and not a silent zero.
 */
function layerOf(sheet: string, selector: string): number {
  return Number(declared(sheet, selector, 'z-index'));
}

/** The title's own layer as the page writes it: what sits between the `<main>` tags. */
function titleLayer(): string {
  const found = /<main class="title">([\s\S]*?)<\/main>/.exec(page);
  if (found === null) throw new Error('the page has no <main class="title">');
  return found[1];
}

const switcher = layerOf(titleCss, '.lang');
const notice = layerOf(titleCss, '.notice');
const board = layerOf(titleCss, '#game');
const overlay = layerOf(overlayCss, '.onboarding');

describe('the order the page paints in', () => {
  it('keeps the switcher above the sequence and above the notice, and the board above all three', () => {
    // The switcher is the point: the sequence borrows the title's language, so a player reading the
    // first card must be able to change it there rather than skip the sequence to reach the title.
    expect(switcher).toBeGreaterThan(overlay);
    expect(switcher).toBeGreaterThan(notice);
    expect(board).toBeGreaterThan(switcher);
  });

  it('paints the sequence and the notice in the same layer, the overlay taking the notice’s number', () => {
    // They are two cards over the title and never up at once for the same reason, so the overlay is
    // given the notice's own number rather than one of its own: the page has one number for "a card
    // over the title", and the order between the two is the page's DOM order.
    expect(overlay).toBe(notice);
  });
});

describe('the box the switcher is painted in', () => {
  it('leaves the switcher out of the title’s own layer, where its number would be trapped', () => {
    // `.title` is the fixed box the whole title screen lives in, so a `z-index` written inside it
    // orders the switcher against the title's own text and against nothing else: the overlay, painted
    // in a layer of its own, stays above the box and everything in it. The switcher therefore stands
    // outside that layer, as a box of its own on the page — which is what makes its number count.
    expect(titleLayer()).not.toContain('id="lang"');
    expect(page).toContain('id="lang"');
  });

  it('gives it a box of its own on the page, fixed in the corner the title block leaves free', () => {
    // `fixed` is what keeps the corner: an absolutely positioned box outside the title would take its
    // place from the page instead, which is a different corner as soon as the document can scroll.
    expect(declared(titleCss, '.lang', 'position')).toBe('fixed');
  });
});
