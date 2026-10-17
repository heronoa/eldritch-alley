import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MatchSummary } from '../api/client';
import { getLocale, setLocale, type Locale } from '../i18n';
import { accountCopy } from './copy';
import { emptyHistory, type HistoryState } from './history';
import { historyView } from './history-panel';

const ROWS: readonly MatchSummary[] = [
  { id: 'm-2', mapId: 'roof', result: 'won', rounds: 7, endedAt: '2026-10-15T21:30:00.000Z' },
  { id: 'm-1', mapId: 'street', result: 'lost', rounds: 12, endedAt: '2026-10-14T18:05:00.000Z' },
];

/** A fixed formatter: the view is tested without the machine's timezone or the day's language. */
function fixedDate(iso: string): string {
  return iso.slice(0, 10);
}

function state(overrides: Partial<HistoryState>): HistoryState {
  return { ...emptyHistory(), ...overrides };
}

describe('the history view', () => {
  let previous: Locale;
  beforeEach(() => {
    previous = getLocale();
    setLocale('pt-BR');
  });
  afterEach(() => setLocale(previous));

  it('offers to ask for the first page before anything has been loaded', () => {
    const view = historyView(emptyHistory(), accountCopy(), fixedDate);

    expect(view.rows).toEqual([]);
    expect(view.empty).toBe(false);
    expect(view.failure).toBeNull();
    expect(view.action).toBe('load-more');
    expect(view.actionLabel).toBe('Carregar mais');
  });

  it('draws each match with the map name, the result, the length and the formatted day', () => {
    const view = historyView(state({ rows: ROWS, loaded: true, cursor: null }), accountCopy(), fixedDate);

    expect(view.rows).toEqual([
      { key: 'm-2', date: '2026-10-15', map: 'Edifício Central, cobertura', result: 'Vitória', rounds: '7 rodadas' },
      { key: 'm-1', date: '2026-10-14', map: 'Rua do Comércio e beco', result: 'Derrota', rounds: '12 rodadas' },
    ]);
  });

  it('draws a map id this build has no name for by the id itself', () => {
    const view = historyView(
      state({ rows: [{ id: 'm-3', mapId: 'harbour', result: 'won', rounds: 4, endedAt: '2026-10-16T10:00:00.000Z' }], loaded: true, cursor: null }),
      accountCopy(),
      fixedDate,
    );

    expect(view.rows[0].map).toBe('harbour');
  });

  it('keeps the button while there is a cursor, and puts it away on the last page', () => {
    const more = historyView(state({ rows: ROWS, loaded: true, cursor: 'next' }), accountCopy(), fixedDate);
    expect(more.action).toBe('load-more');
    expect(more.actionLabel).toBe('Carregar mais');

    const last = historyView(state({ rows: ROWS, loaded: true, cursor: null }), accountCopy(), fixedDate);
    expect(last.action).toBe('exhausted');
    expect(last.actionLabel).toBe('');
  });

  it('says it is loading, and does not call a list that is on its way empty', () => {
    const view = historyView(state({ loading: true }), accountCopy(), fixedDate);

    expect(view.action).toBe('loading');
    expect(view.actionLabel).toBe('Carregando…');
    expect(view.empty).toBe(false);
  });

  it('says a history with no matches is empty, in words', () => {
    const view = historyView(state({ rows: [], loaded: true, cursor: null }), accountCopy(), fixedDate);

    expect(view.empty).toBe(true);
    expect(view.emptyText).toBe('Nenhuma batalha registrada ainda');
  });

  it('names the failure and keeps the rows already shown', () => {
    const view = historyView(
      state({ rows: ROWS, loaded: true, cursor: 'next', failure: 'offline' }),
      accountCopy(),
      fixedDate,
    );

    expect(view.failure).toBe('O serviço não respondeu');
    expect(view.rows).toHaveLength(2);
    expect(view.empty).toBe(false);

    const refused = historyView(state({ loaded: true, cursor: 'next', failure: 'refused' }), accountCopy(), fixedDate);
    expect(refused.failure).toBe('Não foi possível carregar o histórico');
  });

  it('speaks the language the client is in', () => {
    setLocale('en-US');
    const view = historyView(state({ rows: ROWS, loaded: true, cursor: null }), accountCopy(), fixedDate);

    expect(view.title).toBe('Battle history');
    expect(view.rows[0]).toMatchObject({ map: 'Central Building, rooftop', result: 'Victory', rounds: '7 rounds' });
  });
});
