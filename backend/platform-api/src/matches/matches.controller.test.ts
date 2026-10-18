import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeProvider } from '../auth/fake.provider';
import type { ProviderProfile } from '../auth/provider';
import {
  SESSION_COOKIE,
  cookieValue,
  setCookies,
  signIn,
  startTestApp,
  type TestApp,
} from '../auth/test-app';
import { DatabaseModule, ENTITY_MANAGER } from '../db/database.module';
import { Match, type MatchResult } from '../db/entities/match.entity';
import { User } from '../db/entities/user.entity';
import { runMigrations } from '../db/migrate';
import { createScratchDatabase, dropScratchDatabase, hasDatabase } from '../db/test-database';
import { encodeCursor, PAGE_SIZE, type MatchHistory } from './matches.service';

/**
 * Two players who played their twenty-one matches at the same instants, and a third whose matches all
 * ended in the same millisecond. That is what makes the cases below statements about the query rather
 * than about the data: with the two players' timestamps identical, a cursor is the only thing that can
 * tell their pages apart — so a page of one holding a row of the other would be the cursor's doing.
 */
const COUNT = PAGE_SIZE + 1;
const BASE = Date.parse('2026-10-01T12:00:00.000Z');

/** Newest first: index 0 is the most recent, which is the order the route answers in. */
function at(index: number): Date {
  return new Date(BASE + (COUNT - index) * 1_000);
}

/**
 * A uuid whose order is the order it was made in, so that two players' rows at the same instant sort the
 * same way in every run. Which of the two comes first is the one thing a cursor cannot say — its id is a
 * tie-breaker in the caller's own list — so the cases that hand one player another's cursor need it fixed.
 */
function idFor(player: number, index: number): string {
  return `00000000-0000-4000-8000-${String(player * 100 + index).padStart(12, '0')}`;
}

function profile(name: string): ProviderProfile {
  return {
    providerUserId: `gh-${name.toLowerCase()}`,
    email: `${name.toLowerCase()}@example.com`,
    emailVerified: true,
    displayName: name,
    avatarUrl: null,
  };
}

describe.skipIf(!hasDatabase)('GET /me/matches', () => {
  let databaseUrl: string;
  let app: TestApp;
  let seeding: TestingModule;
  let em: EntityManager;

  const sessions: Record<string, string> = {};
  const players: Record<string, string> = {};
  const seeded: Record<string, string[]> = {};

  beforeAll(async () => {
    databaseUrl = await createScratchDatabase();
    process.env.DATABASE_URL = databaseUrl;
    await runMigrations({ databaseUrl });
    seeding = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
    em = seeding.get<EntityManager>(ENTITY_MANAGER);

    let answering = profile('Alpha');
    app = await startTestApp({
      databaseUrl,
      providers: {
        github: new FakeProvider('github', () => answering),
        google: new FakeProvider('google', () => answering),
      },
    });

    for (const name of ['Alpha', 'Bravo', 'Charlie']) {
      answering = profile(name);
      const { response } = await signIn(app.url, 'github');
      sessions[name] = cookieValue(setCookies(response), SESSION_COOKIE) ?? '';
      expect(sessions[name]).not.toBe('');
      players[name] = await playerIdOf(sessions[name]);
    }

    seeded.Alpha = await seedMatches(0, players.Alpha, at);
    seeded.Bravo = await seedMatches(1, players.Bravo, at);
    // Charlie's twenty-one all ended in the same millisecond, so the order of his page is decided by the
    // id alone — which is the half of the page boundary that `ended_at` cannot supply.
    seeded.Charlie = await seedMatches(2, players.Charlie, () => new Date(BASE));
  });

  afterAll(async () => {
    await app?.close();
    await seeding?.close();
    await dropScratchDatabase(databaseUrl);
  });

  /** The id of whoever the cookie belongs to: the route's own answer to "who am I". */
  async function playerIdOf(session: string): Promise<string> {
    const response = await fetch(`${app.url}/me`, {
      redirect: 'manual',
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
    });
    const { user } = await response.json();
    return user.id as string;
  }

  async function seedMatches(
    player: number,
    userId: string,
    endedAt: (index: number) => Date,
  ): Promise<string[]> {
    const fork = em.fork();
    const user = fork.getReference(User, userId);
    const ids: string[] = [];

    for (let index = 0; index < COUNT; index += 1) {
      const id = idFor(player, index);
      ids.push(id);
      const result: MatchResult = index % 2 === 0 ? 'won' : 'lost';
      fork.create(Match, {
        id,
        user,
        seed: 4_242,
        mapId: 'overpass',
        protocolVersion: 10,
        result,
        rounds: index + 1,
        finalStateHash: 3_000_000_000,
        startedAt: new Date(BASE),
        endedAt: endedAt(index),
      });
    }

    await fork.flush();
    return ids;
  }

  function history(session: string, query = ''): Promise<Response> {
    return fetch(`${app.url}/me/matches${query}`, {
      redirect: 'manual',
      headers: session === '' ? {} : { cookie: `${SESSION_COOKIE}=${session}` },
    });
  }

  async function page(session: string, cursor?: string): Promise<MatchHistory> {
    const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
    const response = await history(session, query);

    expect(response.status).toBe(200);
    return response.json();
  }

  it('answers 401 without a session, in the shape every error has', async () => {
    const response = await history('');

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(typeof body.code).toBe('string');
    expect(typeof body.message).toBe('string');
  });

  it('is newest first, and pages with a cursor until there is nothing left', async () => {
    const first = await page(sessions.Alpha);
    expect(first.matches).toHaveLength(PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();
    expect(first.matches.map((match) => match.id)).toEqual(seeded.Alpha.slice(0, PAGE_SIZE));

    // What a row carries, and what it does not: enough to draw a line in the list, and not the events of
    // a whole battle.
    expect(first.matches[0]).toEqual({
      id: seeded.Alpha[0],
      mapId: 'overpass',
      result: 'won',
      rounds: 1,
      endedAt: at(0).toISOString(),
    });

    const second = await page(sessions.Alpha, first.nextCursor ?? '');
    expect(second.matches.map((match) => match.id)).toEqual(seeded.Alpha.slice(PAGE_SIZE));
    // The last page says so, which is what stops the client asking for another.
    expect(second.nextCursor).toBeNull();
  });

  it('neither repeats nor skips a match when they all ended at the same instant', async () => {
    const first = await page(sessions.Charlie);
    const second = await page(sessions.Charlie, first.nextCursor ?? '');

    const both = [...first.matches, ...second.matches].map((match) => match.id);
    expect(new Set(both).size).toBe(COUNT);
    // With every timestamp equal, the order is the id's alone — descending, which is what the second half
    // of the cursor is for. Asserted because the alternative, an order that is not total, repeats rows on
    // one page and loses them from the next.
    expect(both).toEqual([...seeded.Charlie].sort().reverse());
  });

  it('never answers with another player’s matches', async () => {
    const mine = await page(sessions.Alpha);
    const theirs = await page(sessions.Bravo);

    const myIds = new Set(mine.matches.map((match) => match.id));
    expect(theirs.matches.some((match) => myIds.has(match.id))).toBe(false);
    expect(mine.matches.map((match) => match.id)).toEqual(seeded.Alpha.slice(0, PAGE_SIZE));
    expect(theirs.matches.map((match) => match.id)).toEqual(seeded.Bravo.slice(0, PAGE_SIZE));
  });

  /**
   * The cursor belongs to a player and carries nothing of one. Both players here played at the same
   * instants, so a cursor made for one is a perfectly valid position in the other's list — and what comes
   * back is the other's own rows, which is the whole reason the player is read from the session and never
   * from the cursor: there is nothing to forge in it.
   */
  it('gives a player their own matches when handed another player’s cursor', async () => {
    const bravo = await page(sessions.Bravo);
    const withItsOwn = await page(sessions.Alpha, (await page(sessions.Alpha)).nextCursor ?? '');
    const withBravosCursor = await page(sessions.Alpha, bravo.nextCursor ?? '');

    // Alpha's own cursor starts the page after his twentieth match, so that page holds one.
    expect(withItsOwn.matches.map((match) => match.id)).toEqual([seeded.Alpha[PAGE_SIZE]]);

    // Bravo's cursor sits at the same instant, because the two played at the same times — so it is a
    // perfectly good position in Alpha's list, and the row Alpha has at that instant comes back with the
    // page: his id there sorts before Bravo's, and an id in a cursor is a tie-breaker in the caller's own
    // list and nothing more. Bravo's row is not in it, and no cursor of his could put it there.
    expect(withBravosCursor.matches.map((match) => match.id)).toEqual([
      seeded.Alpha[PAGE_SIZE - 1],
      seeded.Alpha[PAGE_SIZE],
    ]);
    expect(withBravosCursor.matches.some((match) => seeded.Bravo.includes(match.id))).toBe(false);
  });

  it('ignores every parameter that is not the cursor, a player id and a page size included', async () => {
    const plain = await page(sessions.Alpha);
    const asked = await history(sessions.Alpha, `?userId=${players.Bravo}&limit=1`);

    expect(asked.status).toBe(200);
    const body = await asked.json();
    expect(body).toEqual(plain);
    expect(body.matches).toHaveLength(PAGE_SIZE);
  });

  it('refuses a cursor that is not one of ours, rather than answering the first page', async () => {
    for (const cursor of ['nonsense', 'Zm9vfGJhcg', 'fHw', 'MjAyNi0xMC0wMXxub3QtYS11dWlk']) {
      const response = await history(sessions.Alpha, `?cursor=${encodeURIComponent(cursor)}`);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe('invalid_cursor');
      expect(typeof body.message).toBe('string');
    }
  });

  /**
   * A session cookie is a signature over a user id, not a pointer to a row. Once the account is gone the
   * history route answers exactly as it does without a cookie, rather than the empty page a query over a
   * missing player would produce — the two are one fact to the client (ADR 0022).
   */
  it('refuses the history of an account that no longer exists', async () => {
    await em.nativeDelete(User, { id: players.Charlie });

    const response = await history(sessions.Charlie);

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe('unauthenticated');
  });

  it('answers an empty last page for a cursor at the end of the list', async () => {
    const first = await page(sessions.Alpha);
    const second = await page(sessions.Alpha, first.nextCursor ?? '');
    // The last page is the last page, and there is no cursor to hand out of it.
    expect(second.nextCursor).toBeNull();

    // Two well-formed positions with nothing after them: the oldest match there is, and a moment one
    // second older than it. The honest answer to both is an empty page — not a 404, and not the first
    // page again, which is what a client that got one would render as "my history repeated".
    const atTheEnd = encodeCursor({ endedAt: at(COUNT - 1), id: seeded.Alpha[COUNT - 1] });
    const past = encodeCursor({ endedAt: at(COUNT), id: randomUUID() });

    expect(await page(sessions.Alpha, atTheEnd)).toEqual({ matches: [], nextCursor: null });
    expect(await page(sessions.Alpha, past)).toEqual({ matches: [], nextCursor: null });
  });
});
