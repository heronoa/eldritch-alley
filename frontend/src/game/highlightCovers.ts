// Whether the board draws the marks of the rules (ADR 0012) — the diamonds that say which cells carry
// cover. They are a debugging aid the player may want out of the way, so they became a setting of the
// settings panel; the props themselves are art and stay drawn.
//
// The setting lives in the browser only, like the automatic end of turn: reading or writing it never
// throws, because a browser that blocks storage must still be able to play. The build sets what a
// player who never opens the panel sees (`VITE_HIGHLIGHT_COVERS`, read in `config.ts`).
import { browserStorage, type KeyValueStorage } from '../storage/browser';

/** The key the setting is saved under. Namespaced, so the origin's other keys do not collide. */
export const HIGHLIGHT_COVERS_KEY = 'eldritch-alley.highlightCovers';

/** What a build that says nothing starts with: the marks are on, as they were before the setting. */
export const HIGHLIGHT_COVERS_DEFAULT = true;

/**
 * The setting as it is now: what the browser saved, or `fallback` — the build's default — when there
 * is nothing saved, the entry is not a yes or a no, or the storage refuses the read.
 */
export function readHighlightCovers(
  fallback: boolean = HIGHLIGHT_COVERS_DEFAULT,
  storage: KeyValueStorage | null = browserStorage(),
): boolean {
  try {
    const saved = storage?.getItem(HIGHLIGHT_COVERS_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

/** Saves the setting, and does nothing when storage refuses it: the page still plays. */
export function saveHighlightCovers(
  enabled: boolean,
  storage: KeyValueStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(HIGHLIGHT_COVERS_KEY, String(enabled));
  } catch {
    // Nothing to do: without storage the choice simply does not outlive the page.
  }
}
