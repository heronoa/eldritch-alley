# Pre-review — Keycloak SSO and self-service deletion: the planning package

**Branch:** `feat/sso-login-specs`
**Generated on:** 2026-10-17

## 1. What to test

Run from the branch root. There is no application code in this MR, so every scenario is a document or diff check; the "mock state" column names the file state that exercises it.

| # | Scenario | Entry point | Expected result | Mock state |
|---|----------|-------------|-----------------|------------|
| 1 | **Scope of the diff** | `git diff --name-status origin/develop..HEAD` | Exactly 11 files: 10 under `.ia_context/plans/` and `frontend/.env.production`. No `backend/` or `frontend/src/` change. If application code appears, the commit is not what the description claims | Clean working tree |
| 2 | **Production env is safe to ship** | Open `frontend/.env.production` | One `VITE_API_URL`, a trailing newline, no secret. Today it has a duplicate `VITE_API_URL`, no EOF newline, and `VITE_KC_*` values the chosen architecture never reads. Fix before merging, or move the file to its own MR | Owner's committed change |
| 3 | **Gate correction is factual** | `git log --oneline develop` and the PR numbers | M4 index header and rows say m4-01–m4-04 approved/merged; plan headers say PR #27, #27, #28. Compare with the real merge commits — a wrong PR number makes the gate lie | `m4-accounts-and-persistence.index.md`, three plan headers |
| 4 | **Pending state stays pending** | Open the SSO index milestone tables | Milestone 0 is `[x] done`; milestones 1–5 are `[ ] pending`; m4-05 stays `[ ] pending` in the M4 index. No milestone is marked delivered without a PR | `sso-login.index.md` |
| 5 | **Index links resolve** | Every relative link in `sso-login.index.md` | Each `./sso-login-m*.plan.md` and `../inputs/sso.login.input.md` opens. An error state here strands the reviewer at the entry point | Plans present |
| 6 | **Realm and callback are consistent** | `grep -rn "homelab\|my-url.dev.br\|auth/keycloak/callback\|auth/sso/callback" .ia_context/plans/sso-login*` | Realm is `homelab`; issuer is `sso.my-url.dev.br/realms/homelab`; the production redirect is `https://eldritch-api.my-url.dev.br/auth/keycloak/callback`. The SPA's `/auth/sso/callback` appears **only** as the thing not to use | m1 § 5 |
| 7 | **Provider switch has all four states** | Read m1 § 3, `oauthProvidersFromEnvironment` | Full Keycloak ⇒ `{keycloak}` only; half-configured ⇒ throws at boot naming the missing variable (error state); absent ⇒ direct providers as today; nothing configured ⇒ `[]` (empty state). A missing branch here becomes a runtime surprise in m1 | m1 contract |
| 8 | **Linking and mail rules are covered** | Read m1 § 3–4 and m2 § 3 with the index's D4 | Known pair ⇒ no notice, no link; both-sides-verified address ⇒ link plus exactly one notice; new account ⇒ no notice; mail failure swallowed (error state). Unverified address must not link | m1 tests, m2 contract |
| 9 | **Deletion contract matches across plans** | Cross-read m2 § 3, m3 § 3, m4 behaviour table | Same status codes (`400 invalid_confirmation`, `401 unauthenticated`, `403 invalid_password`, `429 too_many_attempts`), same `hasPassword` rule, same case-sensitive `DELETE` word. A divergence here is a bug the implementation will faithfully reproduce | m2/m3/m4 |
| 10 | **Logout survives deletion** | Read m2 § 3, guard table | `UserSessionGuard` (signature + account exists) on `/me`, `/me/matches`, `/auth/game-ticket`, `DELETE /auth/account`; **logout keeps `SessionGuard`**, so a deleted account can still clear its cookie (204). If logout moves to the existence guard, a deleted player is stuck with a cookie that cannot be cleared | m2 guard table |
| 11 | **Match consumer has a stop condition** | Read m2's matches section | `store` returns `'stored'`/`'duplicate'`/`'user-gone'`; the consumer deletes on all three and keeps only thrown errors. Without `'user-gone'` the queue retries a deleted player forever | m2 contract |
| 12 | **No migration, and the reason is stated** | `grep -rn "migration" .ia_context/plans/sso-login*` | The plans say no migration and point at `identities.provider` being `text`. If a migration reappears, ADR 0018's key rule is being contradicted | Index schema note |
| 13 | **Input divergences are all answered** | Compare `sso.login.input.md` against the index's divergence table | All eleven rows present (Prisma/TypeORM, `users.*_id`, `password_hash`, `user_sessions`, `battle_history`, SPA bearer, passport, `oidc-client-ts`, `.hbs`, router/toast, `VITE_KC_*`). A missing row means a silently ignored input requirement | Index table |
| 14 | **Every plan has the mandatory sections** | Open m1–m5 | Header, § 1 objective, § 2 files, § 3 layer contract, § 4 tests, § 5 dependencies, § 6 out of scope. No empty section and no placeholder | Five plans |
| 15 | **Frontend order and dependencies hold** | Read index dependency notes and m3/m4/m5 § 5 | logic → integration → design; m3 depends on m2's contract, not its merge; m4 on m3 approved; m5 on m4 approved. A reversed dependency would put design before logic | Index, plans |
| 16 | **Repository is still English-only** | `grep -P "[\x{00C0}-\x{017F}]" .ia_context/plans/sso-login*` | No Portuguese prose in repository content. The conversation with the owner stays in Portuguese; the files do not | — |

## 2. Code checklist

- [ ] The diff contains no application code; `frontend/.env.production` is the only file outside `.ia_context/`, and it is intentional.
- [ ] `frontend/.env.production` has exactly one `VITE_API_URL`, a trailing newline, and no value that looks like a secret.
- [ ] The `VITE_KC_*` variables are either removed or explicitly accepted as unused under D1.
- [ ] Plan links are relative and resolve from `.ia_context/plans/`.
- [ ] Statuses, dates and PR numbers are internally consistent (index ↔ plan headers ↔ `git log`).
- [ ] `eldritch-alley` is used as the **client id**, never as the realm; the realm stays `homelab`.
- [ ] No plan reintroduces bearer tokens, a session table, `users.*_id` columns or a migration — all contradict ADR 0018/0021.
- [ ] No TODO, placeholder or empty section in any of the five plans.
- [ ] No secrets or production credentials in the plans or the env file.
- [ ] `git diff --check origin/develop..HEAD` reports no whitespace error (it will not flag the missing EOF newline; check that by eye or with `tail -c1`).
- [ ] The commit message matches the diff (today it announces an implementation) and ends with the `Co-Authored-By` trailer.

## 3. Behaviour checklist, by flow

**Gate flow — the bookkeeping the delivery starts from**
- [ ] The M4 index opens with "m4-01 to m4-04 approved and merged (2026-10-17), m4-05 pending".
- [ ] The re-check paragraph names PR #26, #27, #27 and #28 for the right milestones.
- [ ] The three corrected plan headers agree with the index.

**SSO plan flow — m1 read-through**
- [ ] A deployment that sets the three Keycloak variables sees one provider and no direct buttons.
- [ ] A deployment that leaves them unset behaves exactly as today.
- [ ] A half-configured set stops the boot and names the missing variable.
- [ ] The linking notice is sent once, only when an existing account gains a way in, and its failure does not fail the sign-in.
- [ ] The realm table states the client is confidential and the redirect is the API callback.

**Deletion plan flow — m2 read-through**
- [ ] `DELETE` (exact, case-sensitive) is the confirmation; anything else is `400`.
- [ ] The password is required only when a usable password credential exists.
- [ ] The old cookie stops working on user routes after deletion, and logout still answers 204.
- [ ] A match ending after deletion is dropped, not retried.

**Client plan flow — m3 → m4 → m5**
- [ ] The deletion outcome model covers deleted, signed-out, confirmation, password, throttled, offline and unknown.
- [ ] The security card is reachable from the profile card and closes back into the account dialog.
- [ ] The deletion card hides the password field when `hasPassword` is false.
- [ ] The design plan adds contrast cases for the danger text, border and focus ring, and invents no colour.

**Deployment flow**
- [ ] The env file's hosts match the plan's production issuer/callback host.
- [ ] The plan does not depend on any `VITE_KC_*` value.

**Review/PR flow**
- [ ] One branch and one PR for m1–m5 is recorded as D7; the PR column is empty until each milestone opens.

## 4. Known gaps, deliberately not closed

- **ADR 0022 does not exist yet.** It is written in m1; the index and m1 § 5 record what it must say.
- **No milestone is implemented.** This MR is the plan; m1–m5 remain pending, and m4-05 (privacy) is untouched.
- **No Keycloak in `docker-compose.yml` and no realm as code.** The realm is deployment; the plan documents its required settings instead of shipping them.
- **The client-type decision is operational.** If the realm already holds `eldritch-alley` as a public SPA client, it must be switched to confidential or a second client created for the API — the server-side flow needs a secret.
- **`VITE_KC_*` remain unused** under D1; they can be removed in the first frontend milestone.
- **`frontend/.env.production` has a duplicate `VITE_API_URL` and no trailing newline**; this is a defect of this MR, not of the plan.
- **The commit message overstates the deliverable**; rework or split suggested before opening the PR.
- **No migration is by design** — the schema already carries the per-provider fields; the one considered migration (the brokered upstream IdP) is deferred until something reads it.

### Suggested commit split

If the owner prefers the repository rule of one subject per commit:

```
docs(plans): mark m4-01 to m4-04 approved and merged
  .ia_context/plans/m4-accounts-and-persistence.index.md
  .ia_context/plans/m4-02-auth.plan.md
  .ia_context/plans/m4-03-match-recording.plan.md
  .ia_context/plans/m4-04-client.plan.md

docs(plans): plan optional Keycloak SSO and self-service account deletion
  .ia_context/plans/sso-login.index.md
  .ia_context/plans/sso-login-m1-keycloak-provider.plan.md
  .ia_context/plans/sso-login-m2-account-deletion.plan.md
  .ia_context/plans/sso-login-m3-logic.plan.md
  .ia_context/plans/sso-login-m4-integration.plan.md
  .ia_context/plans/sso-login-m5-design.plan.md

chore(frontend): point production build at my-url.dev.br hosts
  frontend/.env.production
```
