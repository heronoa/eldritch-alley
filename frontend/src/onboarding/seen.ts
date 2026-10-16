// Onboarding m1 — the flag that says this browser has already been shown the sequence.
//
// It is remembered per browser and without an account, because there is no account yet: the platform
// arrives in M4, and this is not the feature that waits for it.
//
// The storage is a parameter for the same reason `i18n/storage.ts` takes one: a browser with cookies
// blocked refuses every access, and both calls swallow that. Losing the flag costs the sequence being
// shown one more time, never a screen that will not open.
import { browserStorage, type KeyValueStorage } from '../storage/browser';

/**
 * The key the flag is saved under. Namespaced, so the origin's other keys do not collide, and versioned:
 * showing a rewritten sequence to a player who has already read the old one is a bump of this number,
 * not a rule of its own.
 */
export const ONBOARDING_SEEN_KEY = 'eldritch-alley.onboarding-seen.v1';

/** What the flag writes. The marker is the whole answer, so nothing else in the key counts as a yes. */
const SEEN = 'true';

/** Whether this browser has already been shown the sequence. Storage that cannot be read is "not seen". */
export function hasSeenOnboarding(storage: KeyValueStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(ONBOARDING_SEEN_KEY) === SEEN;
  } catch {
    return false;
  }
}

/** Marks the sequence as seen, and does nothing when storage refuses the write. */
export function markOnboardingSeen(storage: KeyValueStorage | null = browserStorage()): void {
  try {
    storage?.setItem(ONBOARDING_SEEN_KEY, SEEN);
  } catch {
    // Nothing to do: without storage the sequence is simply shown again on the next visit.
  }
}
