// The browser's key-value storage, as the client's small settings use it.
//
// `localStorage` is handed over through a getter that can throw: a browser with cookies blocked, or a
// private window, refuses it. Every caller needs the same answer to that — no storage at all — so it
// is read here once, and each setting swallows the errors of its own reads and writes.
//
// The storage is a parameter so the tests can pass in one that throws.

/** The part of `localStorage` the client's settings use. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `localStorage`, or null when the browser has none or refuses to hand it over. */
export function browserStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
