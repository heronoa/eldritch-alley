// `t(key, params?)` — what the screens call — and the locale it answers in.
//
// The current locale is module state, not an argument, because every caller would otherwise have to
// thread it through. It is resolved on first use rather than at import, so importing this module
// never touches `localStorage` or `navigator`.

import type { MessageKey } from './catalog.pt-BR';
import { resolveLocale, type Locale } from './locale';
import { message } from './messages';
import { readSavedLocale } from './storage';

/** The values a message's `{placeholders}` are filled with. */
export type MessageParams = Readonly<Record<string, string | number>>;

let current: Locale | null = null;

/** The locale to open in: the saved choice, then the browser's languages, then the fallback. */
export function detectLocale(): Locale {
  return resolveLocale(readSavedLocale(), browserLanguages());
}

/** The locale the client is showing. Resolved on the first call. */
export function getLocale(): Locale {
  return (current ??= detectLocale());
}

/** Switches the language. The caller redraws what it owns; this only remembers the choice. */
export function setLocale(locale: Locale): void {
  current = locale;
}

/** The message of a key in the current locale, with its placeholders filled. */
export function t(key: MessageKey, params?: MessageParams): string {
  return interpolate(message(getLocale(), key), params);
}

/**
 * Fills the `{name}` placeholders of a message with the params. A placeholder with no param is left
 * as it is, so a gap shows up on the screen instead of turning into "undefined".
 */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder,
  );
}

/** What `navigator` asks for, most preferred first. Empty when there is no `navigator`. */
function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];

  const languages = navigator.languages;
  if (languages && languages.length > 0) return languages;

  return navigator.language ? [navigator.language] : [];
}
