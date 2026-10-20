# Plan — m4-02 · Sign-in, session and game ticket

**Milestone:** m4-02
**Parent feature:** m4-accounts-and-persistence
**Created:** 2026-10-16
**Status:** approved (2026-10-17) — m4-01 was approved by the owner on 2026-10-16; merged in PR #27
**ADR:** [0018](../../docs/adr/0018-oauth-sign-in-session-and-ticket.md) · [0020](../../docs/adr/0020-persistent-squad-and-starter-set.md) · [0021](../../docs/adr/0021-password-sign-in-with-a-verified-address.md) (supersedes 0018 § 1, added by the § 9 amendment)

## 1. Objective

A player signs in with GitHub or Google, gets a session cookie, and every player who signs in for the
first time receives the starter squad — one Sniper, one Wizard, one Priest, all at level 1. The
platform also issues the five-minute **game ticket** that m4-03's match server verifies, so that the
match server can tell who a player is without ever seeing the session cookie.

There are no passwords anywhere in this milestone: no hashing, no reset, no verification e-mail.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `docs/adr/0018-oauth-sign-in-session-and-ticket.md` | create | OAuth only, the cookie, the ticket, the linking rule |
| `docs/adr/0020-persistent-squad-and-starter-set.md` | create | The squad, the starter set, and death and level-up deferred (links ADR 0003's addendum) |
| `docs/adr/README.md` | modify | The 0018 and 0020 rows |
| `backend/platform-api/src/db/entities/identity.entity.ts` | create | `identities` |
| `backend/platform-api/src/db/entities/agent.entity.ts` | create | `agents` |
| `backend/platform-api/src/migrations/Migration<timestamp>.ts` | create | The second migration: `identities` and `agents` |
| `backend/platform-api/src/auth/provider.ts` | create | The port: what a provider has to answer, and the `ProviderProfile` it answers with |
| `backend/platform-api/src/auth/github.provider.ts` | create | GitHub, through `openid-client` |
| `backend/platform-api/src/auth/google.provider.ts` | create | Google, through `openid-client`'s discovery |
| `backend/platform-api/src/auth/fake.provider.ts` | create | The test and development provider: no network, a profile the test chooses |
| `backend/platform-api/src/auth/oauth.controller.ts` | create | `GET /auth/:provider`, `GET /auth/:provider/callback` |
| `backend/platform-api/src/auth/auth.service.ts` | create | Find or create the user, apply the linking rule, create the starter squad |
| `backend/platform-api/src/auth/session.ts` | create | Sign, verify and clear the session cookie; the cookie options in one place |
| `backend/platform-api/src/auth/session.guard.ts` | create | The guard every session route wears |
| `backend/platform-api/src/auth/current-user.ts` | create | The decorator that hands the guard's answer to a handler |
| `backend/platform-api/src/auth/game-ticket.ts` | create | Sign the ticket; the claim shape in one file, shared with m4-03 by copy |
| `backend/platform-api/src/auth/auth.controller.ts` | create | `POST /auth/logout`, `POST /auth/game-ticket` |
| `backend/platform-api/src/me/me.controller.ts` | create | `GET /me` |
| `backend/platform-api/src/config.ts` | modify | `OAUTH_*`, `SESSION_SECRET`, `COOKIE_DOMAIN`, `CLIENT_ORIGIN`, `GAME_TICKET_PRIVATE_KEY`, `GAME_TICKET_TTL_SECONDS` |
| `backend/platform-api/src/main.ts` | modify | Cookie parsing, and CORS restricted to `CLIENT_ORIGIN` with credentials |
| `backend/platform-api/src/app.module.ts` | modify | Registers the new controllers, the providers and the guard |
| `backend/platform-api/package.json` | modify | `openid-client`, `jose`, `cookie-parser` |
| `backend/platform-api/src/auth/*.test.ts`, `src/me/me.controller.test.ts` | create | Section 4 |
| `.env.example`, `docker-compose.yml` | modify | The new variables, with the local values that work |
| `.ia_context/plans/m4-accounts-and-persistence.index.md` | modify | The milestone marked with its PR |

**Amendment, § 8 (owner's request of 2026-10-16, after the first implementation):** the four OAuth
values stop being required to run the platform, and `GET /auth/providers` tells the client which
buttons to draw. The files it touches are listed in § 8.2 and its contract is § 8.3.

## 3. Contract of the layer

**The provider port.** A provider answers two questions and nothing else:

```ts
export interface ProviderProfile {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

export interface OAuthProvider {
  readonly name: 'github' | 'google';
  /** Where the browser goes, with the PKCE challenge and the state already in it. */
  authorizationUrl(state: string, codeChallenge: string): string;
  /** The profile behind the code the provider sent back. Throws when the exchange fails. */
  exchange(code: string, codeVerifier: string): Promise<ProviderProfile>;
}
```

`email: null` is a real answer and not an error: GitHub does not expose an address when the account
keeps it private, and a profile with no address takes the new-account path.

**The linking rule** — `AuthService.signIn(profile)`:

| Situation | Result |
|---|---|
| `(provider, providerUserId)` seen before | That user. Nothing else is consulted |
| New pair, and an identity exists with `email = profile.email`, `email_verified` on **both** sides | Link the new identity to that user. The `(provider, provider_user_id)` pair is the only key that ever decides; the address only ever *adds* a way in, and only when both sides verified it |
| New pair, no match | A new user |
| New pair, an identity with the same address exists but either side is unverified | A new user |
| New pair, `email` is null | A new user |
| The user is new | `users` and the three `agents` are written in the **same transaction** |

`email_verified` is stored on every identity and never updated to a weaker value: an identity that was
verified stays verified.

**The starter squad.** Written once, on the insert path of a new user, inside the same transaction that
creates it — so a callback retried after a failure either finds the identity (and takes the sign-in
path, creating nothing) or creates both the user and its agents. There is no separate "does this user
have agents?" check, because a check that runs on every sign-in is a check that will one day run
against a user whose squad was legitimately changed.

**The session cookie.** Name `ea_session`. Its value is signed with `SESSION_SECRET` and carries
`userId`, a session id, and `issuedAt`; it is `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`,
`Domain=COOKIE_DOMAIN`, with a `Max-Age` of its own. `Secure` is dropped only when `CLIENT_ORIGIN` is
`http://localhost…`, so the local flow works without a certificate and no production build can ship
without it.

**The game ticket.** A compact JWS, **EdDSA (Ed25519)**, signed with `GAME_TICKET_PRIVATE_KEY`:

```ts
{ iss: 'eldritch-alley/platform-api', sub: <user id>, iat, exp }  // exp = iat + 300
```

`POST /auth/game-ticket` needs a session and answers `{ ticket, expiresAt }`. The match server holds
`GAME_TICKET_PUBLIC_KEY` and nothing else, so it can verify a ticket and can never issue one. The claim
set is deliberately the smallest one that identifies a player: no display name, no e-mail, no squad.

**The routes.**

| Route | Auth | Answers |
|---|---|---|
| `GET /auth/providers` (§ 8) | none | `200 { providers: ["github", "google"] }`, and `[]` when none is configured |
| `GET /auth/:provider` | none | `302` to the provider, with `state` and the PKCE challenge in a short-lived cookie |
| `GET /auth/:provider/callback` | none | `302` to `CLIENT_ORIGIN`, `Set-Cookie: ea_session=…` |
| `POST /auth/logout` | session | `204`, with the cookie cleared |
| `POST /auth/game-ticket` | session | `200 { ticket, expiresAt }` |
| `GET /me` | session | `{ user: { id, displayName, email, avatarUrl }, agents: [{ id, class, level, status }] }` |
| `POST /auth/password/register` (§ 9) | none | `202`, always the same answer: the account is created **unverified** and the mail carries the link |
| `POST /auth/password/verify` (§ 9) | none | `200` and the session cookie; `400 invalid_token` for a used, expired or unknown token |
| `POST /auth/password/verify/resend` (§ 9) | none | `202`, always the same answer |
| `POST /auth/password/login` (§ 9) | none | `200` and the session cookie; `401 invalid_credentials`, `403 email_not_verified`, `429 too_many_attempts` |
| `POST /auth/password/forgot` (§ 9) | none | `202`, always the same answer: whether the address exists is not in the answer |
| `POST /auth/password/reset` (§ 9) | none | `204`; `400 invalid_token` |

The seven password routes are `POST` on purpose, and `GET /auth/providers` is the only new `GET`:
`GET /auth/:provider` is declared last and captures anything else under `/auth/`, so a future
`GET /auth/password` would be read as a provider named `password` and answer `404`.

Errors: an unknown provider is `404`; a missing, mismatched, reused or expired `state` is `400`; a
provider that refuses the exchange is `502`, with the provider's own reason in the log and never in the
body; a route that needs a session and has none is `401`. Every error body is the same shape,
`{ code, message }`, so m4-04 can render one thing.

**What this layer does not do.** No passwords, no e-mail verification, no account deletion, no data
export, no session revocation on the server side (owner's decision D3 — the cookie is stateless, so a
logout clears it and that is all it does), no refresh token, and no reading of the release-email
preference: `GET /me` grows that field in m4-05, additively.

**Amendment — a provider that is not configured is a provider that is off (§ 8).** The whole OAuth
group is optional, `OAUTH_REDIRECT_BASE_URL` included, so a platform with no OAuth values boots and
answers every route except a sign-in. The rule is per provider and it is the same for both:

| The environment | The provider |
|---|---|
| id and secret both unset or blank | not built; `GET /auth/<name>` is `404 unknown_provider`; absent from `GET /auth/providers` |
| exactly one of the two | **the container refuses to build**, naming both variables |
| both set | built, with `${OAUTH_REDIRECT_BASE_URL}/auth/<name>/callback` as its callback |

A blank value counts as unset, because that is what `docker compose` passes for `${VAR:-}` and what a
half-filled `.env` holds. Half a pair is a typo rather than a choice, and it fails where the mistake
was made — at boot, naming both variables — instead of at the first sign-in, where it would look like
the provider's fault. `OAUTH_REDIRECT_BASE_URL` is read only when there is at least one provider to
build a callback for, and it is `readRequired` at that point: a configured provider with no base is
the same typo and gets the same refusal.

## 4. Tests planned

**Unit — the linking rule (`auth.service.test.ts`, against the PostgreSQL of CI)**
- [ ] A `(provider, provider_user_id)` pair seen before signs in to the same user, whatever the address
      it now reports: the pair is the key.
- [ ] A second provider with the **same verified** address links to the existing user, and that user
      gains a second identity and **no** second squad.
- [ ] The same address on the new side but unverified on the old side creates a new user.
- [ ] The same address verified on the old side but unverified on the new side creates a new user.
- [ ] A profile with `email: null` creates a new user and never links.
- [ ] Two different people whose providers report the same unverified address end up as two users.
      This is the account-takeover case, and it is the one the spec calls out.
- [ ] Two addresses that differ in case only are the same address, so they link. An address's domain is
      case-insensitive, and the comparison is written that way once and pinned here.

**Unit — the starter squad (`auth.service.test.ts`)**
- [ ] The first sign-in creates exactly three agents: `sniper`, `wizard`, `priest`, level 1, `active`.
- [ ] A second sign-in creates none, and the three keep their ids.
- [ ] A new user created by linking also gets the squad.
- [ ] A callback that fails after the user insert leaves neither a user nor agents (the transaction),
      and a retry of the same callback creates both once.

**Unit — the session (`session.test.ts`)**
- [ ] A cookie signed by `SESSION_SECRET` verifies and carries the user id.
- [ ] A cookie with one character changed is refused.
- [ ] A cookie signed with another secret is refused.
- [ ] An expired cookie is refused.
- [ ] The cookie the service sets carries `HttpOnly`, `SameSite=Lax`, `Path=/`, `Domain` from the
      configuration, and `Secure` whenever `CLIENT_ORIGIN` is not a localhost origin.

**Unit — the ticket (`game-ticket.test.ts`)**
- [ ] The ticket verifies with the public key of the pair and carries `sub`, `iss`, `iat`, `exp`.
- [ ] `exp` is `iat + GAME_TICKET_TTL_SECONDS` (300 by default).
- [ ] A ticket signed with a different private key is refused by the public key.
- [ ] TTL is read from the environment and a bad value stops the service at boot.

**E2E — the routes (`oauth.controller.test.ts`, `auth.controller.test.ts`, `me.controller.test.ts`)**
- [ ] `GET /auth/github` answers `302` to `github.com/login/oauth/authorize` with a `code_challenge` of
      the S256 method, a `state`, and the matching cookies set.
- [ ] A callback with a `state` that does not match the cookie is `400` and creates no user.
- [ ] A callback with a replayed (already used) `state` is `400`.
- [ ] A successful callback with the fake provider is `302` to `CLIENT_ORIGIN` and sets `ea_session`.
- [ ] A provider that refuses the exchange is `502`, and the response body does not carry the
      provider's message.
- [ ] `POST /auth/game-ticket` without a session is `401`; with one, `200` and a ticket that verifies
      with the public key.
- [ ] `POST /auth/logout` is `204` and clears the cookie, and the same cookie sent afterwards is `401`.
- [ ] `GET /me` without a session is `401`; with one, it carries the profile and the three agents.
- [ ] `GET /me` never returns another user's agents (two users, one request each).
- [ ] An unknown provider (`GET /auth/gitlab`) is `404`.
- [ ] CORS: a preflight from `CLIENT_ORIGIN` is allowed with credentials; one from any other origin is
      not.

**Unit — the optional providers (§ 8, `provider.test.ts`, new)**
- [ ] No OAuth value at all builds an empty set and does not throw.
- [ ] A pair set to `''` — what `docker compose` passes for `${VAR:-}` — counts as unset, and so does a
      pair of spaces.
- [ ] Only the GitHub pair builds only GitHub; only the Google pair builds only Google.
- [ ] An id with no secret throws, and the message names **both** variables. The secret with no id is
      the same case mirrored.
- [ ] With a pair set, the authorization redirect URI is `${OAUTH_REDIRECT_BASE_URL}/auth/<name>/callback`.
- [ ] A pair set with `OAUTH_REDIRECT_BASE_URL` missing or blank throws, naming the base variable.
- [ ] No provider and no base does **not** throw: the base is only read when there is a callback to build.

**Unit — `readOptional` (`config.test.ts`)**
- [ ] `readOptional` answers `undefined` for unset, for `''` and for whitespace, and the trimmed value
      otherwise.
- [ ] The container builds with none of the four OAuth values set and with `OAUTH_REDIRECT_BASE_URL`
      unset: the existing boot cases cover `DATABASE_URL`, `SESSION_SECRET` and the ticket TTL, and
      none of them is relaxed by this change.

**E2E — `GET /auth/providers` (`oauth.controller.test.ts`)**
- [ ] Both configured → `200 { providers: ['github', 'google'] }`, in that order.
- [ ] One configured → `['github']`, and `['google']` when it is the other one.
- [ ] None configured → `200 { providers: [] }`, and the platform still answers `/health`, `/me`
      (`401`) and `POST /auth/game-ticket` (`401`): it is up, it just cannot sign anyone in.
- [ ] `GET /auth/github` with no provider configured → `404 unknown_provider`, and no user, identity or
      agent is written.
- [ ] `GET /auth/providers` is answered by its own route and not swallowed by `GET /auth/:provider`:
      the `200` above is the assertion, and it fails if the two routes are declared in the wrong order.
- [ ] The existing `/auth/gitlab` → `404` case still holds with one provider configured and with none.

**Test support.** `setAuthEnvironment` gains a way to leave the four OAuth values out, and it must
**delete** them rather than skip setting them: `process.env` is shared by every case in a file, so a
value left behind by an earlier case is exactly how this rule would be tested wrongly and still pass.

**Unit — the password (§ 9, `password.test.ts`, new)**
- [ ] The same password hashed twice gives two different stored values, because the salt is per hash.
- [ ] A stored password verifies against its own and not against another.
- [ ] The stored value carries its parameters, so a hash written with yesterday's parameters still
      verifies after they change — the reason a bare digest is not enough.
- [ ] A password below the minimum is refused with the limit in the message, and one above the maximum
      is refused too: the maximum is what stops a login from being an expensive way to spend our CPU.

**Unit — the mailer (§ 9, `mailer.test.ts`, new)**
- [ ] No `EMAIL_*` value builds the adapter that writes to the log and opens no connection.
- [ ] A complete set builds the SMTP adapter.
- [ ] Half a set stops the boot, naming both variables — the rule § 8 gave the providers.
- [ ] The message carries the recipient, the subject and a body with the link.

**Unit — the tokens (§ 9, `auth-token.test.ts`, new)**
- [ ] The row holds a hash and never the value that was mailed.
- [ ] A consumed token is refused a second time; an expired one is refused.
- [ ] A token of the wrong purpose is refused: a reset token cannot verify an address.
- [ ] Issuing a new token for the same identity and purpose spends the previous one, rather than leaving
      two live links in two mailboxes.

**E2E — the password routes (§ 9, `password.controller.test.ts`, new)**
- [ ] `register` with a new address → `202`, one user, one `password` identity, three agents,
      `email_verified` false, and exactly one message in the fake mailer.
- [ ] `register` with an address whose identity is **already verified** → the same `202`, the same body,
      **no** second user and **no** second squad: the answer says nothing about whether the address was
      taken.
- [ ] `register` again for an address that is registered but unverified → `202` and a fresh link.
- [ ] `login` before verifying → `403 email_not_verified`, and no cookie is set.
- [ ] `verify` with the mailed token → `200` and `ea_session`, and the identity is verified only then.
- [ ] `verify` with the same token again → `400 invalid_token`.
- [ ] `login` with the right password → `200`, and the cookie is one `/me` accepts.
- [ ] The wrong password and an unknown address answer the same `401 invalid_credentials`, and the
      unknown address still costs one hash — an address that answers faster is an address oracle.
- [ ] Past the failure limit for one address, the correct password is `429` as well, and the window
      closing restores it; a successful login clears the count.
- [ ] `forgot` for a known and for an unknown address → the same `202` and the same body, and only the
      known one produces a message.
- [ ] `reset` → `204`, the new password signs in, the old one is refused, and every token for that
      identity is spent.
- [ ] **The case § 9 exists to close:** register with a password, verify, then sign in with Google
      reporting the same verified address → **one** user, two identities, **three** agents and not six,
      and `/me` answers the same user id both ways.
- [ ] `GET /auth/providers` still reports only `github` and `google`: `password` is never a provider.

## 5. Dependencies

- **m4-01 approved**: the `EntityManager`, the migration runner and the entities base.
- **Rename of the two entities' tables** is this milestone's own migration; nothing in m4-01 has to
  change.
- **External, needed before the manual run and not before the tests:** a GitHub OAuth app and a Google
  OAuth client, with `http://localhost:3000/auth/{provider}/callback` and the production callback
  registered. The automated tests use the fake provider and need neither.
- **A key pair for the ticket** has to exist before the milestone can be run end to end. The plan
  generates one with `openssl` and records the command in `.env.example`; the private key stays out of
  the repository, as `CLAUDE.md` requires.
- **§ 9 only — an SMTP account**, which the owner has (Zoho). It is *not* needed to run the project: the
  mailer falls back to writing the message to the log when the settings are absent (D14), so the tests
  and `npm run dev` need no credentials and never touch the network. The five `EMAIL_*` values are
  needed before a real person can receive a verification or reset mail.

## 6. Out of scope

- Account deletion and data export. The privacy policy says both are handled by e-mail request in this
  delivery, and the spec states no endpoint is needed.
- Revoking a session on the server side. The cookie is stateless by the owner's decision D3. When the
  deletion endpoint arrives, it brings the revocation with it — and that ADR is where the consequence
  is written down.
- Roles, permissions and an admin surface. There is one kind of user.
- Creating agents after the starter set, and any change to an agent's level or status: death and
  progression are deferred (ADR 0020).
- The release-email preference and the privacy pages (m4-05), and every client screen (m4-04).
- **§ 8:** a development sign-in provider that lets anyone in without a provider behind it. It was
  considered as the answer to "the platform has no OAuth apps yet" and refused: it is a way into an
  arbitrary account guarded by one environment variable, and it is a second path through `AuthService`
  that only ever runs where nobody is watching. `FakeProvider` stays test-only.
- **§ 9:** changing an account's address, adding a password to an account that was created by OAuth,
  removing a password, and revoking a session on a password change. Each is a route of its own and none
  is needed for the flow to be complete.
- **§ 9:** a shared store for the brute-force counter and for the spent tokens. The counter is in memory
  (D15) and the tokens are in PostgreSQL, so the platform stays one process with no new infrastructure —
  the same trade the flow's `state` already makes. m4-05's Redis is where the counter moves when the
  platform is scaled out, and the ADR names it.

## 7. Decisions

**D1 · `openid-client` over a provider-per-package stack.** The spec leaves the library to the planner.
`openid-client` is certified by the OpenID Foundation, implements the authorization code flow with PKCE
and `state` for us, and covers Google through discovery with no code of our own. GitHub is not an OIDC
provider, so it is configured by hand against the same library — one interface, two configurations, and
the PKCE and `state` handling written once. The alternative (`@nestjs/passport` with
`passport-github2` and `passport-google-oauth20`) is more idiomatic Nest and brings two libraries whose
PKCE support has to be checked per provider, plus a third for the strategies' typing; the alternative of
hand-rolling the two flows is the only one that avoids a dependency, and it means owning the state
cookie, the PKCE verifier, the token exchange and the error mapping ourselves — the part of OAuth that
is worth not writing.

**D2 · `jose` for the cookie and the ticket.** One library signs the session cookie and the EdDSA ticket,
with no transitive dependency and with the algorithm named at the call site. `jsonwebtoken` would work
and is more familiar, but it carries its own JWT ideas into the cookie, which is not a JWT.

**D3 · EdDSA rather than RS256.** The owner's spec allows either. Ed25519 gives a 32-byte key and a
64-byte signature, and the whole flow is one algorithm in one library, so the "which key is this"
question never comes up. RS256 stays the fallback if a future consumer of the ticket cannot do EdDSA —
and since the only consumer is our own match server, that is not a risk worth carrying today.

**D4 · The `state` lives in a cookie, not in a server-side store.** The flow has no session yet, so the
state and the PKCE verifier have to live somewhere between the two requests. A short-lived, `HttpOnly`,
`SameSite=Lax` cookie is the smallest thing that works with no new infrastructure, and it is single-use:
the callback clears it, so a replayed `state` finds nothing to match.

**D5 · What `GET /me` returns, and the shape of an answer.** The profile and the squad, and nothing
else; the release-email preference joins it in m4-05. The agents come back as their stored fields
(`class`, `level`, `status`) and never as computed stats: the platform does not know what a sniper's
range is, and the client is told what to draw by the match server when the match starts.

**D6 · `Secure` keyed on the origin, not on `NODE_ENV`.** A build that runs locally over HTTP with
`NODE_ENV=production` still has to work, and a build that faces the internet is exactly the one whose
`CLIENT_ORIGIN` is an `https://` origin. Reading the origin is one rule for both, and the alternative —
trusting the environment name — is a rule that can be wrong in the direction that matters.

## 8. Amendment — the providers are optional (owner, 2026-10-16)

### 8.1 What changes and why

The four OAuth values were required: `oauthProvidersFromEnvironment` read each one with `readRequired`,
so a container without them did not finish booting. The owner's request is the opposite — a provider
that is not configured is a provider whose button does not exist, and the project still runs without it.

m4-02's own § 5 already called the two OAuth apps *"external, needed before the manual run and not
before the tests"*. The code was stricter than the plan meant it to be, and this brings it back in
line. Two consequences are worth naming. A platform with no OAuth values boots and answers every route
except a sign-in: that is the state a person cloning the repository lands in, and the state CI runs in.
And from § 9 onwards it is no longer "nobody can sign in" — it is "nobody can sign in *with OAuth*".

This is a deployment convention rather than an architecture decision, so it gets no ADR of its own: the
one sentence that matters — which credentials are optional and which are not — is written in ADR 0021's
context, which § 9 writes anyway.

### 8.2 Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `backend/platform-api/src/auth/provider.ts` | modify | `OAuthProviders` becomes partial; the environment builds only the configured providers, and a half-set pair throws naming both variables |
| `backend/platform-api/src/config.ts` | modify | `readOptional` — the third reader beside `readRequired` and `readPort` |
| `backend/platform-api/src/auth/oauth.controller.ts` | modify | `GET /auth/providers`, declared **before** `@Get(':provider')` |
| `backend/platform-api/src/auth/provider.test.ts` | create | The seven unit cases in § 4 |
| `backend/platform-api/src/auth/oauth.controller.test.ts`, `src/config.test.ts` | modify | The new cases in § 4 |
| `backend/platform-api/src/auth/test-app.ts` | modify | `setAuthEnvironment` can leave the OAuth values out, and **deletes** them when it does |
| `.env.example`, `docker-compose.yml` | modify | The four values documented as optional; the four `:?` become `:-` |
| `.ia_context/plans/m4-04-client.plan.md` | modify | A note, not a design change: the title screen reads `GET /auth/providers` and draws one button per name |

`SESSION_SECRET` and `GAME_TICKET_PRIVATE_KEY` keep their `:?` in `docker-compose.yml`. They are not
optional: a session signed with a key from a repository is a session anyone can mint, and an
unattended deployment with no signing key is not a smaller deployment, it is a broken one.

### 8.3 Contract

`OAuthProviders` becomes `Partial<Record<ProviderName, OAuthProvider>>`, which is the whole type change:
the controller's `provider(name)` already answers `404` for an absent one, because it looks the name up
with `Object.hasOwn` before it reads it. A blank value counts as unset, which is what `docker compose`
passes for `${VAR:-}` and what a half-filled `.env` holds. The rule and the route are in § 3.

`OAUTH_REDIRECT_BASE_URL` becomes conditional rather than required: it is read only when there is at
least one provider to build a callback for, and it is `readRequired` at that point.

### 8.4 Tests

In § 4, under *the optional providers* and *`readOptional`*.

### 8.5 Decisions

**D7 · A provider with no credentials is off; a provider with half its credentials stops the boot.**
The two halves of a credential are never deliberately split, so a pair with one side set is a typo
rather than a configuration — and it is the one kind of mistake that would otherwise surface as a
provider's own error at the first sign-in, pointing at GitHub for something GitHub did not do. Failing
where the mistake was made, naming both variables, is worth more than the convenience of starting up.
The alternative — treating a half pair as "off" — hides it until someone cannot sign in.

**D8 · The client asks which providers exist, rather than being told at build time.** The frontend is
published as static assets (CLAUDE.md § Structure), so it cannot read the server's environment, and
baking the list into the build would make one frontend build per deployment. `GET /auth/providers`
answers the question at run time, in the fixed order of `PROVIDER_NAMES` so the buttons do not move
between two boots of a different configuration. It is declared before `@Get(':provider')` because Nest
matches routes in declaration order and `providers` would otherwise be read as a provider named
`providers` — which answers `404`, and looks exactly like "the endpoint was never added".

### 8.6 Out of scope

In § 6.

## 9. Amendment — entering with an address and a password (owner, 2026-10-16)

### 9.1 What changes and why

The owner asked for the route that ADR 0018 § 1 ruled out — *"There are no passwords anywhere in the
platform"* — and asked for it complete: sign up, sign in, verify the address and reset the password.
This supersedes decision 1 of ADR 0018 and nothing else in it: the session cookie, the ticket, the
linking rule and the error shape are untouched, and `GET /me` and the starter squad are reused rather
than reimplemented. A new ADR 0021 records it; 0018 stays as it is, because an accepted ADR is not
rewritten (`docs/adr/README.md`).

The reason 0018 gave for refusing passwords was not that they are insecure, it was that they bring
hashing, reset, verification mail and a breach to answer for, *"none of which this delivery has an
owner for"*. The owner has now taken that on, with an SMTP account (Zoho) behind it. The three pieces
that follow from it and are not obvious:

- **An address a provider verified and an address we verified are the same fact, and only in that
  order.** A password account is unusable until the address is verified (D11), so a password identity
  only ever reaches `email_verified = true` through a link that arrived in that mailbox. At that point
  the existing linking rule — the one written for GitHub and Google — already does the right thing in
  both directions, with no merging of accounts anywhere: sign in with Google afterwards and the sign-in
  lands on the account that already has the squad. This is the case § 9 exists to close, and the last
  E2E case in § 4 is the one that proves it.
- **The link in the mail goes to the client, and the token is spent by a `POST`.** A `GET` that consumes
  a token is consumed by the first machine that reads the mailbox: corporate mail scanners prefetch
  every link in a message, and the player then finds their own link already spent. The mail points at
  `${CLIENT_ORIGIN}/…?token=…`, the page asks for a click, and the click is the `POST`.
- **The mail is real from the first commit, with a fallback rather than a requirement.** The mailer
  picks its adapter from the environment (D14), so the tests and `npm run dev` need no credentials and
  never open a socket, while a deployment that has the five `EMAIL_*` values sends through Zoho.

### 9.2 Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `docs/adr/0021-password-sign-in-with-a-verified-address.md` | create | Supersedes 0018 § 1: what a password account is, when it verifies, and what stays as it was |
| `docs/adr/README.md` | modify | The 0021 row, marked as superseding part of 0018 |
| `backend/platform-api/src/migrations/Migration<timestamp>.ts` | create | The third migration: `password_credentials` and `auth_tokens` (the index this row first listed was dropped — see § 9.7) |
| `backend/platform-api/src/db/entities/password-credential.entity.ts` | create | `password_credentials` — the secret behind a `password` identity, one row per identity |
| `backend/platform-api/src/db/entities/auth-token.entity.ts` | create | `auth_tokens` — the hashed single-use token, its purpose and its expiry |
| `backend/platform-api/src/db/entities/identity.entity.ts` | modify | `ProviderName` gains `password`, and the linking rule's index is declared here rather than left to the migration (see § 9.7) |
| `backend/platform-api/src/auth/password.ts` | create | Hash and verify with `node:crypto`'s scrypt, and the one place the length policy is written |
| `backend/platform-api/src/auth/auth-token.ts` | create | Mint, store hashed, consume, expire; the two purposes; issuing one spends the previous |
| `backend/platform-api/src/auth/throttle.ts` | create | The in-memory per-address and per-IP failure counter shared by login and reset |
| `backend/platform-api/src/auth/password.service.ts` | create | Register, verify, login, forgot, reset — and the reuse of `AuthService`'s create path so a password account gets the same starter squad in the same transaction |
| `backend/platform-api/src/auth/password.controller.ts` | create | The seven routes in § 3 |
| `backend/platform-api/src/email/mailer.ts` | create | The port: `send(message)`, and the `MAILER` token the rest of the code depends on |
| `backend/platform-api/src/email/adapters.ts` | create | Both adapters in one file: the one that reaches the mail server through `nodemailer`, and the one that writes the message to the log and opens nothing |
| `backend/platform-api/src/email/mailer-from-environment.ts` | create | The choice between the two, and the all-or-nothing rule over the five values |
| `backend/platform-api/src/email/messages.ts` | create | The verification and reset messages: subject, body and the link the client will receive |
| `backend/platform-api/src/config.ts` | modify | `readOptional`, and the SMTP port reader |
| `backend/platform-api/src/app.module.ts` | modify | The controller, the service, the mailer and the token providers |
| `backend/platform-api/package.json` | modify | `nodemailer`, and `@types/nodemailer` in dev |
| `backend/platform-api/src/auth/test-app.ts` | modify | The fake mailer the E2E cases read the link out of, and the throttle reset between cases |
| `backend/platform-api/src/auth/*.test.ts`, `src/email/*.test.ts` | create | § 4 |
| `.env.example`, `docker-compose.yml` | modify | The five `EMAIL_*` values, documented as optional, with the Zoho settings as the worked example |
| `.ia_context/plans/m4-04-client.plan.md` | modify | The form and the two pages the links land on, which is m4-04's work and not this milestone's |
| `.ia_context/plans/m4-05-contact-release-privacy.plan.md` | modify | The mailer and `EMAIL_FROM` already exist and are reused; only `CONTACT_NOTIFY_TO` and the release mail are new |

**No change to `backend/engine`, to `game-server`, or to the session, the ticket or `GET /me`.** A
password sign-in ends in the same `signSession` call the callback ends in, so everything downstream of
the cookie is the code that is already reviewed and green.

### 9.3 Contract

A registration is `{ email, password, displayName? }`; `displayName` defaults to the part of the
address before the `@`, because `users.display_name` has no null (`user.entity.ts`) and a password
sign-up has no provider to ask. A login is `{ email, password }`; a verify and a reset are `{ token }`
plus, for the reset, `{ password }`. The policy is length only — at least 12 characters and at most
128, no composition rule — because length is the one requirement that buys anything and the maximum is
what stops a login from being an expensive way to spend the platform's CPU.

The password identity is `provider: 'password'` with the **lowercased address as its
`provider_user_id`**, which is what makes the unique constraint m4-02 already has — `(provider,
provider_user_id)` — the guard that stops two registrations for one address. The credential lives in
`password_credentials`, one row per identity, and the identity is what everything else already points
at, so `GET /me`, the squad and the linking rule need no new case.

The invariant the schema gained is that **one address can be verified for one account**: a partial
unique index on `(lower(email), user_id) where email_verified`. It is deliberately per user and not
global — two verified identities on the same account is exactly the linked GitHub-and-Google case that
already works, and a global unique index would have broken it.

Errors follow the shape in § 3: `invalid_credentials` (`401`), `email_not_verified` (`403`),
`too_many_attempts` (`429`), `invalid_token` (`400`), and a bad body `400`. Register, resend and forgot
always answer `202` with the same body whether or not the address exists, so the endpoint is not a way
to ask which addresses have accounts. Verification and reset spend the token and answer `200` and `204`.

### 9.4 Tests

In § 4, under *the password*, *the mailer*, *the tokens* and *the password routes*.

### 9.5 Decisions

**D9 · `node:crypto`'s scrypt, not argon2.** The runtime image is `node:22-alpine` (`backend/Dockerfile`),
which is musl: `argon2` would put `python3`, `make` and `g++` into the build stage, and
`@node-rs/argon2` would put platform-specific optional packages into a lockfile that is resolved on
glibc. scrypt is memory-hard, in the standard library, is a dependency nobody has to keep patched, and
`timingSafeEqual` is beside it. Argon2id is the better password hash on the merits; it is not better by
enough to justify a native build in this image, and this is the trade the project already made when it
chose `jose` over a larger stack.

**D10 · The credential hangs off the identity, and the address is its `provider_user_id`.** One table
for "ways in" (`identities`), one row for the secret behind one kind of way in
(`password_credentials`). The alternative — a `password_hash` column on `users` — would need a second
uniqueness rule beside the one the linking rule already relies on, and would make "an account with a
password and no identity" representable. Reusing the address as the pair's second half costs nothing
and gets the `(provider, provider_user_id)` unique constraint to enforce one password account per
address for free.

**D11 · A password account does nothing until the address is verified, and the linking rule is what
makes that safe.** Registration writes the user, the identity and the three agents, exactly as the
OAuth create path does, and the account is refused at login until a link that arrived in that mailbox
has been followed. The alternative — letting an unverified account sign in — is the account-takeover
case: anyone could register with somebody else's address, and the moment the real owner signed in with
Google, the linking rule would have needed a rule that does not exist to tell the two apart. With
verification first, the existing both-sides-verified rule closes it, and no account ever has to be
merged into another.

**D12 · The mail's link points at the client and the token is spent by a `POST`.** A single-use token
spent by a `GET` is spent by whichever machine fetches the link first, and mail scanners, link
previews and antivirus proxies fetch every link in every message. The cost is one extra page and one
click; the alternative is a player whose verification link was already used by something they cannot
see, and a support request with no explanation in it.

**D13 · Tokens are stored hashed, single use, and expiring.** The token is a bearer credential for an
account, so the database holds `sha256(token)` and never the value that was mailed — the same reasoning
the spec applies to storing a hash of the contact form's IP and never the IP. Verification is worth 24
hours and a reset 1 hour: long enough for a mailbox that is checked daily, short enough that a mailbox
read a year from now is not a way in. Issuing a token spends the previous one for that identity and
purpose.

**D14 · The mailer has two adapters and the environment picks one.** With the five `EMAIL_*` values the
platform sends through Zoho; without them it writes the message to the log and sends nothing. This is
§ 8's rule applied to the other external credential: an account on a third party's server must not be
the reason `npm test` fails or a contributor cannot boot the project. It is also what keeps the suite
off the network — the E2E cases read the link out of a fake mailer, and no test ever holds an SMTP
password. Half a set stops the boot, naming both variables, for § 8's reason: a half-configured mailer
is a typo, and a typo that silently swallows a password reset is worse than one that stops a container.

**D15 · Brute force is limited in memory, and the ADR says so.** A per-address and per-IP counter with a
sliding window, in the process, alongside the flow's spent-`state` map — the platform is one process and
this milestone adds no infrastructure. The honest limit: a restart clears the counters, and a second
instance would count half of the attempts. Both are recorded in ADR 0021 as consequences rather than
discovered later, and m4-05's Redis is where the counter moves when the platform is scaled out.

### 9.6 Out of scope

In § 6.

### 9.7 Amendment — what the implementation changed (2026-10-16)

Written after the fact, so that the plan and the code tell the same story. Every item below is also in
ADR 0021; none of them reopens a decision of § 9.5.

- **The partial unique index of § 9.3 was dropped, and it was dropped because it was wrong.** The plan
  asked for `unique (lower(email), user_id) where email_verified` on `identities`. The suite refused it
  twice: a linked account holding a verified GitHub identity and a verified Google one — the state the
  linking rule exists to produce — violates a per-user index, and a global one refuses it twice over. A
  `provider = 'password'` filter would only restate D10. What holds "one address, one verified account"
  is D10's pair plus the linking rule, and `identity.entity.ts` says so where a reader would look for the
  index. `migrate:check` is clean without it.
- **§ 3 says seven routes and the table lists six.** Six is what § 9 needs: register, resend, verify,
  login, forgot, reset. Nothing was left out.
- **`forgot` is not throttled** (D15 said the counter would be shared by login and reset). Throttling it
  by address would let anyone lock a player out of their own reset by guessing their address, and by IP
  it is the counter that shares one bucket behind a proxy. The throttle guards failed sign-ins only.
- **The OAuth side was touched outside § 9.2's list.** `ProviderName` gained `password`, which forced
  `fake.provider.ts` and `oauth.controller.ts` onto `OAuthProviderName` — the type-level statement that a
  password is a row in `identities` and never a button. `auth.service.ts` gained `export` on
  `normalizeAddress`, so the password lookup and the linking rule spell an address the same way.
- **`email/smtp.mailer.ts` and `email/log.mailer.ts` are one file, `email/adapters.ts`.** Two classes of
  four lines each do not need two modules.
- **`docs/adr/0021-…md` also records two consequences the plan did not foresee**: no way to remove or
  change a password yet, and the `forgot` gap above.
- **`test-app.ts` resets nothing for the throttle.** Each E2E case that provokes failures starts its own
  application instead, so the counters never cross a case boundary; a reset hook would be a hook every
  future case would have to remember not to rely on.
