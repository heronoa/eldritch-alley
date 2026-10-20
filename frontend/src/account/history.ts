// The battle history as a screen reads it: a page, where the next one starts, and whether the list is
// still loading. The panel draws this; it never keeps a cursor of its own.
import type { MatchPage, MatchSummary } from '../api/client';
import { failureOf, type ApiErrorKind } from '../api/errors';

export interface HistoryState {
  readonly rows: readonly MatchSummary[];
  /** Where the next page starts, or `null` when there is none — and also before the first page. */
  readonly cursor: string | null;
  readonly loading: boolean;
  /** Whether the first page has ever arrived: the difference between "empty" and "not asked yet". */
  readonly loaded: boolean;
  readonly failure: ApiErrorKind | null;
}

export function emptyHistory(): HistoryState {
  return { rows: [], cursor: null, loading: false, loaded: false, failure: null };
}

/**
 * One page more, from the state that is not loading. The panel marks the request with `startLoading`
 * first and awaits this; a failure keeps the rows already shown and is named, so the screen can say
 * what happened without losing the history the player already has.
 *
 * Rows are deduplicated by id: a page that arrives while another is in flight cannot list a match
 * twice.
 */
export async function loadMore(
  state: HistoryState,
  load: (cursor?: string) => Promise<MatchPage>,
): Promise<HistoryState> {
  // The last page has been read: there is nothing after it to ask for.
  if (state.loaded && state.cursor === null) return state;

  try {
    const page = await load(state.cursor ?? undefined);
    return {
      rows: appendUnique(state.rows, page.matches),
      cursor: page.nextCursor,
      loading: false,
      loaded: true,
      failure: null,
    };
  } catch (error) {
    return { ...state, loading: false, failure: failureOf(error) };
  }
}

/** The history state one step further: the circle the panel draws while a request is out. */
export function startLoading(state: HistoryState): HistoryState {
  if (state.loading) return state;
  if (state.loaded && state.cursor === null) return state;
  return { ...state, loading: true, failure: null };
}

function appendUnique(
  rows: readonly MatchSummary[],
  incoming: readonly MatchSummary[],
): readonly MatchSummary[] {
  const known = new Set(rows.map((row) => row.id));
  const added = incoming.filter((row) => !known.has(row.id));
  return added.length === 0 ? rows : [...rows, ...added];
}
