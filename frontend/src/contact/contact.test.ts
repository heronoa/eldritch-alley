import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { getLocale, setLocale, type Locale } from '../i18n';
import {
  contactCopy,
  contactFailure,
  contactRequest,
  turnstileLanguage,
  validateContact,
} from './contact';

// The form's pure half: what it accepts before a request exists, the body it sends, and the four ways
// the platform can answer. The DOM half (`contact-panel.ts`) only writes these answers onto the page.
const VALID = {
  name: 'Ana Ribeiro',
  email: 'ana@example.com',
  message: 'Preciso de ajuda com a minha conta.',
};

describe('the contact form', () => {
  let previous: Locale;

  beforeEach(() => {
    previous = getLocale();
    setLocale('pt-BR');
  });

  afterEach(() => setLocale(previous));

  it('builds the body the API expects, trimmed, with the challenge token and the locale', () => {
    const request = contactRequest(
      { name: '  Ana Ribeiro ', email: ' ana@example.com ', message: ' Olá ' },
      'the-token',
      'pt-BR',
    );

    expect(request).toEqual({
      name: 'Ana Ribeiro',
      email: 'ana@example.com',
      message: 'Olá',
      turnstileToken: 'the-token',
      locale: 'pt-BR',
    });
  });

  it.each([
    ['name', { ...VALID, name: '   ' }],
    ['email', { ...VALID, email: '' }],
    ['message', { ...VALID, message: '  ' }],
  ] as const)('refuses an empty %s before any request, naming the field', (field, draft) => {
    expect(validateContact(draft)).toBe(field);
  });

  it('refuses an address that is not one, and a message past the server’s limit', () => {
    expect(validateContact({ ...VALID, email: 'not-an-address' })).toBe('email');
    expect(validateContact({ ...VALID, message: 'x'.repeat(5_001) })).toBe('message');
  });

  it('accepts a complete form', () => {
    expect(validateContact(VALID)).toBeNull();
  });

  it('tells a spent rate limit apart from a failed challenge, an outage and the unknown', () => {
    expect(contactFailure(new ApiError('refused', 429, 'rate_limited', 'too many'))).toBe(
      'rate-limited',
    );
    expect(contactFailure(new ApiError('refused', 403, 'challenge_failed', 'no'))).toBe(
      'challenge-failed',
    );
    expect(contactFailure(new ApiError('offline', null, null, 'no answer'))).toBe('offline');
    expect(contactFailure(new ApiError('refused', 400, 'invalid_body', 'bad'))).toBe('unknown');
    expect(contactFailure(new ApiError('unknown', 500, null, 'server'))).toBe('unknown');
    expect(contactFailure(new Error('anything else'))).toBe('unknown');
  });

  it('gives each failure its own sentence in both catalogs', () => {
    const portuguese = contactCopy().problems;
    setLocale('en-US');
    const english = contactCopy().problems;

    for (const kind of ['rate-limited', 'challenge-failed', 'offline', 'unknown'] as const) {
      expect(portuguese[kind].trim().length, kind).toBeGreaterThan(0);
      expect(english[kind].trim().length, kind).toBeGreaterThan(0);
      expect(english[kind], kind).not.toBe(portuguese[kind]);
    }
  });

  it('writes the form and the Turnstile widget in the language on screen', () => {
    expect(contactCopy().submit).toBe('Enviar');
    expect(turnstileLanguage(getLocale())).toBe('pt-br');

    setLocale('en-US');
    expect(contactCopy().submit).toBe('Send');
    expect(turnstileLanguage(getLocale())).toBe('en');
  });

  it('names every invalid field in the language on screen', () => {
    expect(contactCopy().fieldProblems.name).toMatch(/nome/i);

    setLocale('en-US');
    expect(contactCopy().fieldProblems.name).toMatch(/name/i);
  });
});
