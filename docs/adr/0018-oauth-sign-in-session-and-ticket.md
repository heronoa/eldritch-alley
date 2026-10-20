# 0018. Sign-in with GitHub and Google, a stateless session and a game ticket

**Status:** Accepted (2026-10-16).

## Context

Until M4 a player was a name on a socket. The platform has to know who is asking before it can keep a
squad, a rating or a battle history, and the client is a browser: whatever proves who the player is has
to survive a page reload and cannot be read by the JavaScript the player is running.

The match server needs the same answer and must not be given the browser's credential: it runs a
simulation with a socket open to the player, and a long-lived token there is a token in a place that
will one day be logged, replayed or leaked. It also has to be able to check who a player is without a
round trip to the platform on every join.

Passwords were never on the table: they bring hashing, reset, verification mail and a breach to answer
for, none of which this delivery has an owner for.

## Decision

1. **OAuth 2.0 authorization code with PKCE and `state`, through `openid-client`, for GitHub and Google
   only.** The provider is the one that asks for the password. There are no passwords anywhere in the
   platform: no hashing, no reset, no verification e-mail, and no field to store one.
2. **The linking rule turns on the pair `(provider, provider_user_id)`.** A pair seen before signs in to
   the account it was first seen with, whatever the provider now reports about the player. A new pair
   links to an account that already has an identity with the same address **only when both sides
   reported that address as verified**; otherwise it creates a new account. An address with no identity
   behind it, or one whose verification cannot be established, never links. Addresses are compared
   lowercased, and `email_verified` is never written back to a weaker value.
3. **The rule is asymmetric on purpose.** A pair can only ever sign in to the account it created, and an
   address can only ever *add* a way in. This is the account-takeover boundary of the milestone: a
   provider that hands out an address without verifying it — or an attacker who can make one report
   somebody else's address as theirs — creates a second account rather than entering the first one.
4. **The session is a signed cookie and nothing else.** `ea_session`, an HS256 JWS signed with
   `SESSION_SECRET`, carrying the user id, a session id and when it was issued; `HttpOnly`, `Secure`,
   `SameSite=Lax`, `Path=/`, `Domain` from `COOKIE_DOMAIN`, thirty days. `Secure` is dropped only when
   `CLIENT_ORIGIN` is a loopback origin, so the local flow runs without a certificate while no
   deployment reachable from anywhere else can ship without it — the rule reads the origin and never
   `NODE_ENV`, which a host is free to leave unset.
5. **There is no server-side session store.** The cookie is the session; the platform keeps nothing
   against it. A logout clears it and that is all it does.
6. **The flow's two secrets travel in a cookie of their own.** `ea_oauth` carries the `state` and the
   PKCE verifier, signed with the same secret and `HttpOnly`, for ten minutes. The verifier is never in
   a URL: a URL is a place browsers keep things. The `state` is bound to the provider it was minted for,
   and a state this process has already spent is refused — a cookie cannot be taken back from a browser,
   so that one fact is remembered in memory, which is enough for a flow that lasts minutes and a
   platform that runs one process. Several instances would move that set to Redis.
7. **The game ticket is an EdDSA (Ed25519) compact JWS over four claims** — `iss`
   (`eldritch-alley/platform-api`), `sub` (the user id), `iat` and `exp` — worth five minutes
   (`GAME_TICKET_TTL_SECONDS`). `platform-api` holds the private key; the match server holds the public
   key and nothing else, so it can verify a ticket and can never issue one. The claims are the smallest
   set that identifies a player: no name, no address, no squad, because the ticket travels through the
   client and through a socket the player controls.
8. **The endpoints are written in the code, not discovered.** GitHub publishes no OpenID Connect
   metadata at all, and fetching Google's while the container is being built would make the platform
   refuse to start whenever Google was unreachable. Both providers' endpoints have been stable for a
   decade; the discovery document buys nothing here.
9. **One error shape, `{ code, message }`,** for every failure, so the client renders one thing: an
   unknown provider is `404`, a missing, mismatched, replayed or expired `state` is `400`, a provider
   that refuses the exchange is `502`, and a session route without a session is `401`.
10. **What a provider says when it refuses goes to the log and never to the body.** A provider's error
    can name the client, the secret and the account.
11. **CORS answers one origin**, `CLIENT_ORIGIN`, with credentials. The client authenticates with a
    cookie, and a browser sends it only when the response says credentials are allowed; every other
    origin is told nothing at all.

## Consequences

- **A logout does not end a session.** The cookie is stateless by decision D3, so a copy taken before
  the logout stays valid until it ages out — which is why the value is `HttpOnly` and why the cookie is
  the only place it lives. Server-side revocation arrives with account deletion, which the privacy
  policy handles by e-mail request in this delivery; when that endpoint is written it brings the
  revocation with it, and this ADR is where the omission is recorded.
- A ticket is a bearer token: whoever holds it can join as that player for up to five minutes. That is
  the trade for a match server that verifies a player with a public key and no round trip. The window is
  the whole of the defence, so the TTL is short and the ticket carries nothing worth stealing.
- The account that a provider reports no address for (GitHub hides a private one, and `user:email` is a
  scope a player can decline) still signs in: it takes the new-account path, and a second provider can
  never link to it by address. Linking those accounts is a manual request, and there is no endpoint for
  it in this delivery.
- A sign-in that arrives twice at the same instant for the same new pair has one of the two requests
  fail on the unique constraint rather than creating two accounts. The constraint is what makes that
  true; retrying the callback is what recovers from it, and the player does that by clicking again.
- Nothing about the engine changes. It never sees a player id and never verifies anything, and the
  ticket is checked on the way into a room, before the simulation exists.
