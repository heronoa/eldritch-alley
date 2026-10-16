# 0019. Migrations run as a single step, before the services start

**Status:** Accepted (2026-10-16).

## Context

Until M4 there was nothing to persist: the engine is pure, the match server keeps a match in memory for
its lifetime, and `platform-api` answered `/health`. Accounts, a persistent squad, a battle history and
the AWS deploy (ECS, ALB, RDS) all need a database, and the first one to need it is m4-01.

The schema has to be a file in this repository. Two failures are worth designing against: a schema that
drifts from the code that reads it, because a `synchronize`-style shortcut let the ORM rewrite tables
from whatever the entities happen to say in the environment it booted in; and a rolling deploy where a
new instance starts against a database the previous version's schema is still on.

## Decision

1. **MikroORM 6 over PostgreSQL**, with the entities as the source of truth and the migrations derived
   from them. Version 6 and not 7: v7 is ESM-only, and `platform-api` compiles to CommonJS.
2. **`synchronize` is never enabled, in any environment.** The schema is the migrations, and nothing
   else creates or alters a table.
3. **The migration is a process of its own**, `node dist/migrate.js`, run once before any instance of
   the API starts — `docker compose` runs it as a service the API waits on
   (`condition: service_completed_successfully`), and CI runs it against an empty database. The API
   never migrates on its way up: it assumes the schema is already at the version the step left it at.
4. **One `pg_advisory_lock` for the whole step**, key `8170001`, taken on a connection of its own. Two
   processes started at the same instant — a one-off task and a rolling update, two replicas booting
   together — do not race: the second waits, then finds nothing to apply. The key is a constant of this
   repository rather than a hash of the database name, so two applications sharing a database cannot
   collide and a reader can find it with a grep.
5. **Each migration runs in its own transaction.** PostgreSQL has transactional DDL, so a migration that
   fails half way through leaves nothing behind — no half-created table, and no row in the migration
   table claiming it ran.
6. **Every migration in this delivery is additive** — a new table, a new nullable column, a new index —
   so the code running while the migration applies never asks for something that is not there. A removal
   is two steps in two releases: stop using the column, then drop it in the next one.
7. **No snapshot files.** MikroORM's default would have the migrator write a `.snapshot-<database>.json`
   next to the migrations for every database it touches — one per scratch database the test suite
   creates, and a write into the filesystem of a running container. The snapshot exists so a diff can be
   taken with no database in reach; `migrate:create` here compares the entities against the database the
   developer is pointed at, which is a problem this repository does not have.
8. **The database decides idempotence.** Anything that must be applied exactly once — a match recorded
   from the queue, a squad created on the first sign-in — is made idempotent by a constraint in the
   schema, not by the consumer remembering what it has seen.
9. **The mobile client and the game server are not part of this.** The match server keeps its state in
   memory and writes nothing; the queue between the two backends carries what the platform stores.

## Consequences

- A new environment is one command, and it is the same command in compose, in CI and — later, as an ECS
  one-off task — in the deploy.
- The migration step is a single point of failure by construction: if it fails, no instance starts. That
  is the intent, and the exit code is what the pipeline reads.
- A migration is a file that a reviewer reads. The CLI generates it from the entity diff, and the same
  diff run as a check — `npm run db:migrate:check`, `migration:check` — reports
  `No changes required, schema is up-to-date` when the entities, the migrations and the database agree,
  and exits `1` with `Changes detected` when they do not. CI runs it against the database the migrate
  step has just produced, so a column type or a default that a migration and an entity disagree on fails
  the build instead of surfacing as a wrong query in production.
- The entities and the migrations have to be written to agree on the column types, not merely on
  behaviour: `text` in a migration is not `string` in an entity, which defaults to `varchar(255)`. The
  check above is what turns that from a thing a reviewer has to notice into a thing CI refuses.
- Nothing in this delivery is reversible on the server side of the *schema* either: the migrations have
  a `down`, but no deploy runs it, because the previous version of the code is what a rollback goes back
  to, and it expects the schema it left.
