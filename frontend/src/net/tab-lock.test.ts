// The same-browser guard: a lock in `localStorage`, held by whichever tab is mid-match. The model
// is pure once storage is handed in, so every case here works on an in-memory stand-in.
import { describe, expect, it } from 'vitest';
import { claim, release, tryClaim } from './tab-lock';

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

describe('tryClaim', () => {
  it('succeeds when nothing is held', () => {
    expect(tryClaim('tab-a', 1_000, memoryStorage())).toBe(true);
  });

  it('succeeds again for the tab that already holds it, without waiting for staleness', () => {
    const storage = memoryStorage();

    expect(tryClaim('tab-a', 1_000, storage)).toBe(true);
    expect(tryClaim('tab-a', 1_001, storage)).toBe(true);
  });

  it('fails for a different tab while the holder is fresh', () => {
    const storage = memoryStorage();

    expect(tryClaim('tab-a', 1_000, storage)).toBe(true);
    expect(tryClaim('tab-b', 1_001, storage)).toBe(false);
  });

  it('succeeds for a different tab once the holder has gone stale', () => {
    const storage = memoryStorage();

    expect(tryClaim('tab-a', 1_000, storage)).toBe(true);
    // 15_000 ms is the staleness window (three heartbeats); one tick past it frees the lock.
    expect(tryClaim('tab-b', 1_000 + 15_000 + 1, storage)).toBe(true);
  });

  it('answers true against storage that refuses every call, so the match still plays', () => {
    expect(tryClaim('tab-a', 1_000, blocked)).toBe(true);
  });
});

describe('claim', () => {
  it('refreshes the holder, keeping a different tab out past the old staleness point', () => {
    const storage = memoryStorage();

    expect(tryClaim('tab-a', 1_000, storage)).toBe(true);
    claim('tab-a', 1_000 + 10_000, storage);

    expect(tryClaim('tab-b', 1_000 + 15_001, storage)).toBe(false);
  });

  it('never throws against storage that refuses every call', () => {
    expect(() => claim('tab-a', 1_000, blocked)).not.toThrow();
  });
});

describe('release', () => {
  it('frees the lock for its own tab, without waiting for staleness', () => {
    const storage = memoryStorage();

    expect(tryClaim('tab-a', 1_000, storage)).toBe(true);
    release('tab-a', storage);

    expect(tryClaim('tab-b', 1_001, storage)).toBe(true);
  });

  it('does nothing when a different tab asks to release the current holder', () => {
    const storage = memoryStorage();

    expect(tryClaim('tab-a', 1_000, storage)).toBe(true);
    release('tab-b', storage);

    expect(tryClaim('tab-b', 1_001, storage)).toBe(false);
  });

  it('never throws against storage that refuses every call', () => {
    expect(() => release('tab-a', blocked)).not.toThrow();
  });
});
