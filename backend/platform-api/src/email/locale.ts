/**
 * The languages the platform writes its mail in, and how a request chooses one.
 *
 * The choice lives on the player's browser — the client saves it and has no account column for it — so
 * every request carries the answer: `Accept-Language` on a `fetch`, and the `locale` query on the OAuth
 * start, which is a navigation and cannot set a header of its own. This is content negotiation and
 * nothing else; a value the platform does not write in falls back to the language the client itself
 * falls back to, so a request with no preference reads exactly as it did before the choice existed.
 */
export const EMAIL_LOCALES = ['pt-BR', 'en-US'] as const;

export type EmailLocale = (typeof EMAIL_LOCALES)[number];

/** What a request with no supported preference gets. The client's `FALLBACK_LOCALE`, deliberately. */
export const EMAIL_FALLBACK_LOCALE: EmailLocale = 'en-US';

export function isEmailLocale(value: unknown): value is EmailLocale {
  return typeof value === 'string' && (EMAIL_LOCALES as readonly string[]).includes(value);
}

/**
 * The language a header or a query asks for: the first supported language it lists. Only Portuguese is
 * matched by prefix — any `pt*` tag asks for pt-BR — and anything else is the fallback. The family tags
 * are matched before the exact tag check for the same reason the client does it: `pt-PT` is closer to
 * pt-BR than to English, and a player who chose Portuguese should not get an English message because of
 * where they live.
 */
export function resolveEmailLocale(value: string | undefined): EmailLocale {
  if (value === undefined) return EMAIL_FALLBACK_LOCALE;

  for (const part of value.split(',')) {
    const tag = (part.split(';')[0] ?? '').trim().toLowerCase();
    if (tag === 'pt' || tag.startsWith('pt-')) return 'pt-BR';
    if (tag === 'en' || tag.startsWith('en-')) return 'en-US';
  }

  return EMAIL_FALLBACK_LOCALE;
}
