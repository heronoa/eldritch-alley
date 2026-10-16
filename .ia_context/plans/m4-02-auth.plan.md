# Plan — m4-02 · Sign-in, session and game ticket

**Milestone:** m4-02
**Parent feature:** m4-accounts-and-persistence
**Created:** 2026-10-16
**Status:** in progress (2026-10-16) — m4-01 was approved by the owner the same day
**ADR:** 0018 · Sign-in with GitHub and Google only (to write) · 0020 · A persistent squad with a starter set (to write)

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
| `GET /auth/:provider` | none | `302` to the provider, with `state` and the PKCE challenge in a short-lived cookie |
| `GET /auth/:provider/callback` | none | `302` to `CLIENT_ORIGIN`, `Set-Cookie: ea_session=…` |
| `POST /auth/logout` | session | `204`, with the cookie cleared |
| `POST /auth/game-ticket` | session | `200 { ticket, expiresAt }` |
| `GET /me` | session | `{ user: { id, displayName, email, avatarUrl }, agents: [{ id, class, level, status }] }` |

Errors: an unknown provider is `404`; a missing, mismatched, reused or expired `state` is `400`; a
provider that refuses the exchange is `502`, with the provider's own reason in the log and never in the
body; a route that needs a session and has none is `401`. Every error body is the same shape,
`{ code, message }`, so m4-04 can render one thing.

**What this layer does not do.** No passwords, no e-mail verification, no account deletion, no data
export, no session revocation on the server side (owner's decision D3 — the cookie is stateless, so a
logout clears it and that is all it does), no refresh token, and no reading of the release-email
preference: `GET /me` grows that field in m4-05, additively.

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
