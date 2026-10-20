# Pre-review — Sign in with GitHub, Google or an address and a password, a signed cookie instead of a session table, and the ticket the match server checks (M4 · m4-02)

**Branch:** `feat/auth`
**Generated on:** 2026-10-16

---

### 1. What to test

The most important items here are the first three, and they are the ones no test in the repository can
stand in for: **the two real providers have never been through a browser**, **no mail has ever gone
through Zoho**, and **no password has ever been typed into a real form** — the suite swaps in
`FakeProvider`, `FakeMailer` and its own `fetch`. Everything up to and including the token exchange, the
message the mailer is handed and the six password routes is covered; the URLs, the scopes, the shape of
what GitHub and Google actually answer, and whether Zoho accepts the connection are reasoned-through and
not observed.

Set up a scratch database and the environment first. Start with one of your own, never the database you
develop against — several steps below create accounts:

```
docker run -d --name ea-check -e POSTGRES_USER=eldritch -e POSTGRES_PASSWORD=eldritch \
  -e POSTGRES_DB=eldritch_alley -p 55432:5432 postgres:17-alpine
```

Then, from the repository root:

```
cp .env.example .env
# DATABASE_URL=postgres://eldritch:eldritch@localhost:55432/eldritch_alley   (the scratch one)
# SESSION_SECRET="$(openssl rand -base64 32)"
openssl genpkey -algorithm ed25519 -out game-ticket.pem
openssl pkey -in game-ticket.pem -pubout -out game-ticket.pub.pem
# GAME_TICKET_PRIVATE_KEY=  ← the private key on ONE line, line breaks written as \n
# OAUTH_GITHUB_CLIENT_ID / _SECRET, OAUTH_GOOGLE_CLIENT_ID / _SECRET  ← your own apps, or leave all four blank
npm run db:migrate
npm run dev:platform-api
```

Register both callbacks in the OAuth apps, and they must match character for character:

```
http://localhost:3000/auth/github/callback
http://localhost:3000/auth/google/callback
```

Run `npm run dev:frontend` in another terminal if you want the redirect to land somewhere. Without it
the final hop shows a connection error — the cookie is already set by then, so the flow can still be
checked, but the browser address bar is the wrong place to read the result from.

**1. A real GitHub sign-in, all the way through.** Open `http://localhost:3000/auth/github` in the
browser. Expected: GitHub's consent screen, then a redirect back to `http://localhost:5173`. Nothing
about this path has ever run. What to check, in order: the authorize URL actually accepted
`code_challenge` and `code_challenge_method=S256`; GitHub did not reject the scope `read:user
user:email`; the callback found the flow cookie; and the response carried `ea_session`. If it fails at
the callback with `invalid_state`, the cookie is the suspect — see item 10. If it fails with
`provider_refused`, the log has GitHub's own words and the body deliberately does not.

**2. A real Google sign-in, and then the link between the two.** Repeat with
`http://localhost:3000/auth/google`. Then: sign in with GitHub using an account whose **verified**
address is the same as the Google account's, and confirm `GET /me` answers with the **same user id** as
the Google sign-in did — that is the linking rule, and `select * from identities` should show two rows
with one `user_id`. Then the negative: a GitHub account with a private address answers `email: null`,
and signing in with it must create a **second** user rather than linking. Check `email_verified` in
`identities` is `true` on the linked pair and that it was never written as `false` afterwards.

**3. The provider list, with the apps on and with them off (§ 8).** `curl -s
localhost:3000/auth/providers` → `{"providers":["github","google"]}` in that order, with all four values
present. Then the cases that matter, each needing a restart:

- Delete the **GitHub** pair only, restart → `{"providers":["google"]}`, and
  `http://localhost:3000/auth/github` answers **`404 unknown_provider`** while Google still works. The
  button that must not be drawn is not drawn, and the route behind it is honest about it.
- Delete **all four** → `{"providers":[]}` and the project still boots, still serves `/health`, and
  **the password routes still work**. This is the whole point of § 8 and the most important run in this
  list: a contributor with no OAuth app must be able to sign up with an address.
- Put **half** a pair back (`OAUTH_GITHUB_CLIENT_ID` set, the secret blank) → the process must **fail to
  finish booting**, and the message must name **both** variables. A half-configured provider that came up
  and answered `404` would be a typo that looks like a decision.
- `GET /auth/providers` must never be read as a provider called `providers`: that is the ordering bug
  the route comment warns about, and it presents as a `404` that looks like an endpoint nobody wrote.

**4. A real verification mail, through Zoho (§ 9).** Fill in all five `EMAIL_*` values from
`.env.example`, restart, then `POST /auth/password/register` with an address **you can actually read**:

```
curl -si -X POST localhost:3000/auth/password/register -H 'content-type: application/json' \
  -d '{"email":"you@yourdomain.tld","password":"a-long-enough-passphrase"}'
```

Expected: `202 {"status":"sent"}`, and a message in the mailbox. **Nothing in this MR has ever sent
one.** Check, in order: it arrived at all (the credential, the port, and whether Zoho wants an
app-specific password); `EMAIL_FROM` was accepted as a sender for that account; the **From** is what you
set and not the SMTP user; and the body contains a URL of the form
`http://localhost:5173/verify-email?token=…`. That URL points at the **client**, which does not exist yet
(this is m4-04's work), so the last hop is a connection error on purpose — **paste the URL's
`token` into the API by hand** to finish the walk:

```
curl -si -X POST localhost:3000/auth/password/verify -H 'content-type: application/json' -d '{"token":"<paste>"}'
```

→ `200 {"verified":true}` **and** an `ea_session` cookie. Then confirm the address is proved: `select
email_verified from identities where provider = 'password'` is `true`, and `GET /me` with that cookie
answers the profile and the three agents.

Also here: **the same message must not be sent twice.** Register the same address again →
`202` again and **no second mail** (the address is verified, so there is nothing to prove). Then the
unverified case: a second address, registered twice in a row before following any link → two messages,
and only the **second** link works.

**5. Signing in, and every way it is refused.** With a verified address:

```
curl -si -X POST localhost:3000/auth/password/login -H 'content-type: application/json' \
  -d '{"email":"you@yourdomain.tld","password":"a-long-enough-passphrase"}'
```

→ `200`, not `201`, with `{"user":{…}}` and an `ea_session` cookie that `/me` accepts. Then the
refusals, each with its own restart or its own address where note:

- Wrong password → `401 invalid_credentials`. An address with **no account at all** → the *same* body,
  and **roughly the same time to answer** (the no-account path hashes against a throwaway). Watch it with
  `time curl …` a few times: a no-account answer that comes back in a millisecond is the bug this exists
  to prevent, because it is the list of who has an account here.
- A correct password for an address that never followed its link → `403 email_not_verified`, and **no
  cookie**. This is the account-takeover boundary, so check it rather than assuming: an account that can
  sign in unverified is an account anybody can create for somebody else's address.
- Eleven wrong passwords in a row for one address → the eleventh and the twelfth answer **`429
  too_many_attempts`**, *even with the right password*. Then sign in successfully from a **different**
  address with the same IP: it still works (the per-IP counter is 100, not 10). Then restart the service
  → the counter is gone, which is ADR 0021's honest limit and not a bug.
- A body with no `email`, an address with no `@`, a missing `password`, a password shorter than 12 or
  longer than 128 → `400`, and the message for the length ones names the limit. Nothing answers `500`.

**6. The reset, and what it spends.** `POST /auth/password/forgot` with a registered address →
`202 {"status":"sent"}` and a mail with `http://localhost:5173/reset-password?token=…`. Then **the
property that is easy to get wrong**: `POST /auth/password/reset` with that token and a new password →
`204`; the **new** password signs in and the **old** one answers `401 invalid_credentials`; and the
reset link **cannot be used a second time**. Also: a `reset` token must not work at
`/auth/password/verify` and a `verify` token must not work at `/auth/password/reset` — the purposes are
separate. And the case the plan went out of its way for: ask for a verification link, ask for a reset
link, complete the reset → **the verification link is dead too**, because a completed reset ends every
outstanding link for that identity.

Finally `forgot` for an address with **no** account → `202` with the **same** body as for one that has
it, and no mail. Register, resend and forgot are all shaped so that none of them answers "does this
address have an account here".

**7. The account a password sign-up makes, and the link to Google.** This is the case § 9 exists to
close, and it is the one to run last because it needs both halves. Register `X@y.tld` with a password,
follow the link, and note the user id from `/me`. Then sign in with **Google** using an account whose
verified address is the same → `/me` must answer the **same user id**, with the **same three agents** and
no fourth. Then the negative, which is the whole reason verification is required: register a *fresh*
address with a password but **never follow the link**, then sign in with Google on that same address →
this must create a **second** account, not link to the unverified one. In the database, one `user_id` per
address in the first case and two in the second.

**8. `GET /me` — the happy path, the unauthorised path and the empty path.** With a valid cookie: the
profile (`id`, `displayName`, `email`, `avatarUrl`) and the three agents ordered by class. With **no**
cookie, and with a cookie whose value was changed by one character, and with a cookie signed with a
different secret: all three must answer `401 { code: "unauthenticated", message: "Sign in to
continue." }` — identical bodies, because an expired cookie and a missing one are the same fact to a
player. Then the empty state: `delete from agents where user_id = '<id>'` and call `/me` again → `200`
with `agents: []`, **not** an error and not a 500. It is a state no player can reach through the API,
and it is the one that would break a client that assumes three.

**9. The game ticket.** `curl -si -X POST localhost:3000/auth/game-ticket -H "Cookie: ea_session=<value>"`
→ `200`, not `201`, with `{ ticket, expiresAt }`. Decode the payload without verifying it:

```
TICKET='<paste>'
node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')))" "$TICKET"
```

Expected: `iss: "eldritch-alley/platform-api"`, `sub` equal to the user id from `/me`, and
`exp - iat === 300`. Then set `GAME_TICKET_TTL_SECONDS=60`, restart, and confirm `exp - iat === 60`
and that `expiresAt` moved with it. Then the signature, which is the part the match server will depend
on:

```
export PUB="$(cat game-ticket.pub.pem)"
node --input-type=module -e "
import { jwtVerify, importSPKI } from 'jose';
const pub = await importSPKI(process.env.PUB, 'EdDSA');
console.log((await jwtVerify(process.argv[1], pub)).payload);
" "$TICKET"
```

Finally the refusals: `POST /auth/game-ticket` with no cookie → `401`; `GAME_TICKET_TTL_SECONDS=0`,
`=-1` and `=abc` each **stop the service at boot**, naming the variable; and
`GAME_TICKET_PRIVATE_KEY` removed → the same. **A ticket issued to a password account is the same ticket**
— decode it after a password sign-in and the claims are identical, because both routes end in the same
`signSession`. That is the property that makes § 9 additive.

**10. Every way the OAuth flow can be refused, and each must not sign anybody in.** `curl -si
localhost:3000/auth/github` → `302` to `github.com` with a `Set-Cookie: ea_oauth=…`. Now the four
refusals, checking each time that `identities` gained no row:

- Call the callback URL again with the **same** `state` after a completed sign-in → `400`
  `invalid_state` ("already finished"). This is the single-use property, and it is enforced by the
  controller's map rather than by the cookie.
- Call the callback with a `state` that does not match the cookie, or with the `ea_oauth` cookie
  deleted → `400 invalid_state`.
- Call the callback with no `code` at all → `400 missing_code`.
- Call `/auth/constructor`, `/auth/`, `/auth/nope` → `404 unknown_provider`, never a `500`. The
  `constructor` case is the one that matters: without `Object.hasOwn` it is a function, not a provider.
  **`/auth/providers` is the case next door** and it must answer `200` — see item 3.

Then the provider refusing for real: put a wrong `OAUTH_GITHUB_CLIENT_SECRET` in `.env`, restart, run
the flow, and watch the callback → **`502`** `provider_refused` with a generic sentence, while
`platform-api`'s log carries GitHub's own explanation. A body that repeats what GitHub said, or a
`500`, is the failure here.

**11. Logout, and what it does not do.** `curl -si -X POST localhost:3000/auth/logout -H "Cookie:
ea_session=<value>"` → `204` and a `Set-Cookie` that empties the value with `Max-Age=0`. Then reuse the
**old** cookie value against `/me` → it still answers `200`. That is not a bug: the session is
stateless by the owner's decision D3, and this step is here so it is a known property rather than a
surprise. Check with no cookie at all → `401`.

**12. CORS, both directions, with a preflight.** From `CLIENT_ORIGIN`:

```
curl -si -X OPTIONS localhost:3000/auth/password/login -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"
```

Expected: the origin echoed back **and** `Access-Control-Allow-Credentials: true`. Then the same with
`Origin: https://evil.test` → no `Access-Control-Allow-Origin` at all. This is what the `origin` array
in `configureApp` is for; with a string instead of a list, the second request would be told it is
welcome too.

**13. Boot refusals.** With the service stopped, remove `SESSION_SECRET`, then `COOKIE_DOMAIN`, then
`CLIENT_ORIGIN`, restarting each time: the process must **fail to finish booting**, naming the
variable — not come up and fail at the first sign-in. Same for `GAME_TICKET_PRIVATE_KEY` (item 9). Then
the two all-or-nothing groups, which are the **opposite** rule and worth doing in the same sitting:
one empty half of an OAuth pair must stop the boot naming **both** variables (item 3), and so must one
missing `EMAIL_*` value out of the five, naming **every** one that is missing. With all five blank the
service boots and logs the message instead (item 4).

**14. The cookie in a real browser, and the one assumption nothing has exercised.** In DevTools →
Application → Cookies after a sign-in confirm `ea_session` is `HttpOnly` ✓, `SameSite=Lax`,
`Path=/`, and has **no** `Secure` flag because `CLIENT_ORIGIN` is `http://localhost:5173`. **Confirm
the browser stored it at all** — a `Domain=localhost` attribute is the one part of the local flow that
no test can prove a browser accepts, and if it is rejected the whole local flow fails with no error
anywhere. `SameSite=Lax` is also load-bearing rather than decorative: the callback is a top-level GET
navigation arriving *from* `github.com`, and `Strict` would withhold the flow cookie and make every
sign-in end in `invalid_state`. Then set `CLIENT_ORIGIN=https://eldritch.test`, restart, and confirm
`Secure` **is** present.

**15. The suite, and the migration drift guard.** `npm test -w @eldritch-alley/platform-api` →
**112/112**. Then `env -u DATABASE_URL npm test -w @eldritch-alley/platform-api` → **49 passed,
63 skipped, 0 failed**, with the printed line naming `npm run infra:up` — never a failure, never a
hang. Then `npm run db:migrate:check` → green, and `psql "$DATABASE_URL" -c '\d identities'` shows the
unique constraint on `(provider, provider_user_id)` and both indexes — and, deliberately, **no** partial
unique index on the address, which is the plan's § 9.3 being corrected by the code. Also
`psql "$DATABASE_URL" -c '\d auth_tokens'` shows `token_hash` unique and **no column holding a token**.
At the root: `npm run typecheck` and `npm test` (1438).

Then the one assertion worth reading rather than running, because it is the MR's sharpest test:
`password.controller.test.ts` → *"answers the same for a wrong password and for an address with no
account, at the same cost"* compares the two bodies **and** the two durations
(`unknownMs > wrongMs / 4`). If someone ever "optimises" the unknown-address path back to an early
return, that is the line that fails.

**16. A grep that must now come back with hits, and what to do with them.**
`grep -rniE "password" backend/platform-api/src --include=*.ts -l` used to be the milestone's *proof of
absence*; it is now a list of the feature. What is still worth checking is the **inverse**: no
`passwordHash` outside `password-credential.entity.ts` and `password.service.ts`, no password in any
log line, and no token value anywhere but in the message text and the request body —
`grep -rn "passwordHash\|tokenHash" backend/platform-api/src` should hit the entity, the service and
the token module and nowhere else. And `grep -rn "console.log" backend/platform-api/src` hits the log
mailer, which is the one that is supposed to.

**17. Compose, end to end — still never run.** `docker compose up --build postgres migrate
platform-api`. Expected: `migrate` applies **three** migrations and exits `0`; `platform-api` starts
only after that; `/health` answers; `/auth/providers` answers; `/auth/github` answers a `302`. With no
`EMAIL_*` values in the `.env` the mail is logged, so a registration in this stack shows the message in
`docker compose logs platform-api` and sends nothing — which is the right behaviour to confirm rather
than assume. Then `docker compose up` again → `migrate: nothing to apply` and the API starts as before.
The compose `migrate` service was verified in m4-01's review by running its command directly; the
container path and the CI job (which now runs the 63 database cases because it sets `DATABASE_URL`) have
still never executed.

---

### 2. Code checklist

- [ ] **The password handling is confined to four files.** `password.ts` (the hash), `auth-token.ts` (the mailed tokens), `password.service.ts` and `password.controller.ts`. Nothing outside them hashes, verifies or compares a secret, and no other entity holds one.
- [ ] **No token value is ever stored.** `grep -rn "tokenHash" backend/platform-api/src` → the entity, the token module and nothing else; `issueAuthToken` writes `hashToken(token)` and returns the plaintext **to the caller only**, and the plaintext appears in exactly one more place: the message text. A `token` column holding what was mailed would be a database dump full of live links.
- [ ] **Every mailed token is spent by a `POST`, never by a `GET`.** `verificationLink` and `resetLink` in `messages.ts` point at `CLIENT_ORIGIN`, `messages.test`-adjacent assertions put the URL alone on its own line so it can be extracted intact, and `/auth/password/verify` and `/reset` are `@Post`. A `@Get` that consumed a token is consumed by the first mail scanner that prefetches the URL.
- [ ] **A password account cannot sign in unverified.** `login` throws `emailNotVerified()` **after** the credential check and before any session is issued, and there is an E2E case for it. This is the account-takeover boundary; if it is ever reordered, the linking rule becomes an account-merge rule.
- [ ] **The unknown-address path costs what the known one costs.** `againstNothing` hashes once per process and `verifyPassword` runs against it, and the timing case asserts `unknownMs > wrongMs / 4`. An early `return` before the hash is the regression.
- [ ] `email_verified` is written as `true` in exactly one place (`PasswordService.verify`, via `consumeAuthToken` having proved the mailbox) and the reset does **not** write it. Verification in two places is how the two halves drift.
- [ ] `reset` calls `spendTokens(em, identity)` **with no purpose**, so every live link dies with the password it was minted under. A `reset` that left a three-week-old verification link alive would be a reset that locked the door and left the window open.
- [ ] Every error answer is built through `apiError`, so every body is `{ code, message }`: `grep -rn "new HttpException" backend/platform-api/src` hits **one line** — the inside of `apiError` in `src/app.ts`. A second hit is a route that invented its own shape, which is the thing m4-04 would have to special-case.
- [ ] **Every password route carries an explicit `@HttpCode`.** Nest answers `201` to a `POST` by default: the four that answer `202` (`register`, `verify/resend`, `verify`… check each) and the one that answers `204` (`reset`) are the ones a missing decorator breaks silently.
- [ ] **`GET /auth/providers` is declared before `GET /auth/:provider`.** In the other order it is read as a provider called `providers` and answers `404`, which looks exactly like an endpoint nobody wrote. There is a test; read it rather than trusting the order by eye.
- [ ] The provider's own failure reason never reaches the body: `oauth.controller.ts`'s `exchange` logs and throws a generic sentence, and `oauth.controller.test.ts`'s 502 case asserts GitHub's words are absent. Read that assertion rather than trusting the name.
- [ ] `synchronize` is still absent and the three entities agree with their migrations on **every** column type, every index and both unique constraints — `npm run db:migrate:check` is the check, and it was green on the last run. `type: 'string'` (which is `varchar(255)`) where the SQL says `text` is the drift to look for, exactly as in m4-01. And `identities` must have **no** new index: the one the plan asked for is documented as impossible in the entity, not silently missing.
- [ ] **Every injected constructor parameter carries an explicit `@Inject`**, in `AuthService`, `PasswordService`, `OAuthController`, `PasswordController`, `SessionGuard` and `MeController`. The suite runs through esbuild, which does not emit `design:paramtypes`; a missing `@Inject` fails at runtime, not at compile time.
- [ ] `SessionGuard` is applied to `AuthController` and `MeController` at the class level, and **no password route wears it** — they are the way in, so a guarded `login` is a login nobody can reach. `GET /auth/:provider`, the callback and `GET /auth/providers` are the unguarded ones and must stay that way.
- [ ] The mailer is overridden **always** in `test-app.ts`, not only when a case asks. Nothing in the suite may open a socket to a mail server, and a case that forgot to ask must not be the one that tries.
- [ ] The linking rule in `auth.service.ts` matches the table in the plan exactly, in particular the two rows that are easy to get backwards: an address whose verification is missing on **either** side creates a new account, and `email_verified` is only ever written as `true`.
- [ ] The starter squad is written inside `em.transactional(...)` together with the `User` and the `Identity`, and `tx.flush()` happens inside the callback. A squad written after the transaction commits would leave a player with an account and no agents if the second step failed. **The password path reaches that same code** — `register` calls `auth.signIn` rather than writing a user of its own — and a second creation path here is the thing to look for and not find.
- [ ] `Secure` on the cookies is decided by `isLoopback(config.clientOrigin)` and never by `NODE_ENV`, and the catch branch keeps `Secure` when the origin is unparseable.
- [ ] `SESSION_MAX_AGE_SECONDS` is `2_592_000` (30 days) and the flow's is `600`; the verification token's is 24 h and the reset's 1 h; each appears once.
- [ ] **scrypt's `maxmem` is raised**, in `password.ts`'s `derive`, to at least `128 * cost * blockSize * 2`. The node default is 32 MiB and the chosen parameters need **exactly** 32 MiB, so removing the option fails on the first hash with an error that names neither the parameter nor the fix. This is the single most fragile line in the new code.
- [ ] `privateKeyFromEnvironment` is still there and still unescapes `\n`. It is the one function in this MR with real logic and no test — see § 3.
- [ ] No secret **value** is added by the diff: `git diff develop...feat/auth -- .env.example docker-compose.yml | grep -iE "^\+.*(SECRET|KEY|PASSWORD)="` hits only empty assignments, `${VAR:?…}` interpolations, the `${VAR:-}` pass-throughs and the `test`/`eldritch` development defaults. Read the hits rather than counting them. `SESSION_SECRET` and `GAME_TICKET_PRIVATE_KEY` must have **no** default in `docker-compose.yml`, and the Zoho example in `.env.example` must stay commented out.
- [ ] `.env.example` documents every variable the code reads. Cross-check the read sites: `readRequired`/`readGameTicketTtl`/`readRequiredPort` in `config.ts`, `sessionConfigFromEnvironment`, `gameTicketConfigFromEnvironment`, `oauthProvidersFromEnvironment` and `EMAIL_VARIABLES`. A variable read but undocumented is a boot failure waiting for the next person — and the `EMAIL_*` group is five lines that must all be there.
- [ ] No `console.log`, no `debugger`, and the only logging is the `Logger` line for a refused exchange, plus the **log mailer**, which is meant to print. Anything else printing a message or a token is a leak.
- [ ] ADR 0021's eleven decisions and its consequences each match the code, and the consequences name the things a reviewer will otherwise ask about: the index that could not be written, the throttle's three honest limits, `forgot` being unthrottled, and no way yet to remove or change a password.
- [ ] ADR 0018 is **untouched** — an accepted ADR is not rewritten, and the README's 0021 row is the pointer. If `0018` shows up in the diff, the rule has been broken.
- [ ] `CLAUDE.md` rule 6 holds in every file this MR touches: `grep -rnP "[àáâãçéêíóôõú]" backend/platform-api/src .env.example docker-compose.yml` hits nothing. `main.ts`'s boot line and `.env.example`'s section headers were translated here.
- [ ] `backend/engine` is untouched — `git diff develop...feat/auth -- backend/engine` is empty. The milestone's boundary is the platform, and the engine's ADR 0005 determinism is not this MR's business.
- [ ] `m4-02-auth.plan.md` is a truthful list: § 2 names `src/app.ts` as added while implementing, D1 (discovery) and D4 (the callback clears the flow cookie) are corrected against what the code does, and § 9.7 records everything the § 9 amendment changed — the dropped index, the six routes, the unthrottled `forgot`, the three files touched outside the table and the duplicated cookie composition. All of it is also in the description's § 1.
- [ ] **`.ia_context/plans/m4-04-client.plan.md` § 8 and `m4-05-contact-release-privacy.plan.md` § 8 exist and are accurate.** Both later milestones had work listed here that this MR took: m4-04 owns the password form and the two link-landing pages, m4-05 finds the mailer built. A stale plan is the next milestone's wasted afternoon.
- [ ] Test counts at the head of the branch: platform-api **112/112** with a database and **49 passed / 63 skipped** without; engine 342; game-server 86; frontend 898.
- [ ] **`ROADMAP.md` § Decisions still says ADRs 0018 and 0020 are "to write".** This branch writes them, and 0021 besides. Two lines, and the decision is whether they ride with this MR or with m4-03.

---

### 3. Behaviour checklist

- [ ] A real GitHub sign-in lands on `CLIENT_ORIGIN` with `ea_session` set, and `/me` answers with the profile and three agents.
- [ ] A real Google sign-in does the same, and a GitHub sign-in whose verified address matches a Google account's lands on the **same** user id — two rows in `identities`, one `user_id`.
- [ ] A GitHub account with a private address creates a second account instead of linking, and `email_verified` is `true` only where the provider verified it.
- [ ] `GET /auth/providers` lists exactly the providers whose two values are present, and **an empty list still boots and still serves the password routes**.
- [ ] A provider with **half** its pair set stops the boot, naming both variables.
- [ ] A registration for a real address sends a **real mail through Zoho**, whose body links to the client with the token in the query string.
- [ ] Following that token through `POST /auth/password/verify` answers `200` with a session, and the account can then sign in.
- [ ] Registering the same verified address again sends **no second mail**.
- [ ] A correct password for an unverified address answers `403` and sets **no** cookie.
- [ ] A wrong password and an address with no account answer the **same body in about the same time**.
- [ ] Eleven failures for one address make the **twelfth** attempt `429` even with the right password, another address from the same IP still signs in, and a restart clears it.
- [ ] `forgot` sends a reset mail for an address that has an account and answers `202` with the same body for one that does not.
- [ ] A completed reset: the new password works, the old one does not, the reset link is dead, and so is every other outstanding link for that account.
- [ ] A password sign-up and a later Google sign-in on the **same verified address** land on one account with one squad; an **unverified** password registration and a Google sign-in on that address produce **two** accounts.
- [ ] The ticket issued to a password account carries the same four claims as one issued after an OAuth sign-in.
- [ ] Signing in a second time creates no fourth agent, and no second account.
- [ ] `/me` answers `401` with the same body for a missing cookie, a tampered cookie and a cookie signed with another secret.
- [ ] `/me` answers `200` with `agents: []` — not an error — for a player whose squad was emptied by hand.
- [ ] `POST /auth/game-ticket` answers `200`, and the ticket verifies with the public key, carries exactly `iss`/`sub`/`iat`/`exp`, and lasts 300 s or whatever `GAME_TICKET_TTL_SECONDS` says.
- [ ] A replayed `state`, a `state` that does not match the cookie and a callback with no `code` are each refused with `400`, and none of them creates an account.
- [ ] `/auth/constructor` answers `404`, not `500`, and `/auth/providers` answers `200`.
- [ ] A refused token exchange answers `502` with a generic sentence, and the provider's own words are in the log and not in the body.
- [ ] Logout answers `204` with the cookie cleared, and the old cookie value still works — the stateless-session property, confirmed rather than assumed.
- [ ] CORS allows `CLIENT_ORIGIN` with credentials and tells any other origin nothing.
- [ ] The platform refuses to finish booting with `SESSION_SECRET`, `COOKIE_DOMAIN`, `CLIENT_ORIGIN` or `GAME_TICKET_PRIVATE_KEY` missing, with half an OAuth pair, or with one `EMAIL_*` value out of five — naming the variable each time — and it **does** boot with no OAuth pair at all and with no mail settings at all.
- [ ] `ea_session` is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` only when `CLIENT_ORIGIN` is not loopback — and the browser **stores** it with `COOKIE_DOMAIN=localhost`.
- [ ] `npm test` is green at the root, the platform-api suite skips its 63 database cases with a visible line when `DATABASE_URL` is unset, and `npm run db:migrate:check` is green.
- [ ] **Not run yet — check it on the pull request and in one local run:** the CI job's 63 new database cases, and `docker compose up --build postgres migrate platform-api` end to end with all three migrations applied.

---

### 4. Known gaps, deliberately not closed

- **No real mail has ever been sent.** Every case reads its link out of `FakeMailer`, so the SMTP adapter's construction, the credentials and Zoho's acceptance are unobserved. The registration in item 4 is the cheapest way to close it, and it is the second item in this document for that reason.
- **No password has been typed into a real form.** The two pages the mailed links land on do not exist yet — m4-04 builds them — so the whole flow has been walked with `curl`, and the click-through the design assumes (`GET` the page, then `POST` the token) has not happened in a browser.
- **`privateKeyFromEnvironment` has no test.** The `\n` unescaping was verified with a throwaway script (`ttl from env: 120`, correct `expiresAt`) and then deleted. A test that sets `GAME_TICKET_PRIVATE_KEY` with `\\n` and asserts the ticket signs and verifies would close it, and it is the cheapest missing case in this MR.
- **`isLoopback`'s catch branch has no test** — an unparseable `CLIENT_ORIGIN` keeps `Secure`, and only the two happy paths are covered.
- **`missing_code` has no test.** It is the one `400` in the OAuth controller that the suite does not exercise.
- **The sign-in-cookie composition is written twice** — `signSession` + `sessionCookie` in `oauth.controller.ts` and again in `password.controller.ts`. Deliberately not extracted (description § 1): two call sites and no third in sight, and it belongs with the next route that needs a session rather than with this MR.
- **`forgot` has no counter.** Only an address with a password account can be made to receive mail, one message per call — but the route has no throttle at all, and ADR 0021 § Consequences says why the obvious fixes are worse.
- **The throttle does not survive a restart and would count half from a second instance.** ADR 0021 § Consequences, and m4-05's Redis is where it moves.
- **`ROADMAP.md` is stale for 0018, 0020 and 0021**, as above.
- **The flow cookie outlives a finished sign-in by up to ten minutes** because the callback does not clear it. Harmless — single use is enforced by the spent-state map — but it is a real difference from plan D4 and was left in rather than changed after the tests were green.
- **Plan § 9.3 describes an index that does not exist.** `m4-02-auth.plan.md` § 9.7 explains why and the ADR is the version to trust, but a reader who starts at § 9.3 will be confused for a page. Left rather than deleted so the correction is visible instead of silent.

