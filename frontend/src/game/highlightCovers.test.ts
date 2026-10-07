// The setting behind the "Realçar Coberturas" checkbox: whether the board draws the marks of the
// rules (ADR 0012). It lives in the browser like the other small settings, and its default comes from
// the build (`VITE_HIGHLIGHT_COVERS`), which the scene reads through `config.ts` and hands in here.
import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_COVERS_DEFAULT,
  HIGHLIGHT_COVERS_KEY,
  readHighlightCovers,
  saveHighlightCovers,
} from './highlightCovers';

describe('the setting in the browser', () => {
  const blocked = {
    getItem(): string | null {
      throw new Error('storage is blocked');
    },
    setItem(): void {
      throw new Error('storage is blocked');
    },
  };

  function memoryStorage() {
    const saved = new Map<string, string>();
    return {
      saved,
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    };
  }

  it('keeps the setting under its own namespaced key', () => {
    expect(HIGHLIGHT_COVERS_KEY).toBe('eldritch-alley.highlightCovers');
  });

  it('is on when the build says nothing about it', () => {
    expect(HIGHLIGHT_COVERS_DEFAULT).toBe(true);
    expect(readHighlightCovers()).toBe(true);
  });

  it('answers the default the build handed in when nothing is saved', () => {
    expect(readHighlightCovers(false, memoryStorage())).toBe(false);
    expect(readHighlightCovers(true, memoryStorage())).toBe(true);
    expect(readHighlightCovers(false, null)).toBe(false);
  });

  it('falls back to that default when the storage refuses the read', () => {
    expect(readHighlightCovers(true, blocked)).toBe(true);
    expect(readHighlightCovers(false, blocked)).toBe(false);
  });

  it('reads back what it saved, over the default of the build', () => {
    const storage = memoryStorage();

    saveHighlightCovers(false, storage);
    expect(readHighlightCovers(true, storage)).toBe(false);

    saveHighlightCovers(true, storage);
    expect(readHighlightCovers(false, storage)).toBe(true);
  });

  it('ignores a saved value that is not a yes or a no', () => {
    const storage = memoryStorage();
    storage.saved.set(HIGHLIGHT_COVERS_KEY, 'perhaps');

    expect(readHighlightCovers(false, storage)).toBe(false);
  });

  it('swallows a write the storage refuses, so a blocked browser still plays', () => {
    expect(() => saveHighlightCovers(false, blocked)).not.toThrow();
    expect(() => saveHighlightCovers(false, null)).not.toThrow();
  });
});
