// Localization M1 — the choice has to survive a reload, and a browser that blocks storage has to
// keep working. Storage is injectable so both can be tested without a browser.
import { describe, expect, it } from 'vitest';
import { LOCALE_STORAGE_KEY, readSavedLocale, saveLocale, type LocaleStorage } from './storage';

function memoryStorage(seed: Record<string, string> = {}): LocaleStorage & {
  entries: Map<string, string>;
} {
  const entries = new Map(Object.entries(seed));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

/** What a browser with cookies blocked does: every access throws. */
const blockedStorage: LocaleStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('SecurityError');
  },
};

describe('the saved locale', () => {
  it('reads back the locale that was saved', () => {
    const storage = memoryStorage();

    expect(readSavedLocale(storage)).toBeNull();
    saveLocale('pt-BR', storage);
    expect(storage.entries.get(LOCALE_STORAGE_KEY)).toBe('pt-BR');
    expect(readSavedLocale(storage)).toBe('pt-BR');

    saveLocale('en-US', storage);
    expect(readSavedLocale(storage)).toBe('en-US');
  });

  it('answers null when what was saved is not a locale the client ships', () => {
    expect(readSavedLocale(memoryStorage({ [LOCALE_STORAGE_KEY]: 'de-DE' }))).toBeNull();
    expect(readSavedLocale(memoryStorage({ [LOCALE_STORAGE_KEY]: '' }))).toBeNull();
  });

  it('survives a storage that throws, on the read and on the write', () => {
    expect(readSavedLocale(blockedStorage)).toBeNull();
    expect(() => saveLocale('pt-BR', blockedStorage)).not.toThrow();
  });

  it('survives a browser with no storage at all', () => {
    expect(readSavedLocale(null)).toBeNull();
    expect(() => saveLocale('pt-BR', null)).not.toThrow();
    expect(readSavedLocale()).toBeNull();
  });
});
