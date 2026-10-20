# 0022. Optional SSO through Keycloak, and self-service account deletion

**Status:** Accepted (2026-10-17). Supersedes ADR 0018 decision 1 (the provider list).

## Context

ADR 0018 gave the platform a server-side OAuth code flow with PKCE, a signed `ea_session` cookie and a
linking rule that turns on the `(provider, provider_user_id)` pair. The deployment now runs a Keycloak
realm that already brokers Google and GitHub, and the owner asked for the platform to be able to use it
— **without** giving up the direct providers, because the project has to run for people who have no
realm at all.

The same delivery has to give a player a way out. ADR 0018 recorded that logout cannot end a session
because the cookie is stateless, and that server-side revocation would arrive with account deletion. The
privacy policy currently answers deletion by e-mail request; a self-service endpoint is the promise the
next delivery keeps.

## Decision

1. **Keycloak is optional, and it is independent of the direct providers.** When the three
   `OAUTH_KEYCLOAK_*` variables are set, Keycloak is built as one more provider; when they are absent it
   is off, and GitHub and Google are built exactly as ADR 0018 left them. The upstream identity provider
   Keycloak brokers is never learned or stored. The environment is the feature flag, not a build target.
2. **Each configured credential is its own button.** A realm does not replace the direct providers, even
   though it may broker them: configuring Keycloak beside GitHub and Google offers all three. The owner
   rejected the alternative — a realm that hides the direct pairs — because adopting SSO must not remove
   the apps a deployment already configured. Two ways in do not by themselves make two accounts: the
   shared rule below links the second one when both sides verified the same address. The direct
   providers' existing `identities` rows stay readable either way, and turning the realm off changes no
   data.
3. **The realm is configured, not discovered.** The issuer is the realm's URL, and the three standard
   endpoints are composed from it while the container starts — the same reasoning ADR 0018 decision 8
   gives for GitHub and Google. Half a credential stops the boot, naming what is missing.
4. **The sign-in flow does not change.** Authorization code with PKCE and `state`, server-side code
   exchange, the `ea_session` cookie, the `ea_oauth` flow cookie. No token reaches the client, no route
   learns to read an `Authorization` header, and there is no SPA OIDC client. The Keycloak client is a
   confidential client whose redirect URI is the API's callback, never the client's.
5. **The linking rule is unchanged.** The `(provider, provider_user_id)` pair decides which account a
   sign-in belongs to; an address only adds a way in when both sides reported it verified. An SSO
   identity links like any other; two accounts with different addresses are never merged.
6. **A link is announced by mail.** A sign-in that adds an identity to an existing account sends one
   notice to the verified address, with no link and no token. A mail that fails to send is logged and
   does not fail the sign-in.
7. **Account deletion is self-service, immediate and irreversible.** `DELETE /auth/account` takes an
   exact confirmation word, and the account's password when it has one; it removes the user, and every
   row that hangs off it cascades. No grace period, no soft delete, no export.
8. **Revocation is by account existence, not by a session store.** The cookie stays stateless. The
   routes that act for a user verify that the account still exists; logout does not, so a deleted player
   can still clear a cookie that no route honours. A match that ends after its player was deleted is
   dropped by the platform's consumer instead of being retried forever.
9. **The provider-id pair remains the only account key.** No `users.google_id`, `users.keycloak_id` or
   equivalent column is added: `identities` already stores the provider, its user id and the address,
   one row per way in.

## Consequences

- A deployment with a realm adds a button and inherits the realm's providers, policies and MFA; the
  direct buttons it already had stay where they are. A deployment without a realm keeps today's two
  buttons and loses nothing.
- Switching the realm on or off changes the buttons and no data: there is no session migration because
  there is no session table.
- A deleted account loses every way in at once, including password reset. Its game tickets issued before
  deletion remain valid for at most five minutes, which is the window ADR 0018 already accepts for a
  ticket and is shorter than any token the other designs considered.
- The privacy policy must state that deletion is self-service when m4-05 writes it; until then the
  index carries the handoff and the policy keeps the e-mail sentence.
- A player who signs in with SSO and has no password cannot use "forgot password", and cannot add a
  password from the client in this delivery. That is consistent with ADR 0021, which only resets
  existing password identities.
