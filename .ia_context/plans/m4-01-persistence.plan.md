# Plan — m4-01 · Persistence foundation

**Milestone:** m4-01
**Parent feature:** m4-accounts-and-persistence
**Created:** 2026-10-16
**Status:** approved by the owner on 2026-10-16 — the decisions taken while implementing are D6–D12
**ADR:** 0019 · Migrations as a single step before the services start (accepted, written)

## 1. Objective

`platform-api` gets a real database: MikroORM over PostgreSQL, migrations that live in the repository
and run as **one step before the services start**, and a first migration that creates `users`. It
exposes two things to m4-02 and to every milestone after it: an injectable `EntityManager`, and a
`migrate` entry point that the compose file — and later a one-off ECS task — runs exactly once.

The first commit of this branch is not persistence: it corrects the stale M3 and M3.5 indexes and the
M2-b line, which is the gate the owner closed on 2026-10-16 (see the index, § Milestone gate).

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `.ia_context/plans/m3-rules-and-content.index.md` | modify | The five milestones marked with their PRs; the playtest and the M2-b acceptance recorded (first commit) |
| `.ia_context/plans/onboarding.index.md` | modify | The design milestone marked approved with PR #23 (first commit) |
| `ROADMAP.md` | modify | M3.5 and M3 marked done; § M4 split into this delivery and the rest (replay screen, squad choice, death and progression); ADR rows 0018–0020 in § Decisions (first commit, except the M4 split, which is this milestone's own subject) |
| `.ia_context/inputs/accounts-and-persistance.spec.md` | rename | To `m4-accounts-and-persistence.spec.md`, the name the spec itself suggests |
| `.ia_context/plans/m4-accounts-and-persistence.index.md` | modify | Milestone 0 and 1 marked with their PRs |
| `docs/adr/0019-migrations-as-a-single-step.md` | create | The decision, the advisory lock, expand and contract |
| `docs/adr/README.md` | modify | The 0018–0020 rows |
| `backend/platform-api/package.json` | modify | `@mikro-orm/core`, `@mikro-orm/postgresql`, `@mikro-orm/migrations`, `@mikro-orm/cli` (dev), `vitest` (dev); scripts `test`, `test:watch`, `migrate`, `migrate:create`, `migrate:check` — the last one is D12 |
| `backend/platform-api/tsconfig.json` | modify | Nothing but the entries the new `src` folders need, if `include: ["src"]` is not enough (it is — listed only if it changes) |
| `backend/platform-api/vitest.config.mts` | create | The test config, mirroring `backend/game-server/vitest.config.mts` |
| `backend/platform-api/src/config.ts` | modify | `readDatabaseUrl`, `readRequired` |
| `backend/platform-api/src/config.test.ts` | create | Section 4 |
| `backend/platform-api/src/db/orm.ts` | create | `createOrm(config)`, the single place the ORM options are built |
| `backend/platform-api/src/db/database.module.ts` | create | The Nest module that owns the ORM's lifetime and exposes the `EntityManager` |
| `backend/platform-api/src/db/database.module.test.ts` | create | Section 4, the ORM cases |
| `backend/platform-api/src/db/entities/user.entity.ts` | create | `users` |
| `backend/platform-api/src/migrations/Migration<timestamp>.ts` | create | The first migration: `users` |
| `backend/platform-api/src/migrate.ts` | create | The entry point: the process, its output and its exit codes |
| `backend/platform-api/src/migrate.test.ts` | create | Section 4 |
| `backend/platform-api/src/db/migrate.ts` | create | `runMigrations(config)` — added while implementing, see below |
| `backend/platform-api/src/db/test-database.ts` | create | Test support: the scratch database — added while implementing |
| `backend/platform-api/src/mikro-orm.config.ts` | create | The config the CLI reads — added while implementing, see D9 |
| `backend/platform-api/tsconfig.json` | modify | The test files excluded from `tsc`, as the sibling packages do — see D10 |
| `backend/platform-api/src/app.module.ts` | modify | Registers `DatabaseModule` |
| `.github/workflows/ci.yml` | modify | A `postgres:17-alpine` service, `DATABASE_URL` in the environment, the migrate step before the tests, and the `migrate:check` step right after it |
| `docker-compose.yml` | modify | A `migrate` service on the same image; `platform-api` waits for `condition: service_completed_successfully` |
| `package.json` | modify | `test` and `typecheck` include `platform-api`; root `db:migrate`, `db:migrate:create` and `db:migrate:check` scripts |
| `.env.example` | modify | `DATABASE_URL` documented as required, with its shape |

**Three files the plan did not list.** `src/db/migrate.ts` holds `runMigrations` and `src/migrate.ts`
holds the process, because a test cannot import a file that calls `process.exit` — and a
`require.main`/`import.meta` guard is not available in a package compiled to CommonJS and transformed to
ESM by vitest. `src/db/test-database.ts` is the scratch-database helper the integration cases share, and
is test support rather than application code. `src/mikro-orm.config.ts` is the CLI's config (D9).

## 3. Contract of the layer

**Configuration.** `readDatabaseUrl(raw)` takes `DATABASE_URL` and returns it, or throws when it is
missing or is not a `postgres://`/`postgresql://` URL. It follows `readPort` in the same file: the value
is checked where it is read, so a bad one stops the service at boot instead of at the first query.
`readRequired(raw, name)` is the same idea for a secret that must be present and must not be empty;
m4-02 reads the OAuth and cookie secrets through it.

**The ORM.** `createOrm(config)` returns a `MikroORM` instance built from `DATABASE_URL`, with
`entities` pointing at `dist/db/entities` (or `src/db/entities` under `tsx`), `migrations.path` at the
migrations folder of the same build, and `migrations.pathTs` at its source. `DatabaseModule` owns the
instance: it connects on init and closes on shutdown, and it exports the `EntityManager` under its own
token, so a service injects the manager and never the ORM.

**Migrations.** `src/migrate.ts` is a process, not a module the API imports:

```ts
// Acquires the lock, migrates, releases, exits. One step, before any instance of the API starts.
const lockKey = 8_170_001; // a constant of this repository's own, in src/db/orm.ts
```

It takes `pg_advisory_lock(lockKey)` on a dedicated connection, asks the migrator to run `up()`,
releases the lock in a `finally`, and exits `0`. A second process started at the same instant waits on
the lock and then applies nothing, because the first one already did. Every migration in this delivery
is **additive** — a new table, a new nullable column, a new index — so the code that is running while
the migration applies never asks for something that is not there.

**What this layer does not do.** It does not create the other seven tables (each later milestone brings
its own migration), it does not seed anything, it does not expose a repository or a query, and it does
not run migrations from the API's own boot — the API assumes the schema is already at the version the
migrate step left it at.

## 4. Tests planned

**Unit — configuration (`config.test.ts`)**
- [ ] `readDatabaseUrl` accepts a `postgres://` and a `postgresql://` URL and returns it unchanged.
- [ ] It throws on `undefined`, on an empty string, and on `mysql://…`, naming the variable.
- [ ] `readRequired` throws on a missing value and on whitespace, and returns a trimmed value otherwise.
- [ ] The process does not start with a bad `DATABASE_URL`: the module that reads it throws at boot
      (the existing shape of the port check, asserted the same way).

**Integration — migrations (`migrate.test.ts`, against the PostgreSQL of CI)**
- [ ] The first run applies the migration and `users` exists with the columns of section 6 of the spec.
- [ ] The second run in a row applies nothing: the migrator reports zero executed migrations, and the
      migration table holds one row for the migration.
- [ ] Two `migrate` processes started at the same time both exit `0`, and the migration table holds one
      row per migration — the advisory lock, tested rather than assumed.
- [ ] A migration that throws leaves no partial schema behind (each migration runs in the migrator's own
      transaction) and the lock is released, so the next run can start.
- [ ] The migration is additive: applying it to a database that already has the previous version's
      tables adds tables and drops none.

**Integration — the ORM (`database.module.test.ts`)**
- [ ] A `User` written through the injected `EntityManager` reads back with the same values, and
      `created_at` is filled by the entity, not by the caller.
- [ ] The manager comes from the container, so a second module that injects it gets the same instance.
- [ ] With `DATABASE_URL` absent the integration cases are **skipped** with a visible message, so
      `npm test` still runs on a machine with nothing up. CI always sets it and therefore never skips.

## 5. Dependencies

- **None.** m4-01 is the first milestone of the delivery.
- The gate the owner closed on 2026-10-16 is part of this branch (section 1).
- External, not blocking: the PostgreSQL of CI is the GitHub Actions service container, and nothing
  else has to exist for this milestone to be reviewed.

## 6. Out of scope

- The seven other tables. Each belongs to the milestone that first needs it, so that a reviewer of this
  PR reads one migration and not four.
- Repositories, query objects and DTOs. m4-02 introduces the first service that reads a user; the shape
  it needs is decided there, against a real call site.
- The ECS one-off task that runs `migrate` before a deploy. The command is written here; wiring it into
  the pipeline is M6's work, and the plan records the intent so the command stays a process.
- Seeds and fixtures beyond what a test needs.
- Connection-pool tuning, read replicas, and the `synchronize: true` shortcut — which is never enabled,
  in any environment, because the whole point of the milestone is that the schema is a file in the
  repository.

## 7. Decisions

**D1 · Which table comes first?** `users`. It depends on nothing, every later table points at it, and it
is the one table whose shape is already fixed by the spec. The alternative — an empty first migration
whose only job is to exercise the runner — proves the pipeline and nothing else, and leaves the table
that everything joins to for a later PR.

**D2 · Where the advisory lock key comes from.** A constant in this repository (`8_170_001`), not a hash
of the database name. Two different applications sharing one database must not collide, and a constant
that a reader can grep for is the clearest way to say so.

**D3 · Migrations in TypeScript, compiled.** The migrator is pointed at the compiled folder in a built
image and at the sources under `tsx`, the way the entities are. The alternative — SQL files — takes the
entity metadata out of the loop and lets the schema drift from the entities silently, which is the
failure this milestone exists to prevent.

**D4 · Decorators, with an explicit type per property.** Owner's decision D10 of the index. The
`platform-api` `tsconfig` already turns decorators and `emitDecoratorMetadata` on for Nest, so the
metadata provider needs no new machinery; every property still declares its type, so the schema does not
depend on inference through `reflect-metadata`.

**D5 · `npm test` with no database.** The integration cases skip when `DATABASE_URL` is absent. The
alternative — every contributor needing a running PostgreSQL to run the suite — buys nothing that the
CI job does not already give, and it breaks the property the repository has today, where the whole
suite runs with nothing up.

### Taken while implementing (2026-10-16)

**D6 · MikroORM 6, not 7.** v7 is ESM-only (`type: module`, no `main`) and `platform-api` compiles to
CommonJS. Pinned `^6.6.17`. Recorded in ADR 0019 §1.

**D7 · The manager the container exports is a fork.** The plan said `DatabaseModule` "exports the
`EntityManager`"; the first reading of it was `orm.em`, the ORM's global instance, and MikroORM refuses
`create`, `persist`, `flush` and `find` through it — `ValidationError: Using global EntityManager
instance methods for context specific actions is disallowed`. The token now resolves to `orm.em.fork()`:
a unit of work with an identity map of its own, one instance for the whole container, as the plan's test
case asks. The consequence to carry into m4-02: a fork is shared by every consumer, so the first request
that writes has to decide whether it forks per request (`RequestContext`, or a request-scoped provider).
That decision belongs to the milestone with the first write, not to this one, and the module comment
says so.

**D8 · `migrations.snapshot: false`.** MikroORM's default has the migrator write a
`.snapshot-<database>.json` next to the migrations for **every** database it touches. The test suite
creates a scratch database per case, so a run left twenty-three of them in `src/migrations/`, and a
container would write into its own filesystem on every boot. It also changed what `migrate:create`
diffs against — the snapshot rather than the database — which produced a migration that undid the
previous one. Off, and the diff is against the live database. Found by running the CLI, not by reading
about it; recorded in ADR 0019 §7.

**D9 · The CLI's config lives in `src/`.** `migrate:create` was given `mikro-orm.config.ts` at the
package root, and the CLI does not read it: without `ts-node` it looks only for a `.js` config, and
`rootDir: "src"` means `tsc` cannot emit one from the root. It is `src/mikro-orm.config.ts`, compiled to
`dist/mikro-orm.config.js`, and the script builds first — the CLI reads the same `ormOptions` the
application does, so a generated migration and the runner cannot drift. It also needs `defineConfig`
from the driver package: the CLI builds its configuration out of core, where an options object without a
`driver` is not a configuration at all.

**D10 · `@types/pg`, and the test files are excluded from `tsc`.** `pg` ships no types, so it is a
devDependency. The test files joined the siblings' convention — `backend/engine` and
`backend/game-server` both carry `"exclude": ["src/**/*.test.ts"]` — because they use `import.meta`,
which `module: "commonjs"` rejects. The plan predicted `tsconfig.json` would not change; it does, by
that one line.

**D11 · The entity's column types are written to match the migration.** `type: 'string'` is
`varchar(255)` to MikroORM, and the first migration writes `text`; the entity also had no schema default
for `created_at` where the migration has `now()`. The CLI reported both as pending changes — the drift
this milestone exists to prevent, caught by the tool the milestone adds. The entity was corrected
(`text`, `defaultRaw: 'now()'`, and `[OptionalProps]?: 'createdAt'` so a caller may leave it out), and
the same command now answers `No changes required, schema is up-to-date`.

**D12 · `migrate:check` is a script, and CI runs it after the migrate step.** The command that found the
drift in D11 was one a person has to remember to type. It is now `npm run db:migrate:check`
(`mikro-orm migration:check`), and the CI job runs it immediately after the migrate step, against the
database the migrations have just produced — so entity metadata and migrations that disagree exit `1`
with `Changes detected. Please create migration to update schema.` and fail the build. Verified both
ways on a scratch database before it was committed: green after a real migration
(`No changes required, schema is up-to-date`, exit `0`), red with a deliberately wrong column type, then
green again after the revert. Recorded in ADR 0019 §Consequences.
