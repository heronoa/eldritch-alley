import { describe, expect, it } from 'vitest';
import {
  EMAIL_FALLBACK_LOCALE,
  EMAIL_LOCALES,
  isEmailLocale,
  resolveEmailLocale,
} from './locale';

describe('the languages the mail is written in', () => {
  it('is the two the client offers, with the client fallback as the last resort', () => {
    expect(EMAIL_LOCALES).toEqual(['pt-BR', 'en-US']);
    expect(EMAIL_FALLBACK_LOCALE).toBe('en-US');
  });

  it('recognises exactly the two values it writes, and nothing that merely looks like them', () => {
    expect(isEmailLocale('pt-BR')).toBe(true);
    expect(isEmailLocale('en-US')).toBe(true);
    expect(isEmailLocale('pt')).toBe(false);
    expect(isEmailLocale('EN-US')).toBe(false);
    expect(isEmailLocale(undefined)).toBe(false);
    expect(isEmailLocale(42)).toBe(false);
  });
});

describe('resolving the language of a request', () => {
  it('answers the exact tag it was given', () => {
    expect(resolveEmailLocale('pt-BR')).toBe('pt-BR');
    expect(resolveEmailLocale('en-US')).toBe('en-US');
  });

  it('matches Portuguese and English by family, whatever the case or region', () => {
    expect(resolveEmailLocale('pt')).toBe('pt-BR');
    expect(resolveEmailLocale('pt-PT')).toBe('pt-BR');
    expect(resolveEmailLocale('PT-br')).toBe('pt-BR');
    expect(resolveEmailLocale('en')).toBe('en-US');
    expect(resolveEmailLocale('en-GB')).toBe('en-US');
  });

  it('takes the first supported language the list prefers', () => {
    // What a browser sends: a list with weights, where the order is already the preference.
    expect(resolveEmailLocale('fr-FR,pt-BR;q=0.9,en;q=0.8')).toBe('pt-BR');
    expect(resolveEmailLocale('en-US,en;q=0.9,pt;q=0.8')).toBe('en-US');
    expect(resolveEmailLocale('de,en;q=0.5,pt;q=0.4')).toBe('en-US');
  });

  it('falls back to the language the client falls back to when there is nothing to go on', () => {
    expect(resolveEmailLocale(undefined)).toBe('en-US');
    expect(resolveEmailLocale('')).toBe('en-US');
    expect(resolveEmailLocale('   ')).toBe('en-US');
    expect(resolveEmailLocale('*')).toBe('en-US');
    expect(resolveEmailLocale('not a language')).toBe('en-US');
  });
});
