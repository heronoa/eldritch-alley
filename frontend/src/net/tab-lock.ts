// A second tab of this same browser must not open a second match. There is no player identity yet
// (see the PvP identity plan), so the server cannot tell "another tab" from "another player" —
// `BattleRoom`'s `maxClients` now correctly gives every real player their own room, which means a
// second tab gets its own room too, unless something stops it before it ever asks the server.
//
// This is that something: a lock in `localStorage`, shared across tabs of the same browser (unlike
// the per-tab `sessionStorage` reconnection token), held by whichever tab is mid-match and refreshed
// by a heartbeat so a crashed tab's lock does not block the game forever.
import { browserStorage, type KeyValueStorage } from '../storage/browser';

const LOCK_KEY = 'eldritch-alley.activeMatch';

/** How often the holder refreshes the lock while a match is open. */
export const HEARTBEAT_MS = 5_000;

/** A lock older than this is a crash, not a live match. */
const STALE_MS = HEARTBEAT_MS * 3;

interface LockRecord {
  tabId: string;
  updatedAt: number;
}

function parse(raw: string | null): LockRecord | null {
  if (raw === null || raw === '') return null;
  try {
    const value = JSON.parse(raw) as Partial<LockRecord>;
    if (typeof value.tabId !== 'string' || typeof value.updatedAt !== 'number') return null;
    return { tabId: value.tabId, updatedAt: value.updatedAt };
  } catch {
    return null;
  }
}

/**
 * Claims the lock for `tabId`, unless a different tab holds it and its last heartbeat is still
 * fresh. Never throws: without storage the guard cannot work, but the match must still play, so a
 * failure here answers `true` rather than blocking everyone.
 */
export function tryClaim(tabId: string, now: number, storage: KeyValueStorage | null = browserStorage()): boolean {
  try {
    const record = parse(storage?.getItem(LOCK_KEY) ?? null);
    const free = record === null || record.tabId === tabId || now - record.updatedAt > STALE_MS;
    if (!free) return false;

    storage?.setItem(LOCK_KEY, JSON.stringify({ tabId, updatedAt: now } satisfies LockRecord));
    return true;
  } catch {
    return true;
  }
}

/** Refreshes the lock this `tabId` already holds. The heartbeat's call; never throws. */
export function claim(tabId: string, now: number, storage: KeyValueStorage | null = browserStorage()): void {
  try {
    storage?.setItem(LOCK_KEY, JSON.stringify({ tabId, updatedAt: now } satisfies LockRecord));
  } catch {
    // Without storage the lock simply does not outlive this check; the match still plays.
  }
}

/** Releases the lock, but only when `tabId` is still the one holding it. Never throws. */
export function release(tabId: string, storage: KeyValueStorage | null = browserStorage()): void {
  try {
    const record = parse(storage?.getItem(LOCK_KEY) ?? null);
    if (record !== null && record.tabId !== tabId) return;
    storage?.setItem(LOCK_KEY, '');
  } catch {
    // Nothing to do: a lock that cannot be read cannot be released either.
  }
}
