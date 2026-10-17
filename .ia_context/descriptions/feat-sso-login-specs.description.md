# MR — Keycloak SSO and self-service deletion: the planning package

**Branch:** `feat/sso-login-specs`
**Comparison base:** `develop`
**Milestone:** — (planning; no application code)
**Ticket(s):** —
**Date:** 2026-10-17

## 1. What this MR delivers

It delivers the planning package for the next delivery — an **optional** Keycloak in front of sign-in and a self-service account deletion — as one index and five milestone plans, and it corrects the stale M4 statuses that were blocking the milestone gate. It contains no application code: after this MR the next milestone can be executed, not used. The non-obvious decisions are recorded in the index: Keycloak enters as one more server-side `OAuthProvider` behind the existing `ea_session` cookie instead of a SPA OIDC client, the environment is the switch (Keycloak configured ⇒ it is the only button; absent ⇒ Google and GitHub exactly as today), and `identities` already is the per-provider store, so the delivery adds **no migration**. One divergence from the approved planning conversation is in the diff: the owner's change to `frontend/.env.production` travels in the same commit even though no plan depends on it.

## 2. What changed and why

| File | What changed | Why it matters |
|------|--------------|----------------|
| `.ia_context/plans/sso-login.index.md` | New index: decisions D1–D9, the milestone gate checked against the repository, dependency notes, test strategy and the input-vs-repository divergence table | It is the contract the five plans are reviewed against. It records why the input's SPA/PKCE architecture, `users.*_id` columns and session table were **not** adopted, so the reviewer does not have to re-litigate them |
| `.ia_context/plans/sso-login-m1-keycloak-provider.plan.md` | New plan for the provider: `KeycloakProvider`, the environment precedence rule, the linking notice mail, ADR 0022 and the realm/deployment table | When the milestone lands, a deployment sets three variables and offers one SSO button that brokers Google and GitHub; leaving them unset keeps today's direct sign-in. The plan also names the operational trap: the client must be confidential and its callback is the API's, not the SPA's |
| `.ia_context/plans/sso-login-m2-account-deletion.plan.md` | New plan for `DELETE /auth/account`: confirmation, optional password, cascade, `UserSessionGuard`, `hasPassword`, and the match consumer's `user-gone` outcome | A player can leave and take everything with them; every device loses the session because user-scoped routes now check the account still exists. It also closes the retry loop that a match ending after deletion would otherwise cause |
| `.ia_context/plans/sso-login-m3-logic.plan.md` | New plan for the client's pure half: `deleteAccount`, `hasPassword`, the confirmation/refusal model and the copy keys | It fixes the rules the screen will follow — exact `DELETE` confirmation, password sent only when the account has one, signed-out treated differently from a refused deletion |
| `.ia_context/plans/sso-login-m4-integration.plan.md` | New plan for the markup and the card wiring: the security card and the deletion card, with ids and behaviour table | It keeps the feature inside the existing account dialog, which is the repo's screen pattern; the behaviour table is what the manual run checks after implementation |
| `.ia_context/plans/sso-login-m5-design.plan.md` | New plan for the styles: one new muted class and one danger class over the existing tokens, plus the contrast-matrix additions | The destructive action becomes recognisable without inventing colours, and the contrast floor stays testable |
| `.ia_context/plans/m4-accounts-and-persistence.index.md` | Status line, rows for m4-02/m4-03/m4-04 and a dated re-check paragraph | The index now says m4-01 to m4-04 are approved and merged, with PR numbers, so the gate no longer blocks on stale bookkeeping |
| `.ia_context/plans/m4-02-auth.plan.md`, `m4-03-match-recording.plan.md`, `m4-04-client.plan.md` | Header status line only | Same correction in the three plans: approved on 2026-10-17 and merged (PR #27, #27, #28) |
| `frontend/.env.production` | Production hosts changed to `my-url.dev.br`, and `VITE_KC_*` / `VITE_APP_URL` added | Deployment preparation, not part of the planning deliverable. Under D1 the client never reads the Keycloak variables, and the file now carries a duplicate `VITE_API_URL` — see § 4 |

## 3. Notes for the reviewer

- **The commit message overstates the diff.** It announces "implement self-service account deletion and SSO integration"; the branch contains plans and status corrections only. Consider reworking the commit message (or splitting the branch) before merging, so history does not claim an implementation that is still pending.
- **`frontend/.env.production` is not part of the plan.** It is the owner's deployment change and it should either be cleaned up here or carried in its own commit/MR. It currently has a **duplicate `VITE_API_URL`**, no trailing newline, and three `VITE_KC_*` values the chosen architecture (D1) never reads.
- **No migration is deliberate, not an omission.** `identities.provider` is a `text` column and the table already stores provider id, address and verification, one row per way in. Adding `users.keycloak_id` (or `google_id`) would create a second answer to the question ADR 0018 settled; the index's schema note explains this and records the one migration that was considered and deferred.
- **ADR 0022 is referenced but not in the diff.** The index schedules it for m1; that is the decision record for the optional provider, the cookie session and the deletion's revocation promise.
- **Milestone 0 is inside this commit.** The M4 status correction is the change that unblocks the gate, so the implementation branch can start at m1 without carrying bookkeeping.
- **One branch, one PR for m1–m5** is the owner's decision (D7); the PR column in the index is filled as each milestone opens.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
