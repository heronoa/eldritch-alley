# Plan — SSO through Keycloak (backend)

**Milestone:** m1
**Parent feature:** sso-login
**Created:** 2026-10-17
**Status:** approved (2026-10-17)
**ADR:** 0022, written in this milestone

## 1. Objective

Keycloak becomes one more OAuth provider behind the flow m4-02 already built. It is independent of the
direct providers: when it is configured it joins the list of buttons, and when it is not the direct
Google and GitHub providers are exactly what they are today. The contract this milestone hands to the
client is the existing one: a list of provider names, one redirect, one callback, one cookie.

A first sign-in that links a new SSO identity to an existing account sends a notice to the address, so
that the owner of the account learns about a new way in.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `backend/platform-api/src/auth/keycloak.provider.ts` | create | `KeycloakProvider` over `openid-client`: the realm's four endpoints, the `openid profile email` scope, PKCE S256, and the ID-token claims mapped to `ProviderProfile`. The claim mapping is a pure exported function so a test can read it without a network |
| `backend/platform-api/src/auth/provider.ts` | modify | `'keycloak'` enters `OAuthProviderName` and `PROVIDER_NAMES`; `OAUTH_KEYCLOAK_CLIENT_ID`, `OAUTH_KEYCLOAK_CLIENT_SECRET` and `OAUTH_KEYCLOAK_ISSUER` join the credential table; the factory builds `KeycloakProvider`; `oauthProvidersFromEnvironment` builds every configured provider independently (the realm joins the direct pairs, it does not replace them) |
| `backend/platform-api/src/db/entities/identity.entity.ts` | modify | `ProviderName` gains `'keycloak'`. The column is `text`; **no migration** |
| `backend/platform-api/src/auth/auth.service.ts` | modify | `SignInResult` gains `linked: boolean` — true only when an identity was added to a user that already existed. `created` keeps its meaning |
| `backend/platform-api/src/auth/oauth.controller.ts` | modify | After a sign-in that linked, send the notice through `MAILER`; a mail failure is logged and does not fail the sign-in. The controller already owns the callback, so the notice lives where the link is observed |
| `backend/platform-api/src/email/messages.ts` | modify | `linkedAccountMessage(to, provider)` — plain text, English, no link to click, no token |
| `.env.example` | modify | The three Keycloak variables and the independence sentence: setting them adds a button and hides none |
| `docker-compose.yml` | modify | The three variables passed through to `platform-api` the way the other `OAUTH_*` pairs are |
| `docs/adr/0022-sso-through-keycloak.md` | create | The decision record (see § 5) |
| `docs/adr/README.md` | modify | The 0022 row |
| `backend/platform-api/src/auth/keycloak.provider.test.ts` | create | Section 4 |
| `backend/platform-api/src/auth/provider.test.ts` | modify | Independence and the new credential pair |
| `backend/platform-api/src/auth/auth.service.test.ts` | modify | `linked` on the three outcomes |
| `backend/platform-api/src/auth/oauth.controller.test.ts` | modify | Keycloak start/callback, the notice, and the direct providers still listed beside it |
| `backend/e2e/src/player-journey.test.ts` | modify | One case with a fake Keycloak and a fake GitHub in the same container |

## 3. Layer contract

**Provider names.** `OAuthProviderName` is `'github' | 'google' | 'keycloak'`; `ProviderName` (the column)
is the same three plus `'password'`. `PROVIDER_NAMES` lists `keycloak` first, then the two direct ones,
so the answer to `GET /auth/providers` is stable when it changes shape.

**`oauthProvidersFromEnvironment(): OAuthProviders`** — every credential stands on its own:

- Keycloak fully configured (id, secret and issuer) → `{ keycloak }` joins the direct providers,
  if any are configured. A realm does not replace or hide them.
- Keycloak partly configured → throws while the container is built, naming the missing variable. A typo
  must stop the boot, not the first sign-in.
- Each direct pair fully configured → `{ github?, google? }`, built exactly as today.
- Nothing configured → `{}`, and `GET /auth/providers` answers `[]`.

**Routes** (unchanged shapes):

| Route | Answer |
|---|---|
| `GET /auth/providers` | `{ providers: OAuthProviderName[] }` — every configured provider, Keycloak first |
| `GET /auth/keycloak` | 302 to `${issuer}/protocol/openid-connect/auth` with `state`, `code_challenge`, S256; sets `ea_oauth` |
| `GET /auth/keycloak/callback` | the existing callback: state and PKCE verified, identity linked or created, `ea_session` set, 302 to `CLIENT_ORIGIN` |
| any other provider | the existing refusal |

**`SignInResult`** — `{ user, created, linked }`. `linked` is true only for the `addIdentity` branch; a
known pair and a new account are both false.

**Errors.** No new error codes. The callback's existing refusals (bad state, provider refusal, missing
ID token) are unchanged. A mail that fails to send is logged and swallowed: the player is already signed
in, and a courtesy message is not worth a 500.

**What this milestone does not do.** It does not provision a realm, validate an access token (the
platform never sees one), read roles or groups, support MFA or federated logout, or touch the client.

## 4. Planned tests

**Unit — `keycloak.provider.test.ts`:**

- [ ] The authorization URL is built from the issuer: `/protocol/openid-connect/auth`, the client id, the
      callback, `scope=openid profile email`, a state and a `code_challenge` with `S256`.
- [ ] Claim mapping: `sub`, `email`, `email_verified`, `name` (falling back to `preferred_username`, then
      the local part, then `Player`) and `picture` become a `ProviderProfile`.
- [ ] `email_verified` that is not the boolean `true` is unverified — a string `"true"` does not count.
- [ ] A token without `sub` is refused, as the other providers refuse it.

**Unit — `provider.test.ts`:**

- [ ] Keycloak alone → `['keycloak']`.
- [ ] Keycloak plus GitHub and Google → `['keycloak', 'github', 'google']`; all three are built.
- [ ] Keycloak absent → GitHub and Google as before.
- [ ] Half a Keycloak credential → throws and names the missing variable.
- [ ] Half a direct pair beside a valid realm → throws, naming the missing half.
- [ ] Keycloak needs `OAUTH_REDIRECT_BASE_URL` only when a provider is actually configured.

**Unit — `auth.service.test.ts`:**

- [ ] A known pair → `linked: false`.
- [ ] A verified address on both sides → `linked: true`, one more identity, no second squad.
- [ ] A new account → `created: true, linked: false`.
- [ ] An unverified SSO address matching a verified identity → new account, `linked: false`.

**Route — `oauth.controller.test.ts`:**

- [ ] With Keycloak configured beside the direct providers, `GET /auth/providers` answers all of them,
      and `GET /auth/github` still works.
- [ ] A Keycloak start redirects to the realm and carries the flow cookie.
- [ ] A Keycloak callback signs in, sets the cookie, redirects to the client, and `/me` answers.
- [ ] Linking to an existing account sends exactly one notice, to the verified address; a second sign-in
      sends none; a brand-new account sends none.
- [ ] A mailer that throws does not change the sign-in's answer.
- [ ] No Keycloak variables → the providers list is the direct ones and the Keycloak route is refused.

**E2E — `player-journey.test.ts`:**

- [ ] The container is given a fake Keycloak and a fake GitHub; the providers route lists both; the
      Keycloak callback signs the player in; a second callback finds the same account.

**Edge cases included above:** unverified address, missing address, mail failure, half configuration,
direct providers configured but inactive.

## 5. Dependencies

No code dependency: m4-02 is merged and this milestone reuses its provider interface, flow cookie and
linking rule.

**The owner configures Keycloak (deployment, not code).** The realm:

| Setting | Value |
|---|---|
| Realm | `homelab` |
| Client | `eldritch-alley`, **confidential** — client authentication ON, because this platform exchanges the code server-side with a secret. If the realm already holds `eldritch-alley` as the **public** SPA client the input describes, either switch it to confidential or create a second client for the API; a public client cannot carry a secret, and this flow needs one |
| Standard flow | ON; PKCE `S256` required |
| Redirect URIs | `${OAUTH_REDIRECT_BASE_URL}/auth/keycloak/callback` — `http://localhost:3000/auth/keycloak/callback` locally, `https://eldritch-api.my-url.dev.br/auth/keycloak/callback` in production. **Not** the SPA's `/auth/sso/callback` (`VITE_KC_REDIRECT_URI`): under D1 the client never talks to Keycloak |
| Identity providers | Google and GitHub, with **Trust Email ON**, so Keycloak reports `email_verified` for a brokered address |
| Audience mapper | Not needed. The platform validates the **ID token**, whose audience is the client id; the input's `aud` concern belongs to a resource server that validates access tokens, which this API does not |
| Groups | Not read. The input's full-path pitfall does not apply |

Environment:

```
OAUTH_KEYCLOAK_CLIENT_ID=eldritch-alley
OAUTH_KEYCLOAK_CLIENT_SECRET=...
OAUTH_KEYCLOAK_ISSUER=http://localhost:8080/realms/homelab   # production: https://sso.my-url.dev.br/realms/homelab
```

`frontend/.env.production` currently carries `VITE_KC_AUTHORITY`, `VITE_KC_CLIENT_ID`,
`VITE_KC_REDIRECT_URI` and `VITE_APP_URL` from the input's SPA architecture. Under D1 nothing in the
client reads them: the issuer lives in the API's `OAUTH_KEYCLOAK_ISSUER`, and the redirect is the API's
callback. They can be removed in the first frontend milestone; the plan does not use them.

**ADR 0022 records:** Keycloak is optional and independent of the direct providers, each configured
credential being its own button; the session stays the signed cookie and no token reaches the client;
the linking rule is unchanged; deletion is self-service and revokes by account existence; the provider-id
pair remains the only account key.

## 6. Out of scope

- **Realm as code.** No Keycloak container in `docker-compose.yml` and no realm import in the repository;
  the input supplies the realm as deployment and every automated test uses `FakeProvider`. A local
  Keycloak is the owner's environment, and the plan documents what it must contain rather than shipping
  it.
- **Roles, groups, multi-realm, MFA, federated logout, token exchange.** Named in the input as out of
  scope and still out.
- **A second front door for the same account.** The SSO identity links to an existing account by the
  verified address; it does not merge two accounts with different addresses.
- **Unlinking a provider, from the client or from the API.** A player cannot remove a way in.
- **Storing which upstream IdP Keycloak brokered.** It would need a column and nothing reads it; see the
  index's schema note.
