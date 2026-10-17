// The account (m4-04) — the layers of the page, read as numbers: what the control, the cards over the
// title, the notice, the sequence, the switcher and the board are painted in, and what that order is
// for.
//
// The control is the reason the first block exists, and it is the language switcher's lesson twice
// over: a card over the title has to leave the control reachable — a player signs in and out from the
// corner, and the card that asks for the password is not the place to hide it — and a `z-index` written
// inside the fixed `.title` box would order the control against the title's text and against nothing
// else. The cards themselves stay outside that box for the same reason: their number is the notice's,
// and a stacking context opened inside `.title` would trap it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const titleCss = readFileSync(new URL('../title/title.css', import.meta.url), 'utf8');
const onboardingCss = readFileSync(new URL('../onboarding/onboarding.css', import.meta.url), 'utf8');
const accountCss = readFileSync(new URL('./account.css', import.meta.url), 'utf8');
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
const onboarding = layerOf(onboardingCss, '.onboarding');
const control = layerOf(accountCss, '.account');
const card = layerOf(accountCss, '.account-card');
const mail = layerOf(accountCss, '.mail');

describe('the order the page paints in', () => {
  it('paints the account cards in the notice’s own layer', () => {
    // They are cards over the title and never up at once with the notice or the sequence, so the
    // account is given the page's one number for "a card over the title" rather than one of its own.
    expect(card).toBe(notice);
    expect(card).toBe(onboarding);
  });

  it('keeps the control in the switcher’s layer, above the cards and below the board', () => {
    // The control is the way in and out of an account, and the card that asks for the password must
    // not cover the corner it is pressed from: hence the switcher's number, not the cards'.
    expect(control).toBe(switcher);
    expect(control).toBeGreaterThan(card);
    expect(board).toBeGreaterThan(control);
  });

  it('gives the mail page the top of the stack, the number the board takes', () => {
    // The two are never on screen together — `boot.ts` hides the title box on a mailed link — so they
    // share the number rather than one being ordered against the other.
    expect(mail).toBe(board);
  });
});

describe('the boxes the account is painted in', () => {
  it('leaves the control out of the title’s own layer, where its number would be trapped', () => {
    expect(titleLayer()).not.toContain('id="account-control"');
    expect(page).toContain('id="account-control"');
  });

  it('leaves the three cards out of the title’s own layer as well', () => {
    // Their number is the notice's, and the notice lives outside `.title` for exactly this reason.
    for (const id of ['auth', 'profile', 'history']) {
      expect(titleLayer(), id).not.toContain(`id="${id}"`);
      expect(page, id).toContain(`id="${id}"`);
    }
  });

  it('gives the control a box of its own on the page, fixed in the corner the switcher leaves free', () => {
    // `fixed` is what keeps the corner: an absolutely positioned box outside the title would take its
    // place from the page instead, which is a different corner as soon as the document can scroll.
    expect(declared(accountCss, '.account', 'position')).toBe('fixed');
  });
});
