# Plan — Self-service account deletion (backend)

**Milestone:** m2
**Parent feature:** sso-login
**Created:** 2026-10-17
**Status:** pending

## 1. Objective

A signed-in player can delete their own account from the API: the account and everything that hangs off
it are erased, the session stops working on every device, a confirmation is mailed, and the answer is a
204 with the session cookie cleared. The same milestone closes the two holes ADR 0018 left open — a
cookie that outlives its account can still ask for a game ticket, and a match that ends after the account
is gone would sit in the queue forever.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `backend/platform-api/src/auth/account-deletion.service.ts` | create | Confirmation, password proof, throttling, the cascading delete, the confirmation mail |
| `backend/platform-api/src/auth/auth.controller.ts` | modify | `DELETE /auth/account`; the game-ticket route moves to the guard that checks the account exists; logout keeps the signature-only guard |
| `backend/platform-api/src/auth/session.guard.ts` | modify | `UserSessionGuard` — the same signature and age check, then one question the database answers: does this account still exist? |
| `backend/platform-api/src/me/me.controller.ts` | modify | `hasPassword` in the answer; the class uses `UserSessionGuard` |
| `backend/platform-api/src/matches/matches.controller.ts` | modify | The class uses `UserSessionGuard` |
| `backend/platform-api/src/matches/matches.service.ts` | modify | `store` answers `'stored' \| 'duplicate' \| 'user-gone'` instead of throwing for a deleted account |
| `backend/platform-api/src/matches/match-ended.consumer.ts` | modify | A message that names an account that no longer exists is deleted, not retried |
| `backend/platform-api/src/email/messages.ts` | modify | `accountDeletedMessage(to)` — plain text, English, no action |
| `backend/platform-api/src/app.module.ts` | modify | Registers `UserSessionGuard` and `AccountDeletionService` |
| `backend/platform-api/src/auth/account-deletion.controller.test.ts` | create | Section 4 |
| `backend/platform-api/src/auth/auth.controller.test.ts` | modify | The old cookie after deletion |
| `backend/platform-api/src/auth/session.test.ts` | modify | The guard's two refusals |
| `backend/platform-api/src/me/me.controller.test.ts` | modify | `hasPassword` |
| `backend/platform-api/src/matches/matches.controller.test.ts` | modify | The deleted player's history is refused |
| `backend/platform-api/src/matches/matches.service.test.ts` | modify | The three outcomes of `store` |
| `backend/platform-api/src/matches/match-ended.consumer.test.ts` | modify | `user-gone` deletes; a real failure keeps |
| `backend/e2e/src/player-journey.test.ts` | modify | The deletion journey |

No migration. Every table that belongs to a player already has `on delete cascade` to `users`: the flow
is one `em.remove(user)`.

## 3. Layer contract

**`DELETE /auth/account`** — signed in, body `{ confirm: string, password?: string }`.

| Answer | When |
|---|---|
| 204, `Set-Cookie` clearing `ea_session` | The account was deleted |
| 400 `invalid_confirmation` | `confirm` is anything but the exact, case-sensitive `DELETE` |
| 401 `unauthenticated` | No cookie, a forged one, or an account that no longer exists |
| 403 `invalid_password` | The account has a password and the body's is missing or wrong |
| 429 `too_many_attempts` | The throttle's window is full for this account or this IP |

The password is required **only** when a usable password credential exists — an identity with a
`password_credentials` row, not merely a `password` identity. An SSO-only account is deleted by the
confirmation alone. The route is refused for an account that has no session, so a caller cannot delete
somebody else's account: the id comes from the cookie and never from the body.

**`UserSessionGuard`** — `SessionGuard` plus "the account still exists". The answer is the same
`unauthenticated()` 401 the platform already gives, so a stale cookie and no cookie are one fact to the
client. Applied to every route that acts for the player: `/me`, `/me/matches`, `/auth/game-ticket` and
`DELETE /auth/account`. **`POST /auth/logout` keeps `SessionGuard`**: a logout must always be able to
clear the cookie, even when the account behind it is gone.

**`GET /me`** gains `hasPassword: boolean` at the top level, beside `user` and `agents`. True only when a
usable credential exists. This is the client's one question — whether to ask for a password before
deleting.

**`MatchesService.store(message)`** answers `'stored' | 'duplicate' | 'user-gone'`. The consumer deletes
the queue message for all three. It keeps the message only when `store` throws — a database that did not
answer, or a message that contradicts the squad — because those are retryable or worth an alert.
`'user-gone'` is neither: nobody will ever exist to receive the match.

**Errors and side effects.** The confirmation mail is sent after the delete, to the address captured
before it; a mail failure is logged and does not change the 204. The password failures are counted in the
same in-memory throttle the sign-in route uses, keyed by the account's address (or its id when it has
none) and by the caller's IP; a correct password clears the account's counter.

**What this milestone does not do.** No soft delete, no grace period, no export, no admin route, no way to
delete a different account, no session store, and no revocation of a game ticket already issued.

## 4. Planned tests

**Unit / route — `account-deletion.controller.test.ts`:**

- [ ] No cookie → 401; a forged signature → 401.
- [ ] `confirm` missing, lowercase `delete`, or with a trailing space → 400 `invalid_confirmation`.
- [ ] Account with a password: no password → 403; wrong password → 403; correct → 204.
- [ ] Account without a password: confirmation alone → 204; a password sent anyway is ignored.
- [ ] Eleven wrong passwords in the window → 429 before the hash is checked; a correct password clears
      the counter.
- [ ] The 204 carries a `Set-Cookie` that expires `ea_session`.
- [ ] The deletion mail is sent once, to the account's address; an account with a null address sends none.
- [ ] After the 204 the rows for that user are gone from `users`, `identities`, `password_credentials`,
      `auth_tokens`, `agents`, `matches`, `match_agents` and `match_events`; another account's rows are
      untouched.
- [ ] The old cookie answers 401 on `/me`, `/me/matches` and `/auth/game-ticket`, and `POST /auth/logout`
      still answers 204 with a clearing cookie.
- [ ] `GET /me` answers `hasPassword: true` for a password account and `false` for an SSO-only account.

**Unit — matches:**

- [ ] `store` with an unknown user id answers `'user-gone'` and writes nothing.
- [ ] The consumer deletes a `user-gone` message.
- [ ] The consumer keeps the message when the database throws.
- [ ] A duplicate still answers `'duplicate'` and is deleted.

**E2E — `player-journey.test.ts`:**

- [ ] Sign in with an address and a password, record a match, delete the account: `/me` 401, history
      gone, the queue's late `match-ended` for that player is dropped, and registering the same address
      again creates a new account with a new starter squad (the input's T9).
- [ ] An SSO-only account deletes with the confirmation alone.

**Edge cases included above:** null address, SSO-only, both ways in, ticket requested after deletion,
match ending after deletion, repeated deletion.

## 5. Dependencies

- **m1 approved.** The two milestones share `session.guard.ts` and `AuthController`; m2 does not need
  Keycloak itself, but it is sequenced after m1 so the two small diffs review in order.
- **The mailer and the throttle already exist** (m4-02): `MAILER` has a log adapter for a deployment with
  no SMTP, so the confirmation is never the reason a local run fails.
- **The policy handoff.** m4-05's privacy page must state that deletion is available from the account
  screen. This milestone records the handoff in the index rather than editing a page that does not exist
  yet.

## 6. Out of scope

- **Soft delete and anonymization.** The input asks for erasure, and the database cascades make erasure
  the simpler and safer answer.
- **Deleting an account from an admin route.** There is no admin surface, and the body can never name
  another account.
- **Revoking tickets already handed to the match server.** A ticket lives five minutes and the match
  server is a separate process; the match is allowed to finish, and its recording is dropped by the
  consumer.
- **A session store.** The revocation is the account's existence, which is what ADR 0018 promised the
  endpoint would bring.
- **Data export before deletion.** No screen and no requirement in this delivery.
