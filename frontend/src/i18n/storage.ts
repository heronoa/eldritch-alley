// The player's language choice, remembered on this browser only.
//
// A browser with cookies blocked throws on every storage access, and a private window can hand back
// a storage that behaves the same way, so both calls swallow the error: a player without storage
// loses the remembered choice and nothing else. The storage is a parameter so the tests can pass in
// one that throws.
import { isLocale, type Locale } from './locale';

/** The key the choice is saved under. Namespaced, so the origin's other keys do not collide. */
export const LOCALE_STORAGE_KEY = 'eldritch-alley.locale';

/** The part of `localStorage` this module uses. */
export interface LocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The saved locale, or null when there is none, it is not a locale, or storage is unreachable. */
export function readSavedLocale(storage: LocaleStorage | null = browserStorage()): Locale | null {
  try {
    const saved = storage?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

/** Saves the choice, and does nothing when storage refuses it. */
export function saveLocale(locale: Locale, storage: LocaleStorage | null = browserStorage()): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Nothing to do: without storage the choice simply does not outlive the page.
  }
}

/** `localStorage`, or null when the browser has none or refuses to hand it over. */
function browserStorage(): LocaleStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
