import { describe, expect, it } from 'vitest';
import type { MatchSummary } from '../api/client';
import { ApiError } from '../api/errors';
import { emptyHistory, loadMore, startLoading } from './history';

function match(id: string): MatchSummary {
  return { id, mapId: 'alley', result: 'won', rounds: 7, endedAt: '2026-10-16T10:00:00.000Z' };
}

describe('the history pagination', () => {
  it('asks for the first page with no cursor and keeps the one the platform answered', async () => {
    const asked: (string | undefined)[] = [];
    const state = await loadMore(emptyHistory(), async (cursor) => {
      asked.push(cursor);
      return { matches: [match('m1')], nextCursor: 'next' };
    });

    expect(asked).toEqual([undefined]);
    expect(state.rows.map((row) => row.id)).toEqual(['m1']);
    expect(state.cursor).toBe('next');
    expect(state.loaded).toBe(true);
  });

  it('asks the second page with the stored cursor and appends it', async () => {
    const asked: (string | undefined)[] = [];
    const load = async (cursor?: string) => {
      asked.push(cursor);
      return cursor === undefined
        ? { matches: [match('m1')], nextCursor: 'next' }
        : { matches: [match('m2')], nextCursor: null };
    };

    const first = await loadMore(emptyHistory(), load);
    const second = await loadMore(first, load);

    expect(asked).toEqual([undefined, 'next']);
    expect(second.rows.map((row) => row.id)).toEqual(['m1', 'm2']);
    expect(second.cursor).toBeNull();
  });

  it('stops asking once the platform says there is no next page', async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return { matches: [], nextCursor: null };
    };

    const done = await loadMore(emptyHistory(), load);
    const again = await loadMore(done, load);

    expect(again).toBe(done);
    expect(calls).toBe(1);
  });

  it('does not list a match twice when a page repeats one already shown', async () => {
    const state = await loadMore(emptyHistory(), async () => ({
      matches: [match('m1'), match('m2')],
      nextCursor: 'next',
    }));
    const repeated = await loadMore(state, async () => ({
      matches: [match('m2'), match('m3')],
      nextCursor: null,
    }));

    expect(repeated.rows.map((row) => row.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('keeps the rows it has and names a page that failed', async () => {
    const first = await loadMore(emptyHistory(), async () => ({ matches: [match('m1')], nextCursor: 'next' }));
    const failed = await loadMore(first, async () => {
      throw new ApiError('offline', null, null, 'down');
    });

    expect(failed.rows.map((row) => row.id)).toEqual(['m1']);
    expect(failed.loading).toBe(false);
    expect(failed.failure).toBe('offline');
  });
});

describe('marking a page as loading', () => {
  it('marks the state once, and a second mark in the air changes nothing', () => {
    const loading = startLoading(emptyHistory());
    const again = startLoading(loading);

    expect(loading.loading).toBe(true);
    expect(again).toBe(loading);
  });

  it('has nothing left to load after the last page', () => {
    const done = { rows: [], cursor: null, loading: false, loaded: true, failure: null };

    expect(startLoading(done)).toBe(done);
  });
});
