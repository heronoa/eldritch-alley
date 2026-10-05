// Localization M1 — which language the client opens in. The order is the plan's: what the player
// saved, then what the browser asks for, then the fallback.
import { describe, expect, it } from 'vitest';
import { FALLBACK_LOCALE, LOCALES, isLocale, resolveLocale } from './locale';

describe('isLocale', () => {
  it('accepts the two locales the client ships, and nothing else', () => {
    expect(LOCALES).toEqual(['pt-BR', 'en-US']);
    expect(isLocale('pt-BR')).toBe(true);
    expect(isLocale('en-US')).toBe(true);
  });

  it('rejects the other shapes a saved value can come back in', () => {
    expect(isLocale('pt-PT')).toBe(false);
    expect(isLocale('fr-FR')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('resolveLocale', () => {
  it('uses the saved choice before the browser languages', () => {
    expect(resolveLocale('pt-BR', ['en-US'])).toBe('pt-BR');
    expect(resolveLocale('en-US', ['pt-BR'])).toBe('en-US');
  });

  it('ignores a saved value that is not a locale', () => {
    expect(resolveLocale('de-DE', ['pt-BR'])).toBe('pt-BR');
    expect(resolveLocale(null, ['pt-BR'])).toBe('pt-BR');
  });

  it('reads any Portuguese tag as pt-BR', () => {
    expect(resolveLocale(null, ['pt-BR'])).toBe('pt-BR');
    expect(resolveLocale(null, ['pt-PT'])).toBe('pt-BR');
    expect(resolveLocale(null, ['pt'])).toBe('pt-BR');
    expect(resolveLocale(null, ['fr-FR', 'pt-BR'])).toBe('pt-BR');
  });

  it('does not care about the case of the browser tag', () => {
    expect(resolveLocale(null, ['PT-br'])).toBe('pt-BR');
  });

  it('falls back to en-US for every other browser, and for a browser that asks for nothing', () => {
    expect(FALLBACK_LOCALE).toBe('en-US');
    expect(resolveLocale(null, ['en-US'])).toBe('en-US');
    expect(resolveLocale(null, ['fr-FR'])).toBe('en-US');
    expect(resolveLocale(null, ['de-DE', 'fr-FR'])).toBe('en-US');
    expect(resolveLocale(null, [])).toBe('en-US');
    expect(resolveLocale(null)).toBe('en-US');
  });
});
