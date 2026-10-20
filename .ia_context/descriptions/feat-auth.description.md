# MR — Sign in with GitHub, Google or an address and a password, a signed cookie instead of a session table, and the ticket the match server checks (M4 · m4-02)

**Branch:** `feat/auth`
**Base branch:** `develop`
**Milestone:** M4 · Accounts and persistence — m4-02 (sign-in, session and game ticket), sitting on m4-01 (persistence foundation), which has [its own description](./feat-persistance-foundation.description.md)
**Ticket(s):** None — m4-02 of [`.ia_context/plans/m4-accounts-and-persistence.index.md`](../plans/m4-accounts-and-persistence.index.md); writes ADRs **0018**, **0020** and **0021**. Touches no `EA-` and no `DT-` item
**Date:** 2026-10-16

---

### 1. What this MR delivers

A player can now create an account and come back to it, **by three different ways in**: GitHub, Google,
or an address and a password. Signing in returns the browser to the client with an `ea_session` cookie,
and the first sign-in of a new player writes the **starter squad** — one Sniper, one Wizard, one Priest,
all at level 1 — inside the same transaction that creates the account, so a callback retried after a
failure either finds the account or creates it whole. `GET /me` answers with the profile and those three
agents, which is every piece of the player's own state the client needs before a match, and
`POST /auth/game-ticket` mints the five-minute EdDSA ticket that m4-03's match server will verify with a
public key and nothing else.

Two amendments landed while the milestone was being applied, and both changed what this MR is:

- **The OAuth apps are optional (plan § 8).** The milestone refuses to boot without the *session* and the
  *ticket* secrets, because a session signed with a key from a repository is a session anyone can mint —
  but a GitHub app is the developer's own, and the project must run without one. Each provider is a pair
  of values, all-or-nothing: with the pair, the button exists; with neither, that provider is off and its
  route answers `404`. With half a pair the service **refuses to start, naming both variables**, because
  half a credential is a typo and not a choice. `GET /auth/providers` is new and is how the client — which
  is static assets and cannot read the server's environment — learns which buttons to draw. **m4-04 owns
  drawing them**; the endpoint is this MR's whole part of it.
- **There is now an address-and-password route (§ 9), and it reverses ADR 0018 § 1.** 0018 refused
  passwords because they bring *"hashing, reset, verification mail and a breach to answer for, none of
  which this delivery has an owner for"*. The owner has taken that on, so the milestone delivers the
  complete flow — sign up, verify, sign in, reset — and records the reversal as **ADR 0021**, which
  supersedes decision 1 of 0018 and nothing else. The session cookie, the ticket, the linking rule and the
  error shape are untouched, and a password sign-in ends in the same `signSession` call the callback ends
  in. `docs/adr/0018-…md` is left exactly as it was: an accepted ADR is not rewritten, and the README's
  0021 row is the pointer.

What a password account *is* is the part a reviewer should read twice. The credential hangs off the
**identity**, not off the account: `identities` gains a third `provider` value, `'password'`, whose
`provider_user_id` is the lowercased address. That one choice buys three things — everything the platform
already points at is the identity, so `/me`, the squad and the linking rule need no new case; "an account
with a password and no way in" stops being representable; and the unique constraint m4-02 already has on
`(provider, provider_user_id)` becomes, for free, the rule that keeps one password account per address.
An account is **unusable until the address is verified** (`403 email_not_verified`), and that is what
makes the existing both-sides-verified linking rule safe in both directions: register with somebody
else's address and the account you created is one nobody can sign in to, while the real owner's Google
sign-in lands on their own account. Afterwards, signing in with Google lands on the account that already
has the squad — no account is ever merged into another.

The second consequence is that **the session is a signed cookie and not a
row**: it carries the user id, a session id and the instant it was issued, signed with
`SESSION_SECRET`, and the server keeps nothing. Logging out clears the cookie and that is *all* it
does — the owner's decision D3 in the index — so a cookie copied off a machine stays valid until it
expires, thirty days later. Session revocation arrives with account deletion, and ADR 0018
§Consequences is where that is written down rather than discovered later.

The **linking rule** is the part a reviewer should read twice, because it is the one place where being
wrong means two people sharing a squad. `(provider, provider_user_id)` is the only key that ever
decides which account a sign-in lands on. An address only ever *adds* a way in, and only when it was
verified on **both** sides: a new GitHub identity whose verified address matches an existing verified
Google identity is linked to that account; an unverified address on either side, or a missing one,
creates a new account instead. The asymmetry is intentional — an address is a claim, and a provider
that does not verify it is a provider that will hand out `ceo@company.com` to whoever asks.

Implementation followed m4-02's contract closely; the divergences are named rather than silenced:

- **`src/app.ts`, a file the plan's table did not list.** The plan put cookie parsing and CORS in
  `main.ts`. They live in `configureApp(app)` instead, because the route tests start the real
  `AppModule` and a middleware the tests do not have is a middleware that only breaks in production.
  `main.ts` calls it. Same reason, and the same shape, as the three files m4-01 added outside its table.
- **`src/auth/session.ts` also owns the flow cookie.** The plan gave this file "the cookie options in
  one place", which turned out to mean both cookies: `ea_oauth` (the `state` and the PKCE verifier,
  600 s) shares `Path`, `Domain`, `HttpOnly`, `SameSite=Lax` and the `Secure`-unless-loopback rule
  with the session cookie. Duplicating those five flags in a second file is how the two drift apart.
- **Google is configured with written endpoints, not through discovery.** Plan decision D1 said
  `openid-client`'s discovery would cover Google "with no code of our own". Discovery is a network
  call made *while the container is being built*, and a platform that refuses to boot because Google
  is unreachable is a worse platform than one holding two stable URLs. `idTokenExpected: true` still
  makes the library verify the ID token's signature, `iss`, `aud` and `exp` before any claim is read,
  so nothing about the trust in Google's answer was traded away — only the boot-time fetch.
- **The single-use `state` is a `Map` in the controller, not the cookie alone.** D4 has the callback
  clearing the flow cookie so that "a replayed `state` finds nothing to match". A cookie cannot be
  taken back from a browser that already has it, and the plan's own test list asks for "a `state` that
  was already spent" to be refused, so the fact has to be remembered on the server for the length of a
  flow. It is a `Map` in `OAuthController`, pruned as it is used. **The flow cookie is therefore *not*
  cleared on the callback** — the divergence is deliberate but it is a real difference from D4, and it
  means an `ea_oauth` cookie outlives a completed sign-in by up to ten minutes. Nothing reads it after
  the state is spent.
- **`@HttpCode(HttpStatus.OK)` on `POST /auth/game-ticket`.** Nest answers `201` to a `POST` by
  default; a ticket is not a created resource, and the plan's routes table says `200`.
- **Four existing test files were changed, because this milestone invalidated their premises.**
  `migrate.test.ts` asserted "1 migration" and now counts the files in the migrations directory;
  `config.test.ts` and `database.module.test.ts` compile `AppModule`, which now reads the sign-in
  secrets, so they set them; `src/auth/test-app.ts` runs the migrations against its scratch database,
  because without a schema every route died on `relation "identities" does not exist`. No test was
  weakened and none was added to cover new behaviour in this group.
- **Three Portuguese strings met rule 6 of `CLAUDE.md`** in files the milestone was already editing:
  the boot line in `main.ts`, and `# Portas locais` / `troque-em-producao` in `.env.example`, plus the
  two `defina … no .env` messages in `docker-compose.yml`. This closes the last line of m4-01's
  § Documentation debt.
- **The partial unique index § 9.3 asked for was dropped, because it was wrong.** The plan wanted
  `unique (lower(email), user_id) where email_verified` on `identities` to hold "one address, one
  verified account". The suite refused it the moment it was written: a **linked** account holding a
  verified GitHub identity *and* a verified Google one — precisely the state the linking rule exists to
  produce — violates a per-user index, and a global one refuses it twice over. A `provider = 'password'`
  filter would only restate the pair rule. The invariant is held by `(provider, provider_user_id)` with
  the address as its second half, plus the linking rule; `identity.entity.ts` says so where a reader
  would look for the index, and `migrate:check` is clean without it. This is the plan being corrected by
  the tests rather than the other way round, and it is recorded in ADR 0021 § Consequences.
- **`forgot` is not throttled, which is a real narrowing of plan D15.** D15 had one counter shared by
  login and reset. Throttling `forgot` by address would let anyone lock a player out of their own reset
  by guessing their address, and by IP it is the counter that shares one bucket behind a proxy; a
  `forgot` that mails a link to an address with no account sends nothing. So the counter guards **failed
  sign-ins only**. ADR 0021 § Consequences names the cost and where the fix belongs.
- **`§ 3` of the plan says "the seven routes" and its own table lists six.** Six is what the amendment
  needs, and six is what shipped.
- **Three files were changed outside § 9.2's list.** `identity.entity.ts`'s `ProviderName` gained
  `'password'`, which forced `fake.provider.ts` and `oauth.controller.ts` from `ProviderName` onto a new
  `OAuthProviderName` — the type-level statement that a password is a row in `identities` and never a
  button or an entry in `GET /auth/providers`. `auth.service.ts` gained `export` on `normalizeAddress`,
  so the password lookup and the linking rule spell an address the same way (a second, private
  lowercasing would be a second answer to one question).
- **`email/smtp.mailer.ts` and `email/log.mailer.ts` are one file, `email/adapters.ts`.** Two four-line
  classes do not need two modules.
- **The sign-in-cookie composition is duplicated between `oauth.controller.ts` and
  `password.controller.ts`** — `signSession` + `sessionCookie` written twice, ~8 lines each. Identified
  during the refactor pass and **left alone on purpose**: extracting it now would put a shared helper in
  place while only two call sites exist and no third is planned, and it is exactly the kind of change
  that should ride with the next route that needs a session rather than with a milestone that reverses
  an ADR.

---

### 2. What changed and why

| File | What changed | Why it matters |
|------|---------------|-----------------|
| `backend/platform-api/src/auth/provider.ts` *(new)* | The port: `OAuthProvider` (`name`, `authorizationUrl`, `exchange`) and the `ProviderProfile` a provider answers with — id, address, **whether the provider verified it**, display name, avatar | One interface for two providers, so the linking rule and the controller are written once. `email: null` is a real answer and not an error, and `emailVerified` is what stops a private GitHub address from linking |
| `backend/platform-api/src/auth/github.provider.ts` *(new)* | `openid-client` against GitHub's authorize and token endpoints, `ClientSecretPost`, PKCE `S256`, then `/user` and `/user/emails` for the profile and the verified address | GitHub is not an OIDC provider, so it is configured by hand; the second call is what makes `emailVerified` an answer rather than a guess |
| `backend/platform-api/src/auth/google.provider.ts` *(new)* | The same library against Google's written endpoints, `idTokenExpected: true`, the profile read from the verified ID-token claims | No discovery, for the boot-time reason above. The claims are the provider's own signature-checked answer, so no second call is needed |
| `backend/platform-api/src/auth/fake.provider.ts` *(new)* | A provider that answers whatever the test tells it to, and throws when the test tells it to | The route cases run against the real container and the real guard with no network. It is also the seam a future local development flow can use |
| `backend/platform-api/src/auth/auth.service.ts` *(new)* | `signIn(provider, profile)`: find by `(provider, provider_user_id)`, else link on a **both-sides-verified** address, else create — and on the create path write the `User`, the `Identity` and the three `Agent`s in one transaction | The linking rule and the starter squad in one readable place. `email_verified` is only ever written as `true`, never downgraded, so an identity that was verified stays verified |
| `backend/platform-api/src/auth/session.ts` *(new)* | Signs, reads and clears both cookies; `cookie()` holds the five flags once, and `Secure` is dropped only for a loopback `CLIENT_ORIGIN` | The age check is this service's own rule on `issuedAt`, not the token's `exp`, so how long a session lasts is configuration rather than something baked into a cookie already in the wild. Reading the origin instead of `NODE_ENV` is one rule that cannot be wrong in the direction that matters (plan D6) |
| `backend/platform-api/src/auth/session.guard.ts`, `current-user.ts` *(new)* | The guard every session route wears, and the decorator that hands its answer to a handler | A new route is protected by adding one line, and it cannot forget: the decorator throws the same `401` if the guard did not run |
| `backend/platform-api/src/auth/game-ticket.ts` *(new)* | `issueGameTicket(userId, config)` → `{ ticket, expiresAt }`: a compact EdDSA JWS with exactly `iss`, `sub`, `iat`, `exp` | The smallest claim set that identifies a player, because the ticket travels through the client and through a socket the player controls — no name, no address, no squad. The key is parsed once per process and the PEM's escaped `\n` is undone here, because `docker compose` and node's `--env-file` disagree about who does that |
| `backend/platform-api/src/auth/oauth.controller.ts` *(new)* | `GET /auth/:provider` (state, PKCE verifier, flow cookie, `302` to the provider) and `GET /auth/:provider/callback` (verify, spend the state, exchange, sign in, session cookie, `302` to the client) | The whole flow in one file, including the two secrets it owns. The provider's own reason for refusing a token exchange goes to the log and **never** to the body — it can name the client, the secret and the account |
| `backend/platform-api/src/auth/auth.controller.ts` *(new)* | `POST /auth/logout` (`204`, cookie cleared) and `POST /auth/game-ticket` (`200`) | The two things a signed-in player does to their own session |
| `backend/platform-api/src/me/me.controller.ts` *(new)* | `GET /me` → the profile and the squad, agents ordered by class | The client's first call after the callback. It returns the agents' **stored** fields and never computed stats: the platform does not know what a sniper's range is (plan D5) |
| `backend/platform-api/src/db/entities/identity.entity.ts`, `agent.entity.ts` *(new)* | `identities` and `agents`, with the unique `(provider, provider_user_id)`, the email index, and the two foreign keys to `users` cascading | The unique constraint is the linking rule's backstop: two concurrent first sign-ins of the same person fail on it rather than producing two accounts. The entities declare the indexes and the constraint that the migration creates, or `migrate:check` reports drift |
| `backend/platform-api/src/migrations/Migration20261016140000.ts` *(new)* | The second migration, hand-written SQL: `identities`, `agents`, their indexes and their keys; `down()` drops both | Additive, like every migration in this delivery, so code running while it applies never asks for something that is not there (ADR 0019) |
| `backend/platform-api/src/app.ts` *(new; not in the plan's table)* | `configureApp(app)` — cookie parsing and CORS restricted to `CLIENT_ORIGIN` **as a list**, with credentials — and `apiError(status, code, message)` | The tests start the same application the deploy does. The list is not cosmetic: the `cors` middleware echoes a string `origin` back to whoever asked, and only a list makes it compare the request's origin first |
| `backend/platform-api/src/app.module.ts`, `main.ts` | The five controllers, the config providers, `AuthService`, `PasswordService`, the `MAILER` and the `FAILURE_THROTTLE` registered; `main.ts` calls `configureApp` | The wiring. `main.ts`'s boot line also came back into English. The mailer is a **value** on purpose, because a test replaces it and the rest of the application is what runs |
| `backend/platform-api/src/config.ts` | `readGameTicketTtl(raw)` — `300` when unset or blank, a whole positive number otherwise, and a throw naming `GAME_TICKET_TTL_SECONDS` | Same shape as `readPort` and `readDatabaseUrl`: a bad value stops the service at boot instead of minting tickets with a nonsense lifetime |
| `backend/platform-api/src/auth/*.test.ts`, `src/email/mailer.test.ts`, `src/me/me.controller.test.ts` *(new)* | **112 cases** across the package, 63 of which need a database — up from 57, **48 of them in the five files the two amendments added**: `password.test.ts` (the hash's format, the policy's edges, a stored value that cannot be read), `mailer.test.ts` (the adapter choice and the half-a-set refusal), `provider.test.ts` (the same rule for the OAuth pairs), `auth-token.test.ts` (hashed, single use, expiring, superseded), `password.controller.test.ts` (16 E2E cases over a real listening server) | The link-versus-create decision, the single-use state, "the provider's reason stays in the log" and the whole password flow are tested rather than assumed. Two of them earn their keep beyond coverage: *"answers the same for a wrong password and for an address with no account, at the same cost"* is the assertion that keeps the route from being a way to list accounts, and *"is where a later Google sign-in with the same verified address lands, with one squad"* is the case § 9 exists to close |
| `src/migrate.test.ts`, `src/config.test.ts`, `src/db/database.module.test.ts`, `src/auth/test-app.ts` | Their premises were rewritten, not their subjects: the migration count is read from the directory, the sign-in secrets are set before the container is built, the scratch database is migrated before it is used — and `test-app.ts` now installs a **fake mailer always**, not only when a case asks for one | Without the first three, the suite was red for reasons that had nothing to do with what it tests — the honest cost of a milestone that changes what "a booted platform" means. The mailer override is "always" for a sharper reason: nothing in the suite may open a socket to a mail server, and a case that forgot to ask must not be the one that tries |
| `.env.example`, `docker-compose.yml` | The m4-02 block: `SESSION_SECRET` with the command that generates one, `COOKIE_DOMAIN`, `CLIENT_ORIGIN`, `OAUTH_REDIRECT_BASE_URL` with both callback URLs to register, the four OAuth values — documented as **optional**, with the half-a-pair rule — `GAME_TICKET_PRIVATE_KEY` with its two `openssl` commands and the escaped-`\n` warning, `GAME_TICKET_TTL_SECONDS`, and the five `EMAIL_*` values with the Zoho settings as the worked example | `SESSION_SECRET` and `GAME_TICKET_PRIVATE_KEY` have **no local default on purpose** (`${VAR:?…}`): a session signed with a key from a repository is a session anyone can mint. The compose file refuses to start without them. The OAuth pairs and the mail settings go the other way (`:-`): empty means off, and one empty half stops the boot |
| `backend/platform-api/src/auth/oauth.controller.ts` — `GET /auth/providers` *(added)* | The list of providers this deployment actually has: `{ providers: ['github'] }`, or `[]` | The client is static assets and cannot read the server's environment, so it has to ask. Declared **before** `@Get(':provider')`, because Nest matches in declaration order and `providers` would otherwise be read as a provider called `providers` — answering `404`, which looks exactly like an endpoint nobody wrote |
| `backend/platform-api/src/auth/provider.ts`, `auth.service.ts` *(amended)* | The provider pairs are read all-or-nothing and the half-configured case throws naming both variables; `auth.service.ts` exports `normalizeAddress` and gained the `'password'` provider | The refusal happens while the container is being built, so a typo is a line in the deploy log and not a button that fails in a player's browser |
| `backend/platform-api/src/auth/password.ts` *(new)* | `hashPassword`/`verifyPassword` on `node:crypto`'s scrypt — cost 2^15, block size 8, parallelism 1, written into the stored value — plus the length policy (12 to 128) as one function | `node:22-alpine` is musl, so argon2 would put `python3`, `make` and `g++` into the build stage and `@node-rs/argon2` would put glibc-specific packages into the lockfile. Parameters live in the stored string, so they can be raised later without a migration. `timingSafeEqual` for the comparison, and `maxmem` raised to twice what the parameters need — the default ceiling is *exactly* what they need |
| `backend/platform-api/src/auth/auth-token.ts` *(new)* | Mints a token, stores `sha256(token)` and never the token; consumes it once, refuses it after its expiry; issuing one spends the previous for the same identity and purpose | A verification link and a reset link are bearer credentials for an account, so what is written down is what can be read. 24 h for verification, 1 h for a reset |
| `backend/platform-api/src/auth/throttle.ts` *(new)* | `InMemoryFailureThrottle`: ten failures per address, a hundred per IP, in a fifteen-minute sliding window, pruned as it is read | The honest limits are in ADR 0021: a restart clears the counters, a second instance would count half, and what the per-IP counter really counts is decided by the proxy in front |
| `backend/platform-api/src/auth/password.service.ts` *(new)* | `register`, `resendVerification`, `login(input, ip)`, `verify(token)`, `forgot`, `reset(token, password)` | The create path is `AuthService.signIn`, the same call the OAuth callback makes, so a password sign-up gets the same starter squad in the same transaction and the platform has **one** account-creation path and not two. A login for an address with no account still derives a hash, so "this address has an account" cannot be read off the clock |
| `backend/platform-api/src/auth/password.controller.ts` *(new)* | Six routes under `/auth/password`: `register`, `verify/resend`, `verify`, `login`, `forgot`, `reset` | Every one carries an explicit `@HttpCode`, because Nest answers `201` to a `POST` by default and only the register-style answers are `202`. Register, resend and forgot answer identically whether or not the address exists, so none of the three is a way to ask which addresses have accounts |
| `backend/platform-api/src/email/mailer.ts`, `adapters.ts`, `mailer-from-environment.ts`, `messages.ts` *(new)* | The port (`send({ to, subject, text })`, behind the `MAILER` token), the two adapters — SMTP through `nodemailer`, and the log one that opens nothing — the choice between them, and the two messages | The environment picks the adapter: five `EMAIL_*` values and it sends, none and it logs, some and the boot stops naming every missing variable. This is § 8's rule applied to the other external credential, and it is what keeps the suite off the network — no test ever holds an SMTP password, and every E2E case reads the link out of a fake mailer |
| `backend/platform-api/src/db/entities/password-credential.entity.ts`, `auth-token.entity.ts` *(new)* | The secret behind a `password` identity (one row per identity, cascading) and the hashed single-use token with its purpose, expiry and consumption | Nothing points at a credential except the identity it belongs to, and nothing can outlive the identity |
| `backend/platform-api/src/migrations/Migration20261016160000.ts` *(new)* | The third migration, hand-written SQL: `password_credentials` and `auth_tokens`, their keys, the unique index on the token hash and the index the foreign key needs; `down()` drops both | Additive, like every migration in this delivery. It contains **no** index on `identities`, and the doc comment says why — see the divergence in § 1 |
| `docs/adr/0021-password-sign-in-with-a-verified-address.md` *(new)*, `docs/adr/README.md` | Eleven decisions: the credential on the identity, the pair as the address guard, unusable until verified, the link points at the client and the `POST` spends it, hashed single-use expiring tokens, scrypt, two mailer adapters, the in-memory throttle **and its limits**, the length-only policy, and the two 202s | The 0021 row is marked "supersedes 0018 § 1", which is the only pointer that matters: `0018` itself is untouched, because an accepted ADR is not rewritten |
| `.ia_context/plans/m4-02-auth.plan.md` § 9.7 *(new)*, `m4-04-client.plan.md` § 8, `m4-05-contact-release-privacy.plan.md` § 8 | What the implementation changed against the plan, and what § 8 and § 9 hand to the two later milestones: m4-04 owns the password form and the `/verify-email` and `/reset-password` pages the mailed links land on; m4-05 finds the mailer already built and reuses it, with `CONTACT_NOTIFY_TO` the only new mail variable | Both later plans had the mailer and the SMTP variables listed as their own work, and m4-04 had no idea the provider buttons are a list rather than a pair. Corrected where the next reader will look, rather than left to be discovered |
| `docs/adr/0018-oauth-sign-in-session-and-ticket.md` *(new)*, `docs/adr/0020-persistent-squad-and-starter-set.md` *(new)*, `docs/adr/README.md` | Eleven decisions and their consequences, and the starter-squad decision as an addendum to ADR 0003; both rows marked Accepted, and the README's 0021 row marked as superseding 0018 § 1 | The public record of what was refused and why: passwords, a server-side session store, discovery, revocation in this milestone, and how the starter set relates to permanent death. `0018` is **not** edited, which is why its § 1 still reads "there are no passwords anywhere" — that is the ADR corpus working as intended, and the README row is the way from one to the other |
| `.ia_context/plans/m4-accounts-and-persistence.index.md`, `m4-01-persistence.plan.md`, `m4-02-auth.plan.md` | m4-01 marked approved by the owner on 2026-10-16; m4-02 marked in progress with § 9.7 recording what the implementation changed; the index's ADR table now carries 0018, 0020 and 0021 as written | The index is the delivery's status, and m4-03 reads its dependencies from it. The plan amendments are corrections *the tests forced*, kept beside the decisions they correct rather than only in this description |

**Verification at the head of this branch:** `npm run typecheck` clean; `npm test -w
@eldritch-alley/platform-api` **112/112** with a database and **49 passed / 63 skipped / 0 failed**
without one; the full `npm test` **1438/1438** across the four workspaces (342 engine, 86
game-server, 112 platform-api, 898 frontend). `npm run db:migrate:check` is green against the schema
all three migrations produce — which is what proves the new entities and the hand-written SQL agree on
every column type, every index and the unique constraint, and it is the check that would have caught the
index § 9.3 wanted if the tests had not caught it first. `docker compose config` parses the amended
compose file. The escaped-PEM path was smoke-tested
against a real key (`ttl from env: 120`, `expiresAt` as expected) with a throwaway script that was
deleted afterwards.

**Not verified by anything yet — and this is the part the reviewer should weigh.** **No human has ever
completed a real GitHub or Google sign-in.** The two real providers have never been through a browser:
the route cases run against `FakeProvider`, because the real ones need registered OAuth applications,
real client secrets and network access. Everything up to and including the exchange is covered; the
two provider classes themselves — the URLs, the scopes, the shape of what GitHub's and Google's
payloads actually contain — are reasoned-through and not observed. Registering the two OAuth apps and
clicking through both flows is the first thing the pre-review asks for, and it is the one thing in
this MR that no test in the repository can stand in for.

**The same is now true of the mail, and it is the second thing to weigh.** Every case reads its link
out of `FakeMailer`, so **nothing has ever sent a real message through Zoho**: the SMTP adapter, the
port, the credentials and the shape of what arrives in a mailbox are all unobserved. The suite proves
the *link* is right — the URL is the client's, the token is in it, the token is hashed at rest and
spent by the `POST` — and it cannot prove that Zoho accepts the connection. A real verification mail is
the first item in the pre-review's mail section, next to the OAuth one.

---

### 3. Notes for the reviewer

- **The range against `develop` carries m4-01 as well.** `feat/auth` sits on top of
  `feat/persistance-foundation` (its own MR, and [its own description](./feat-persistance-foundation.description.md)),
  so `git diff develop...feat/auth` also shows the persistence foundation. Two things are on top of that
  branch. **Committed:** `181675c`, the OAuth sign-in and the session and ticket of plan § 2–§ 7.
  **In the working tree:** both amendments, § 8 (the providers are optional) and § 9 (the address and
  password), because they were applied after that commit was written. So this description covers a
  commit that exists and two that do not yet; the split is proposed at the end of the milestone. Once
  m4-01 is merged the diff here shrinks to this milestone on its own, which is how it is meant to read.
- **A stateless session is a decision this MR implements, not one it takes.** Index decision D3 — no
  `sessions` table, no Redis — means a logout cannot invalidate anything, a stolen cookie is good for
  thirty days, and there is nothing to revoke when a player deletes their account. ADR 0018
  §Consequences says so in as many words. Worth knowing before m4-05's privacy work and before the
  deletion endpoint is planned, because that endpoint is what will have to bring revocation with it.
- **The single-use `state` is process-local.** The `Map` in `OAuthController` is why this service can
  run as one instance; a second instance behind a load balancer would refuse roughly half of the
  sign-ins that started on the other one, and the fix is a shared store, not a code change. Pre-launch
  this is a non-issue and it is recorded, but it is the first thing that breaks when the platform is
  scaled out — and `docker-compose.yml` runs one, so nothing local will ever show it.
- **`GAME_TICKET_PUBLIC_KEY` does not exist in this repository yet, on purpose.** The claim shape is
  shared with m4-03 *by copy* rather than by a package, so that the match server depends on
  `platform-api` in no way at all. That means a change to the ticket's claims has to be made twice, and
  it is the one piece of contract duplication the delivery accepts. This MR is where the shape is
  frozen: `iss`, `sub`, `iat`, `exp`, EdDSA, no more.
- **The flow cookie is not cleared when the callback finishes.** It expires after ten minutes instead.
  Single use is enforced by the spent-state map, so nothing is exploitable, but a reviewer comparing
  the code to plan D4 will notice and should know it was deliberate rather than missed.
- **Two accounts, one person, if they sign in twice at the same instant through different providers.**
  The concurrent-new-pair case is a unique-constraint failure on `identities` and a `500`, not a second
  account — the safe direction. The plan accepts it; ADR 0018 §Consequences records it.
- **A GitHub account whose address is private cannot be linked to a Google one.** GitHub answers
  `email: null` in that case, and a null address always takes the new-account path. That is the
  linking rule working as designed, and it is worth a sentence to a player one day rather than a bug
  report.
- **`GET /me` is not the whole profile.** It carries no release-email preference, because m4-05 owns
  that field and will add it additively. A reviewer looking for it here should not find it.
- **`GET /auth/providers` is one endpoint and the whole of the client's half.** This MR does not touch
  the frontend: m4-04 draws the buttons, reads the list, and owns the password form and the two pages
  the mailed links land on (`/verify-email`, `/reset-password`). Both notes are written into m4-04's plan
  (§ 8) so the next milestone does not have to reverse-engineer them, and the contract a reviewer should
  hold this MR to is only that the endpoint answers the truth: a name appears if and only if that
  provider's two values are present.
- **`OAuthProviderName` is a new type, and it exists to make a wrong thing impossible to write.**
  `ProviderName` now has three members because `password` is a row in `identities`; `OAuthProviderName`
  has two, and it is what `OAUTH_PROVIDERS`, `FakeProvider` and `GET /auth/providers` are typed with. That
  is why the OAuth controller and the fake provider were touched by § 9 — the compiler, not a comment,
  is what keeps a password from becoming a provider button.
- **`ROADMAP.md` still says ADRs 0018 and 0020 are "to write".** This MR writes them, and it writes
  0021 too, and the ADR table in `ROADMAP.md` § Decisions was not touched by m4-02. It is a two-line
  correction and m4-01's description already flagged the reverse direction of the same staleness. Left
  for the author to decide whether it rides along with this MR or with m4-03.
- **A password account is now reachable by anyone who can read the mailbox, and nothing else.**
  Verification is the whole of the account-takeover boundary, so the two places it could leak are worth
  naming: the token is mailed as plaintext by necessity and stored as `sha256` (so a database dump is
  not a set of links), and a `GET` never spends it (so a scanner that prefetches the URL does not
  consume it). What is *not* protected is the mailbox itself, which is the same trust assumption every
  password reset in the world makes.
- **The throttle is the weakest part of § 9 and it is deliberately weak.** Ten failures per address and
  a hundred per IP in memory: a restart clears it, a second instance halves it, and behind a proxy that
  does not set a forwarded address the per-IP bucket is shared by everyone. ADR 0021 § Consequences
  says all of that. It is there because a login with no counter at all is worse, not because it is
  strong, and the move to Redis is m4-05's.
- **`forgot` is unthrottled, so it can be used to send mail on demand.** Only to an address that has a
  password account, one message per call, with the previous token spent by each new one — but a
  reviewer should know it is the one route in this MR with no counter behind it, and why: throttling it
  by address is a lock-out tool for anyone who knows the address, and by IP it is the shared bucket
  above.
- **The plan's § 9.3 index is gone and the plan now says so.** A reviewer who reads the plan first will
  find the partial unique index described there and then find a § 9.7 explaining that the tests refused
  it. That order is honest but it is confusing, and the ADR is the version to trust: the invariant
  lives in the pair rule and the linking rule, and it is not a constraint the schema can carry.
- **`identity.entity.ts` carries an unusually long comment where an index is not.** It is there because
  that is where a reader looks for one, and because the next person to think "surely we should enforce
  one address, one account" will otherwise try the same index and get the same failure.
