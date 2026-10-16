// Onboarding m1 — the flag that says this browser has already been shown the sequence.
//
// The storage is a parameter for the same reason `i18n/storage.ts` takes one: a browser with cookies
// blocked refuses every access, and losing the flag costs showing the cards one more time, never a
// screen that will not open.
import { describe, expect, it } from 'vitest';
import { LOCALE_STORAGE_KEY } from '../i18n';
import type { KeyValueStorage } from '../storage/browser';
import { hasSeenOnboarding, markOnboardingSeen, ONBOARDING_SEEN_KEY } from './seen';

/** A browser that keeps what it is given, and a handle on what it holds. */
function memoryStorage(): KeyValueStorage & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();

  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

/** A browser that refuses storage: every read and every write throws. */
function blockedStorage(): KeyValueStorage {
  return {
    getItem: () => {
      throw new Error('storage is blocked');
    },
    setItem: () => {
      throw new Error('storage is blocked');
    },
  };
}

describe('the key the flag is kept under', () => {
  it('is the client’s own, namespaced and versioned, so a rewritten sequence can be shown again', () => {
    // Bumping the version is the whole of showing the sequence a second time to a player who has
    // already read it — there is no rule of its own to change for that.
    expect(ONBOARDING_SEEN_KEY.startsWith('eldritch-alley')).toBe(true);
    expect(ONBOARDING_SEEN_KEY).toContain('v1');
    expect(ONBOARDING_SEEN_KEY).not.toBe(LOCALE_STORAGE_KEY);
  });
});

describe('hasSeenOnboarding', () => {
  it('answers that a match opens unseen when there is no storage at all', () => {
    expect(hasSeenOnboarding(null)).toBe(false);
  });

  it('answers that a match opens unseen on a browser that has never been shown the sequence', () => {
    expect(hasSeenOnboarding(memoryStorage())).toBe(false);
  });

  it('answers that a match opens unseen when the browser refuses to be read', () => {
    expect(hasSeenOnboarding(blockedStorage())).toBe(false);
  });

  it('answers that a match opens unseen when the key holds something that is not the marker', () => {
    // "Something is in the key" is not the question: only the flag this module writes is an answer.
    const storage = memoryStorage();
    storage.setItem(ONBOARDING_SEEN_KEY, 'no');

    expect(hasSeenOnboarding(storage)).toBe(false);
  });

  it('answers that the sequence was seen once it has been marked on that same browser', () => {
    const storage = memoryStorage();
    markOnboardingSeen(storage);

    expect(hasSeenOnboarding(storage)).toBe(true);
  });
});

describe('markOnboardingSeen', () => {
  it('does not throw when the browser refuses the write', () => {
    // The worst case of a lost flag is the sequence being shown again, which is not worth a screen
    // that breaks on the way out of the last card.
    expect(() => markOnboardingSeen(blockedStorage())).not.toThrow();
  });

  it('does not throw when there is no storage at all', () => {
    expect(() => markOnboardingSeen(null)).not.toThrow();
  });

  it('marks nothing else: the language the player chose is left where it is', () => {
    const storage = memoryStorage();
    storage.setItem(LOCALE_STORAGE_KEY, 'en-US');

    markOnboardingSeen(storage);

    expect(storage.items.get(LOCALE_STORAGE_KEY)).toBe('en-US');
  });
});
