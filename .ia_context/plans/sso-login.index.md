# Index — SSO through Keycloak and self-service account deletion

**Created:** 2026-10-17
**Roadmap:** [ROADMAP.md](../../ROADMAP.md) § M4. Accounts and persistence
**Spec:** [sso.login.input.md](../inputs/sso.login.input.md)
**Branches:** `feat/keycloak-provider` (m1), `feat/account-deletion` (m2), `feat/client-sso` (m3–m5)
**Status:** delivered (2026-10-17) — milestones 0–5 approved; closed on the owner's smoke test

## What this delivery covers

An **optional** Keycloak in front of sign-in. It brokers Google and GitHub: one button, one integration,
and the same account no matter which upstream provider the player chose. **Each provider stands on its
own**: every button the backend is configured for appears on the title, and Keycloak being on or off
changes nothing about the direct Google and GitHub buttons. A deployment that configures only Keycloak
gets only that button; a deployment that configures only the direct pairs behaves exactly as it does
today. The environment is the feature flag.

Sign-in stays the server-side OAuth code flow with PKCE and the `ea_session` cookie (ADR 0018). No token
reaches the client, nothing is kept in `sessionStorage`, and no route learns to read an `Authorization`
header.

The delivery also gives the account an exit of its own: `DELETE /auth/account` erases the account and
everything that hangs off it, revokes the session on every device, mails a confirmation, and returns the
player to the title as a guest. The account dialog gains the security card where that happens.

The smoke test that closed the delivery (2026-10-17) found the mail written only in English. The platform
now writes it in the player's language — pt-BR or en-US — chosen by `Accept-Language` on every request
and by the `locale` query on the OAuth start, which carries it through the signed flow cookie to the
callback. No column and no migration: the browser holds the choice.

## Milestones

### Backend

| # | Plan | Status | PR |
|---|------|--------|----|
| 0 | Index correction (see the gate below) | [x] done (2026-10-17) | — |
| 1 | [sso-login-m1-keycloak-provider.plan.md](./sso-login-m1-keycloak-provider.plan.md) | [x] approved (2026-10-17) | — |
| 2 | [sso-login-m2-account-deletion.plan.md](./sso-login-m2-account-deletion.plan.md) | [x] approved (2026-10-17) | — |

### Frontend

| # | Plan | Status | PR |
|---|------|--------|----|
| 3 | [sso-login-m3-logic.plan.md](./sso-login-m3-logic.plan.md) | [x] approved (2026-10-17) | — |
| 4 | [sso-login-m4-integration.plan.md](./sso-login-m4-integration.plan.md) | [x] approved (2026-10-17) | — |
| 5 | [sso-login-m5-design.plan.md](./sso-login-m5-design.plan.md) | [x] approved (2026-10-17) | — |

Milestone 0 is a documentation commit and not a milestone of its own, as m4-01's index correction was.
Milestones 1–2 are backend vertical slices: there is no repository layer to add, because the schema
already carries what both need. Milestones 3–5 follow the workflow's order — logic → integration →
design — and each depends on the one before it.

The owner opted, in practice, for **one branch per backend milestone** — `feat/keycloak-provider` for m1
and `feat/account-deletion` for m2 — each ready as its own pull request. The three frontend milestones
share `feat/client-sso`, because logic, integration and design land together on the client. The PR
column is filled when one opens.

## Milestone gate, checked on 2026-10-17

The gate is run against the repository, not against the indexes, because the indexes are the thing that
is out of date.

| Milestone | Index says | Repository says | Verdict |
|---|---|---|---|
| m4-01 · persistence | `[x] approved (2026-10-16)` | merged in PR #26 (`a2214b7`) | delivered |
| m4-02 · auth | `[~] in progress` | merged in PR #27 (`3e3e36d`); `feat/sso-login` is cut from the merge commit | delivered, index stale |
| m4-03 · match recording | `[x] delivered (2026-10-16)` | commits carried into PR #27 | delivered, index stale |
| m4-04 · client | `[x] delivered (2026-10-17)` | merged in PR #28 (`850381d`) | delivered, index stale |
| m4-05 · contact, release, privacy | `[ ] pending` | not started | pending, not blocking |

**Milestone 0 closed the staleness on 2026-10-17**, before anything else lands:
`.ia_context/plans/m4-accounts-and-persistence.index.md` marks m4-02 and m4-03 as approved in PR #27 and
m4-04 as approved in PR #28, and the three plan headers say the same. It touches no code and can be
lifted into a commit or a PR of its own if the review wants `CLAUDE.md` rule 5 kept strictly.

## Decisions taken (owner, 2026-10-17)

| # | Question | Answer |
|---|---|---|
| D1 | Where the Keycloak dance runs | **Server-side, as one more `OAuthProvider`**, behind the existing flow and the `ea_session` cookie. No SPA PKCE, no `oidc-client-ts`, no local JWT, no `/auth/sso/exchange`, no `JwtAuthGuard` |
| D2 | What happens to the direct providers | **Independent of Keycloak.** Every provider configured in the backend appears in the frontend, and each stands on its own: configuring a realm does not hide the Google and GitHub buttons, and dropping it does not touch them. The environment is the feature flag — a provider is a button exactly when its variables are set |
| D3 | Provider identifiers | `github`, `google` and `keycloak` are the values of `identities.provider` and of `GET /auth/providers`. `password` remains a way in and never a button (ADR 0021). **No new per-provider columns and no migration**: `identities` already holds the provider id, the address and its verification, one row per way in |
| D4 | Linking rule | The existing rule stands: the `(provider, provider_user_id)` pair first, then an address verified **on both sides**. The input's "find the user by address" was not adopted — `users.email` is nullable and not unique. An unverified password account still refuses the link |
| D5 | Account deletion | One cascading delete of the user; the session is revoked by making every user-scoped route check that the account still exists; a match that ends after the account is gone is dropped instead of retrying forever |
| D6 | Where the security screen lives | A **card in the existing account dialog**, opened from the profile card. No `/settings/security` route: the client has no router and the card pattern is the approved one |
| D7 | Plan and PR shape | This index, five milestones, one branch, one PR. The privacy policy is not touched here |
| D8 | Privacy policy | The self-service deletion sentence enters the policy when m4-05 writes it. This delivery leaves a handoff note; it does not anticipate the page |
| D9 | Decision record | **ADR 0022 — SSO through Keycloak and self-service account deletion**, written in m1. It supersedes ADR 0018 decision 1 (the provider list) and records the revocation promise ADR 0018 made for the deletion endpoint |

## Where the input and the repository disagree

The input was written without knowledge of this repository. It is not a defect to fix; it is the list of
places where following it literally would undo accepted decisions or invent tables.

| Input assumes | Repository has | This delivery does |
|---|---|---|
| Prisma or TypeORM | MikroORM with SQL migrations | MikroORM entities and migrations |
| `users.google_id`, `users.github_id` | `identities` rows, `(provider, provider_user_id)` unique | Keep `identities`; no duplicate columns |
| `users.password_hash` | `password_credentials`, hung off a `password` identity | Keep it; "has a password" is a lookup, not a null check |
| `user_sessions` table | Stateless `ea_session` cookie (ADR 0018 D3) | No session table; revocation by account existence |
| `battle_history`, `unit_inventory` | `matches`, `match_agents`, `match_events`; no inventory | These tables already cascade from `users` |
| SPA PKCE + bearer in `sessionStorage` | Server-side flow + HttpOnly cookie | The cookie stays (D1) |
| `passport-google-oauth20`, `passport-github2` | `openid-client` with PKCE | `openid-client` for Keycloak too |
| `oidc-client-ts`, `JwtAuthGuard`, `/auth/sso/exchange` | Not needed in this architecture | Not built |
| `.hbs` mail templates | Plain-text `EmailMessage` through a `Mailer` port | Plain text, in pt-BR or en-US, chosen by the request |
| Toast, `/settings/security` route, linked-account management | DOM cards, no router | The security card (D6); linking/unlinking is out of scope |
| `VITE_KC_*` | The client never sees provider credentials | Server-only `OAUTH_KEYCLOAK_*` |

## Provider values and the schema

`identities.provider` is a `text` column. Adding a fourth value is a TypeScript union change
(`ProviderName` in `backend/platform-api/src/db/entities/identity.entity.ts`) and nothing else — there is
no enum in PostgreSQL to alter.

That table already is the per-provider field set the input asked for: `provider`, `provider_user_id`,
`email`, `email_verified`, plus the cascade to `users`. A `users.keycloak_id` (or `google_id`) column
would be a second source of truth for a fact `identities` stores, and ADR 0018 makes the pair the **only**
key that decides which account a sign-in belongs to. Adding one would silently create two answers to a
question the schema settled. **This delivery therefore adds no migration.**

The one small migration that would be defensible — storing the upstream IdP Keycloak brokered (Google,
GitHub, or the realm's own password) — was considered and left out: nothing in the delivery reads it.
It can be added when a screen actually needs to show it.

## Dependency notes

- **m1 depends on nothing.** It reuses the provider interface, the flow cookie and the linking rule m4-02
  built.
- **m2 depends on nothing structural either** — deletion does not need Keycloak — but it is sequenced
  after m1 because both touch `session.guard.ts` and `AuthController`, and two small PR-ready commits
  review better in order.
- **m3 depends on m2's contract being frozen** (`GET /me` carries `hasPassword`, the deletion route and
  its error codes), not on m2 being merged. It can be written against a fake `Api`.
- **m4 depends on m3 approved.** **m5 depends on m4 approved.**
- **m4-05 depends on nothing here**, but the policy it writes must mention self-service deletion; the note
  lives in this index and not in a hidden TODO.

### Handoff to m4-05

m2 implements `DELETE /auth/account`, and the frontend milestones (m3–m5) surface it as the security card
of the account dialog. The privacy policy m4-05 writes must say that a signed-in player deletes the
account from that card, that the
deletion is immediate and irreversible — squad, battle history and every way in are erased — and that a
confirmation is mailed to the address before the row holding it disappears. An account that signs in only
through a provider is deleted on the confirmation alone; one with a password also proves it.

## Test strategy

| Case | Where | Why there |
|---|---|---|
| Keycloak authorization URL, claim mapping, independent provider list | `backend/platform-api` | The provider is a pure unit and the list is built from what the environment configures |
| Linking unchanged, notice mail once | `backend/platform-api` | The rule and the mailer live there |
| Deletion: confirm, password, cascade, revocation, throttle | `backend/platform-api` | The route, the guard and the database |
| Match ended for a deleted player | `backend/platform-api` | The consumer is there |
| The whole journey across both services | `backend/e2e` | Same rule as m4-03: only that workspace may know both backends |
| Client parsing, deletion outcome, copy parity | `frontend` unit tests | The logic is pure and the repo has no DOM test runner |
| The card on screen | manual, m4's pre-review | The repo has no DOM test infrastructure; m4-04 has the same gap |

## Out of scope

- **Roles, groups, realms, MFA and federated logout.** Keycloak's realm configuration is deployment, not
  code. The input's `groups` pitfalls do not apply: the platform never reads an access token.
- **Linking or unlinking a provider from the client.** The card shows how the account signs in; it does
  not edit it.
- **Migrating sessions.** The cookie is stateless; there is nothing to migrate when Keycloak is switched
  on or off.
- **A passwordless account choosing a password.** Reset only knows `password` identities, so an SSO-only
  account cannot use "forgot password". That is consistent with the input and unchanged here.
- **Soft delete, grace period, data export.** The deletion is immediate and irreversible; the input asks
  for no other.
- **Revoking a game ticket already issued.** A ticket lives at most five minutes; the match server is a
  separate process. A match that ends after deletion is dropped by m2; one that starts is allowed to end.
- **The privacy policy page and its date.** m4-05.

## ADRs this index opens

| ADR | Decision | Milestone | State |
|---|---|---|---|
| 0022 | SSO through Keycloak as an optional, independent provider behind the existing session; self-service deletion and the revocation it carries | m1 | written (2026-10-17) |
