# Spec: M4. Accounts and persistence (first delivery)

Suggested location in the repository: `.ia_context/inputs/m4-accounts-and-persistence.spec.md`.

## Read first

- `CLAUDE.md`. In particular, rule 4 (plan first, wait for approval) and the Git section (no commits; propose the commit split at the end).
- `ROADMAP.md`, sections M4, M5 and M6.
- ADRs 0003 (death), 0005 (deterministic engine), 0006 (NestJS 11), 0008 (Colyseus 0.18) and 0009 (client localization).
- `backend/game-server/src/battle-room.ts` and `protocol.ts`.
- `backend/platform-api/src/` (today: health check and config only).

## Goal

Players sign in, keep a persistent squad, and see the history of their battles. The project gets a real database with migrations, so the planned AWS deploy (ECS, ALB, RDS) has real data to store. Visitors can also send a contact message and opt in to release emails.

## Product decisions already taken

1. **Login with GitHub and Google only (OAuth).** No passwords: no hashing, no password reset, no email verification. This changes the M4 wording "sign-up and login" and needs an ADR.
2. **Guests keep playing.** Playing against the bot without an account still works exactly as today. Guest matches are not stored. Signing in is offered and never required to play.
3. **Starter squad.** On first sign-in, every player receives three agents: 1 Sniper, 1 Wizard, 1 Priest, all at level 1.
4. **No death and no level-up in this delivery.** Agents never die and never level up. The schema still stores `level` and `status` for each agent, so both features can arrive later without a schema change. The ADR 0003 addendum ("the death is recorded in the database") is deferred, not dropped.
5. **Battle history, not replay.** This delivery stores everything a replay needs (seed, map, ordered events) and shows a history list. The replay screen stays in M4 for a later delivery.
6. **Contact form**, stored in the database and forwarded to the owner by email.
7. **Release emails by opt-in.** A checkbox in the profile, unchecked by default, with the consent date recorded and an unsubscribe link in every email.
8. **Privacy policy page**, in both locales. The Portuguese text is attached to this spec (`eldritch-alley-privacidade.md`), and the English version is a translation of it. Account deletion is handled by email request in this delivery, which is what the policy says. No deletion endpoint is needed yet.

## Architecture

### Data and migrations

- MikroORM with PostgreSQL in `platform-api`, as the roadmap already states.
- Migrations live in the repository and run as **a single step before the services start**, never by each instance at boot:
  - Docker Compose: a `migrate` service that runs once, with `platform-api` depending on it through `condition: service_completed_successfully`.
  - The same command later becomes a one-off ECS task before each deploy.
  - The migrate command takes a PostgreSQL advisory lock, so two concurrent runs cannot both apply migrations.
- Every migration is backward compatible with the code currently running (expand and contract). Renaming or dropping a column takes two deliveries.

### Authentication

- OAuth 2.0 authorization code flow with PKCE and `state`, handled by `platform-api`. The library is the planner's choice, justified in the plan.
- After the callback, `platform-api` sets a **session cookie**: `HttpOnly`, `Secure`, `SameSite=Lax`, scoped to the parent domain so the client and the API share it. The long-lived token never reaches JavaScript.
- The match server never sees the session cookie. To join a room, the client asks `platform-api` for a **game ticket**: a JWT that lasts 5 minutes, signed with an asymmetric key (EdDSA or RS256). The client passes it in the join options. The match server checks it in `onAuth` with the public key only, so the match server can verify tickets but never issue them.
- A join without a ticket is a guest join, same as today.
- Identities: the pair (`provider`, `provider_user_id`) is unique. A second provider links to an existing account only when both providers report the same email as **verified**. Otherwise a new account is created. The plan must cover this rule with tests: it is the same account-takeover risk class as an IDOR.
- CORS allows only the client's origin, with credentials.

### Recording matches

As in the roadmap:

1. When a match with a signed-in player ends, the match server publishes a `match-ended` message to SQS (LocalStack locally). It carries the match id, seed, map id, player id, the agent id of each unit, the winner, the number of rounds and the ordered events.
2. `platform-api` consumes the queue and stores the match.
3. The consumer is **idempotent**: the match id is the primary key, so a message delivered twice is stored once.
4. Messages that fail repeatedly go to a dead-letter queue, not into an infinite loop.

Guest matches publish nothing.

## Data model

Names and types are a starting point. The planner may refine them in the plan.

| Table | Columns |
|---|---|
| `users` | id (uuid), display_name, email, avatar_url, privacy_version_seen, created_at, last_login_at |
| `identities` | id, user_id, provider (`github` or `google`), provider_user_id, email, email_verified, created_at; unique (provider, provider_user_id) |
| `agents` | id (uuid), user_id, class (`sniper`, `wizard` or `priest`), level (default 1), status (default `active`), created_at |
| `matches` | id (uuid, from the match server), user_id, seed, map_id, protocol_version, result (`won` or `lost`), rounds, started_at, ended_at |
| `match_agents` | match_id, agent_id, unit_id |
| `match_events` | match_id, seq, event (jsonb); primary key (match_id, seq) |
| `release_subscriptions` | user_id, opted_in, consented_at, unsubscribe_token (unique), unsubscribed_at |
| `contact_messages` | id, name, email, message, user_id (nullable), ip_hash, created_at |

- Store a hash of the IP, never the raw IP, in `contact_messages`.
- The `match_events` table is append-only.

## Endpoints (`platform-api`)

| Method and path | Auth | What it does |
|---|---|---|
| `GET /auth/:provider` | none | Starts the OAuth flow |
| `GET /auth/:provider/callback` | none | Finishes it, creates or updates the user, sets the cookie, creates the starter squad on first sign-in |
| `POST /auth/logout` | session | Clears the cookie |
| `POST /auth/game-ticket` | session | Returns a 5-minute game ticket |
| `GET /me` | session | Profile, squad and release opt-in |
| `PATCH /me/release-emails` | session | Opt in or out; records the consent date |
| `GET /me/matches?cursor=` | session | Battle history, newest first, paginated by cursor |
| `GET /unsubscribe/:token` | none | One-click unsubscribe from release emails |
| `POST /contact` | none (optional session) | Contact form, protected by Cloudflare Turnstile and rate-limited by IP in Redis |

## Client (`frontend`)

- A sign-in button on the title screen, with GitHub and Google. Playing as a guest stays one click away and stays the default action.
- A profile panel: name and avatar, the three agents with class and level, the release-emails checkbox, and sign out.
- A battle history panel: date, map, result and number of rounds.
- A contact form.
- A privacy policy page, linked from the sign-in panel, the contact form and the title footer.
- All new text in `en-US` and `pt-BR` (ADR 0009).

## Configuration

Every new variable is read and checked at boot, following `readPort` in `config.ts`. A bad value stops the service at start:

`DATABASE_URL`, `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET`, `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_BASE_URL`, `SESSION_SECRET`, `COOKIE_DOMAIN`, `CLIENT_ORIGIN`, `GAME_TICKET_PRIVATE_KEY` (platform-api), `GAME_TICKET_PUBLIC_KEY` (game-server), `MATCH_ENDED_QUEUE_URL`, `TURNSTILE_SECRET`, `EMAIL_FROM`, `CONTACT_NOTIFY_TO`, plus the settings of the email provider.

Email goes through a port with two adapters: one that writes to the log (local and tests) and an SMTP adapter. The provider is chosen later.

Update `.env.example`. Never commit secrets.

## Proposed delivery order

One plan per step, in `.ia_context/plans/`, with an index. Each step leaves CI green.

1. **m4-01 persistence:** MikroORM, the first migration, the `migrate` service and command with the advisory lock, and a PostgreSQL service in CI for integration tests.
2. **m4-02 auth:** OAuth for both providers, users and identities, session cookie, `/me`, starter squad on first sign-in, game ticket.
3. **m4-03 match recording:** ticket check in `onAuth`, the `match-ended` publish, the idempotent consumer with a dead-letter queue, and the tables for matches, agents and events.
4. **m4-04 client:** sign-in, profile, battle history.
5. **m4-05 contact, release emails and privacy:** contact form with Turnstile and rate limiting, opt-in and unsubscribe, privacy page in both locales.

## Tests (TDD, as in the existing plans)

- **Determinism from storage:** a match played against the bot is stored; rebuilding it from the stored seed and events with `applyEvents` gives the same final-state hash as the live match. This proves the storage is enough for the future replay.
- **Account linking:** a second provider with the same verified email links; the same email unverified on either side creates a new account; a (provider, provider_user_id) pair seen before signs in to the same user.
- **Starter squad:** created exactly once, on the first sign-in, never again.
- **Game ticket:** an expired ticket, a ticket with a bad signature and a missing ticket. The first two are refused; the last joins as a guest.
- **Idempotent consumer:** the same `match-ended` message delivered twice stores one match.
- **Guests:** a guest match publishes nothing and stores nothing.
- **Contact:** without a valid Turnstile token it is refused; past the rate limit it returns 429.
- **Unsubscribe:** an unknown token returns 404 and changes nothing; a known token works once and is idempotent afterwards.
- **Migrations:** the migrate command run twice in a row applies nothing the second time; two concurrent runs do not both apply.

## ADRs to write

Next free numbers, starting at 0018:

1. Login with GitHub and Google only (OAuth), session cookie plus a short game ticket signed with an asymmetric key.
2. MikroORM migrations as a single step before deploy, with an advisory lock.
3. Persistent squad with a starter set, and death and level-up deferred (link to ADR 0003).

Also update `ROADMAP.md`: split M4 into this delivery and the rest (replay screen, squad choice, death and progression).

## Out of scope

- The replay screen.
- Account deletion endpoint and data export (handled by email request, as the policy says).
- Agent death, level-up, new agents and equipment.
- Choosing which agents go into a match (the starter squad always plays).
- PvP, matchmaking, rating (M5).
- AWS infrastructure and Terraform (separate delivery).
- Analytics.

## Done when

- A visitor signs in with GitHub or Google, sees the three starter agents in the profile, plays a match, and finds it in the battle history.
- The same match rebuilt from the database gives the same final-state hash as the live one.
- A guest still plays with no account, and nothing is stored.
- A contact message reaches the database and the owner's email (the log adapter is enough locally).
- Opting in and out of release emails records the consent date, and the unsubscribe link works.
- The privacy policy page exists in both locales and is linked from the sign-in panel.
- `docker compose up --build` applies migrations once and starts everything; CI is green with the PostgreSQL service.
- The ADRs and `ROADMAP.md` are updated, and the commit split is proposed for Heron.