import { Migration } from '@mikro-orm/migrations';

/**
 * `matches`, `match_agents` and `match_events`: the battle history.
 *
 * Three tables and not one, because they answer three different questions and only the first is per
 * match. `match_agents` is what makes a match belong to a squad rather than to three anonymous
 * classes, and `match_events` is what makes it replayable — the two are written with the match, in one
 * transaction, and read back one at a time.
 *
 * `seed` and `final_state_hash` are `bigint`. Both are unsigned 32-bit values by construction
 * (`UINT32_MAX` in the engine, `fnv1a`'s `>>> 0`), so a signed 32-bit column would reject half of the
 * seeds the match server can draw — the kind of fault that would look like a queue problem for a week.
 *
 * The primary keys carry the idempotence. `matches.id` is the match server's own id, so a message
 * delivered twice is a conflict and not a second row (ADR 0019); `(match_id, unit_id)` and
 * `(match_id, seq)` extend that to the two child tables, which is what lets the store be a single
 * `insert ... on conflict do nothing` per table.
 */
export class Migration20261016180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "matches" (
        "id" uuid not null,
        "user_id" uuid not null,
        "seed" bigint not null,
        "map_id" text not null,
        "protocol_version" integer not null,
        "result" text not null,
        "rounds" integer not null,
        "final_state_hash" bigint not null,
        "started_at" timestamptz not null,
        "ended_at" timestamptz not null,
        "created_at" timestamptz not null default now(),
        constraint "matches_pkey" primary key ("id"),
        constraint "matches_user_id_foreign" foreign key ("user_id")
          references "users" ("id") on update cascade on delete cascade
      );
    `);

    // Serves the history query whole: the filter on the player, the order, and the cursor's page
    // boundary. PostgreSQL reads an index backwards, so one ascending index answers a descending order.
    this.addSql(
      `create index "matches_user_id_ended_at_index" on "matches" ("user_id", "ended_at", "id");`,
    );

    this.addSql(`
      create table "match_agents" (
        "match_id" uuid not null,
        "unit_id" text not null,
        "agent_id" uuid not null,
        constraint "match_agents_pkey" primary key ("match_id", "unit_id"),
        constraint "match_agents_match_id_foreign" foreign key ("match_id")
          references "matches" ("id") on update cascade on delete cascade,
        constraint "match_agents_agent_id_foreign" foreign key ("agent_id")
          references "agents" ("id") on update cascade on delete cascade
      );
    `);
    this.addSql(`create index "match_agents_agent_id_index" on "match_agents" ("agent_id");`);

    this.addSql(`
      create table "match_events" (
        "match_id" uuid not null,
        "seq" integer not null,
        "event" jsonb not null,
        constraint "match_events_pkey" primary key ("match_id", "seq"),
        constraint "match_events_match_id_foreign" foreign key ("match_id")
          references "matches" ("id") on update cascade on delete cascade
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "match_events" cascade;`);
    this.addSql(`drop table if exists "match_agents" cascade;`);
    this.addSql(`drop table if exists "matches" cascade;`);
  }
}
