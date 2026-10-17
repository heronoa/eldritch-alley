// The battle history as a view: one row per finished match, whether the list is empty, what failed,
// and what the button under the list does. The panel draws this and asks `history.ts` for more; it keeps
// no cursor and formats no date of its own.
import type { AccountCopy } from './copy';
import type { HistoryState } from './history';

/** One finished match, in the words the panel needs to draw it. */
export interface HistoryRowView {
  /** Stable across a redraw: the id of the match. */
  readonly key: string;
  /** The day the match ended, formatted by the caller's `formatDate`. */
  readonly date: string;
  /** The map it was played on, by the name the client has for it. */
  readonly map: string;
  /** `Vitória` / `Derrota`. */
  readonly result: string;
  /** `12 rodadas` / `12 rounds`. */
  readonly rounds: string;
}

/** What the button under the list is doing: asking for a page, waiting, or with nothing left to ask. */
export type HistoryAction = 'load-more' | 'loading' | 'exhausted';

export interface HistoryView {
  readonly title: string;
  readonly closeLabel: string;
  readonly rows: readonly HistoryRowView[];
  /** True once the first page has arrived and held no matches: the list is empty, not pending. */
  readonly empty: boolean;
  readonly emptyText: string;
  /** The sentence of the last failure, or `null` when the last request went through. */
  readonly failure: string | null;
  readonly action: HistoryAction;
  /** The button's label; empty in `exhausted`, where the button is not drawn. */
  readonly actionLabel: string;
}

/**
 * The history card, from the state and the language on screen. The date format is the caller's, so a
 * test reads the same strings in every timezone.
 */
export function historyView(
  state: HistoryState,
  copy: AccountCopy,
  formatDate: (iso: string) => string,
): HistoryView {
  const action: HistoryAction = state.loading
    ? 'loading'
    : state.loaded && state.cursor === null
      ? 'exhausted'
      : 'load-more';

  return {
    title: copy.historyTitle,
    closeLabel: copy.close,
    rows: state.rows.map((row) => ({
      key: row.id,
      date: formatDate(row.endedAt),
      map: copy.mapNames[row.mapId] ?? row.mapId,
      result: row.result === 'won' ? copy.resultWon : copy.resultLost,
      rounds: copy.rounds(row.rounds),
    })),
    empty: state.loaded && !state.loading && state.failure === null && state.rows.length === 0,
    emptyText: copy.historyEmpty,
    // A platform that did not answer is told apart from a history it refused or answered badly: the
    // first is the request's own failure and says so; the other is the history's.
    failure:
      state.failure === null
        ? null
        : state.failure === 'offline'
          ? copy.problems.offline
          : copy.historyFailure,
    action,
    actionLabel:
      action === 'loading' ? copy.historyLoading : action === 'load-more' ? copy.historyLoadMore : '',
  };
}
