// The contact form (m4-05) — the contrast floor of the new text and controls.
//
// The colours are read from the sheets themselves, as the account's matrix does: `contact.css` is the
// sheet under test, `title.css` owns the palette and the footer links, and `account.css` holds the card
// recipe the form borrows. The new surfaces invent no colour of their own.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../view/contrast';

const contactCss = readFileSync(new URL('./contact.css', import.meta.url), 'utf8');
const titleCss = readFileSync(new URL('../title/title.css', import.meta.url), 'utf8');
const accountCss = readFileSync(new URL('../account/account.css', import.meta.url), 'utf8');

function escape(selector: string): string {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function declarations(sheet: string, selector: string): string {
  const found = new RegExp(`(?:^|[,\\n])\\s*${escape(selector)}\\s*(?:,[^{}]*)?\\{([^{}]*)\\}`, 'm').exec(
    sheet,
  );
  if (found === null) throw new Error(`no rule for ${selector}`);
  return found[1];
}

function declared(sheet: string, selector: string, property: string): string {
  const found = new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`).exec(declarations(sheet, selector));
  if (found === null) throw new Error(`${selector} does not set ${property}`);
  return found[1].trim();
}

function titleToken(name: string): number {
  const found = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(titleCss);
  if (found === null) throw new Error(`title.css does not set --${name}`);
  return parseInt(found[1].slice(1), 16);
}

function colour(sheet: string, selector: string, property: string): number {
  const value = declared(sheet, selector, property);
  const borrowed = /^var\(--([a-z-]+)\)$/.exec(value);

  if (borrowed !== null) return titleToken(borrowed[1]);
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return parseInt(value.slice(1), 16);

  throw new Error(`${selector} sets ${property} to ${value}, which is neither a token nor a hex colour`);
}

function ring(sheet: string, selector: string): number {
  const value = declared(sheet, selector, 'outline');
  const borrowed = /var\(--([a-z-]+)\)/.exec(value);

  if (borrowed === null) throw new Error(`${selector} draws its ring in ${value}, which is not a token`);
  return titleToken(borrowed[1]);
}

/** Every colour written as a literal in a sheet; whitespace is dropped before comparison. */
function literals(sheet: string): string[] {
  return [...sheet.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((found) =>
    found[0].toLowerCase().replace(/\s+/g, ''),
  );
}

const game = titleToken('game');
const night = titleToken('night');
const ink = titleToken('ink');
const muted = titleToken('muted');
const stamp = titleToken('stamp');

describe('the contact contrast matrix', () => {
  it('keeps the message field readable on the night it sits in', () => {
    expect(colour(contactCss, '.account-field textarea', 'background')).toBe(night);
    expect(colour(contactCss, '.account-field textarea', 'color')).toBe(ink);
    expect(contrastRatio(ink, night)).toBeGreaterThanOrEqual(7);

    const border = /var\(--([a-z-]+)\)/.exec(declared(contactCss, '.account-field textarea', 'border'));
    if (border === null) throw new Error('the textarea border is not written in a token');
    expect(border[1]).toBe('muted');
    expect(contrastRatio(titleToken(border[1]), night)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the consent label at 4.5:1 on the card, with the stamp’s own accent in the box', () => {
    expect(colour(contactCss, '.account-consent', 'color')).toBe(muted);
    expect(contrastRatio(muted, game)).toBeGreaterThanOrEqual(4.5);
    expect(declared(contactCss, '.account-consent input', 'accent-color')).toBe('var(--stamp)');
    expect(stamp).toBeGreaterThan(0);
  });

  it('keeps the footer’s new links at 4.5:1 over the night, hovered in the ink', () => {
    expect(colour(titleCss, '.footer-link', 'color')).toBe(muted);
    expect(contrastRatio(muted, night)).toBeGreaterThanOrEqual(4.5);
    expect(colour(titleCss, '.footer-link:hover', 'color')).toBe(ink);
    expect(contrastRatio(ink, night)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the footer links’ focus ring at 3:1 on the night', () => {
    expect(ring(titleCss, '.footer-link:focus-visible')).toBe(ink);
    expect(contrastRatio(ink, night)).toBeGreaterThanOrEqual(3);
  });
});

describe('the contact palette', () => {
  it('invents no colour of its own: every literal is one the title or the card already writes', () => {
    const known = [...literals(titleCss), ...literals(accountCss)];

    for (const found of literals(contactCss)) expect(known, found).toContain(found);
  });

  it('borrows only tokens the title screen defines', () => {
    const defined = new Set([...titleCss.matchAll(/--([a-z-]+)\s*:/g)].map((found) => found[1]));
    const used = new Set([...contactCss.matchAll(/var\(--([a-z-]+)\)/g)].map((found) => found[1]));

    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(defined, name).toContain(name);
  });
});
