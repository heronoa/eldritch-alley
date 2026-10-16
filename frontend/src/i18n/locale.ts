// The two languages the client ships, and which one a browser gets.
//
// Only Portuguese is detected: any `pt*` tag — pt-BR, pt-PT, plain pt — opens in pt-BR, and every
// other browser opens in en-US, which is also the fallback for a browser that asks for nothing.
// The owner chose en-US as the fallback on 2026-10-04.

/** The locales the client ships, in the order the switcher shows them. */
export const LOCALES = ['pt-BR', 'en-US'] as const;

export type Locale = (typeof LOCALES)[number];

/** What a browser that is neither Portuguese nor saved gets. */
export const FALLBACK_LOCALE: Locale = 'en-US';

/** Whether a value — a saved one, or anything storage gave back — is a locale the client ships. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The locale to open in: the saved choice first, then the browser's languages, in the order the
 * browser lists them, then the fallback. `saved` is `unknown` on purpose — it comes from storage,
 * which is outside the program's control.
 */
export function resolveLocale(saved: unknown, languages: readonly string[] = []): Locale {
  if (isLocale(saved)) return saved;

  for (const language of languages) {
    if (language.toLowerCase().startsWith('pt')) return 'pt-BR';
  }

  return FALLBACK_LOCALE;
}
