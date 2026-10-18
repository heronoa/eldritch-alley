import type { EntityManager } from '@mikro-orm/postgresql';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseModule, ENTITY_MANAGER } from '../db/database.module';
import { Agent, type AgentClass } from '../db/entities/agent.entity';
import { Match } from '../db/entities/match.entity';
import { User } from '../db/entities/user.entity';
import { runMigrations } from '../db/migrate';
import {
  createScratchDatabase,
  dropScratchDatabase,
  hasDatabase,
  withClient,
} from '../db/test-database';
import type { MatchEndedMessage } from './match-ended';
import { MatchesService } from './matches.service';

const MATCH_ID = '9f1c0a6e-7d2b-4c8f-9a31-5b6e0d7c2a48';

// Real engine events, down to the nested path a move carries: the round trip is only worth asserting
// over the shape the match server actually sends.
const EVENTS: Record<string, unknown>[] = [
  { type: 'moved', actor: 'A-sniper', path: [{ x: 3, y: 4 }, { x: 3, y: 5 }] },
  { type: 'turn-ended', actor: 'A-sniper', next: 'B-sniper', round: 1 },
  { type: 'attacked', actor: 'A-wizard', target: 'B-priest', damage: 7, resource: 'mana' },
];

describe.skipIf(!hasDatabase)('MatchesService', () => {
  let url: string;
  let moduleRef: TestingModule;
  let em: EntityManager;
  let service: MatchesService;

  beforeAll(async () => {
    url = await createScratchDatabase();
    process.env.DATABASE_URL = url;
    await runMigrations({ databaseUrl: url });
    moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
    em = moduleRef.get<EntityManager>(ENTITY_MANAGER);
    service = new MatchesService(em);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await dropScratchDatabase(url);
  });

  let sequence = 0;

  /** A player with the three agents a starter squad has, and the classes they are found by. */
  async function aPlayer(
    classes: AgentClass[] = ['sniper', 'wizard', 'priest'],
  ): Promise<{ user: User; agents: Agent[] }> {
    sequence += 1;
    const fork = em.fork();
    const user = fork.create(User, {
      displayName: `Player ${sequence}`,
      email: `match${sequence}@example.com`,
    });
    const agents = classes.map((agentClass) => fork.create(Agent, { user, class: agentClass }));
    await fork.flush();
    return { user, agents };
  }

  function messageFor(user: User, overrides: Partial<MatchEndedMessage> = {}): MatchEndedMessage {
    return {
      id: MATCH_ID,
      userId: user.id,
      seed: 4_242,
      mapId: 'overpass',
      protocolVersion: 10,
      units: [
        { unitId: 'A-sniper', class: 'sniper' },
        { unitId: 'A-wizard', class: 'wizard' },
        { unitId: 'A-priest', class: 'priest' },
      ],
      result: 'won',
      rounds: 7,
      startedAt: '2026-10-16T18:00:00.000Z',
      endedAt: '2026-10-16T18:07:30.000Z',
      finalStateHash: 3_000_000_000,
      events: EVENTS,
      ...overrides,
    };
  }

  /**
   * The stored rows, read with SQL of the test's own rather than through the code under test. `pg` hands
   * a `timestamptz` back as the string it arrived as and a `jsonb` back parsed, which is what makes the
   * round trip below an assertion about the bytes and not about the ORM's own reading of them.
   */
  function eventsOf(matchId: string): Promise<{ seq: number; event: unknown }[]> {
    return withClient(url, async (client) => {
      const { rows } = await client.query<{ seq: number; event: unknown }>(
        `select "seq", "event" from "match_events" where "match_id" = $1 order by "seq"`,
        [matchId],
      );
      return rows;
    });
  }

  function agentsOf(matchId: string): Promise<{ unit_id: string; agent_id: string }[]> {
    return withClient(url, async (client) => {
      const { rows } = await client.query<{ unit_id: string; agent_id: string }>(
        `select "unit_id", "agent_id" from "match_agents" where "match_id" = $1 order by "unit_id"`,
        [matchId],
      );
      return rows;
    });
  }

  function matchRow(matchId: string): Promise<Record<string, unknown> | undefined> {
    return withClient(url, async (client) => {
      const { rows } = await client.query<Record<string, unknown>>(
        `select * from "matches" where "id" = $1`,
        [matchId],
      );
      return rows[0];
    });
  }

  it('stores the match, the units that fought in it and its events', async () => {
    const { user, agents } = await aPlayer();

    expect(await service.store(messageFor(user))).toBe('stored');

    const stored = await matchRow(MATCH_ID);
    expect(stored).toBeDefined();
    expect(stored?.user_id).toBe(user.id);
    expect(stored?.map_id).toBe('overpass');
    expect(stored?.protocol_version).toBe(10);
    expect(stored?.result).toBe('won');
    expect(stored?.rounds).toBe(7);
    expect(new Date(stored?.ended_at as string).toISOString()).toBe('2026-10-16T18:07:30.000Z');

    // `bigint` is a string to `pg` and a number to the ORM, and both readings are asserted: a seed that
    // came back wrong would be a replay of a different match, and the ORM is what the history route
    // will read it with. 3_000_000_000 is over the signed 32-bit ceiling on purpose.
    expect(String(stored?.seed)).toBe('4242');
    expect(String(stored?.final_state_hash)).toBe('3000000000');
    expect((await em.fork().findOne(Match, { id: MATCH_ID }))?.seed).toBe(4_242);

    // Resolved by class and not by unit id: the match server has never heard of an agent (decision D9).
    const rows = await agentsOf(MATCH_ID);
    expect(rows.map((row) => row.unit_id)).toEqual(['A-priest', 'A-sniper', 'A-wizard']);
    expect(rows.find((row) => row.unit_id === 'A-sniper')?.agent_id).toBe(
      agents.find((agent) => agent.class === 'sniper')?.id,
    );

    expect(await eventsOf(MATCH_ID)).toEqual(EVENTS.map((event, seq) => ({ seq, event })));
  });

  /**
   * The whole of the idempotence. The match server's id is the primary key, so a message the queue hands
   * over twice is a conflict the database settles rather than a second match — and the agents and the
   * events are not written twice either, because the second delivery returns before either is reached.
   */
  it('writes nothing on a second delivery of the same match', async () => {
    const { user } = await aPlayer();
    const message = messageFor(user, { id: '3c7b1f2a-8d4e-4a91-b0c2-5e6f7a8b9c0d' });

    expect(await service.store(message)).toBe('stored');
    expect(await service.store(message)).toBe('duplicate');

    expect(await agentsOf(message.id)).toHaveLength(3);
    expect(await eventsOf(message.id)).toHaveLength(3);
  });

  /**
   * A unit whose class the squad does not have is skipped and not a crash. A squad is the platform's to
   * change — an agent put away, a class that arrived later — and that must cost the match one row and
   * not the whole history entry.
   */
  it('skips a unit whose class the player has no agent for', async () => {
    const { user } = await aPlayer(['sniper', 'priest']);
    const id = '11111111-2222-4333-8444-555555555555';

    expect(await service.store(messageFor(user, { id }))).toBe('stored');

    expect((await agentsOf(id)).map((row) => row.unit_id)).toEqual(['A-priest', 'A-sniper']);
  });

  /**
   * A match for an account this platform no longer has is `'user-gone'`, not an error: the account can
   * be deleted while the match is being played, and retrying the message would never find anybody to
   * store it for. The consumer reads this as "handled" and deletes the message.
   */
  it('answers user-gone for a player it does not have, and writes nothing', async () => {
    const { user } = await aPlayer();
    const orphan = messageFor(user, {
      id: '99999999-8888-4777-8666-555555555555',
      userId: '00000000-0000-4000-8000-000000000000',
    });

    expect(await service.store(orphan)).toBe('user-gone');

    expect(await matchRow(orphan.id)).toBeUndefined();
    expect(await eventsOf(orphan.id)).toEqual([]);
  });

  it('stores a match nobody moved in, which has a match row and no events', async () => {
    const { user } = await aPlayer();
    const id = '22222222-3333-4444-8555-666666666666';

    expect(await service.store(messageFor(user, { id, events: [] }))).toBe('stored');

    expect(await matchRow(id)).toBeDefined();
    expect(await eventsOf(id)).toEqual([]);
  });
});
