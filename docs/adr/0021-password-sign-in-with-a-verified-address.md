# 0021. Entering with an address and a password, once the address is verified

**Status:** Accepted (2026-10-16). Supersedes decision 1 of [0018](0018-oauth-sign-in-session-and-ticket.md);
decisions 2 to 11 of 0018 stand unchanged.

## Context

ADR 0018 refused passwords, and the reason it gave was not that they are insecure: it was that they bring
hashing, reset, verification mail and a breach to answer for, *"none of which this delivery has an owner
for"*. The owner has since taken that on, with an SMTP account behind it, and asked for the route that
0018 ruled out — sign up, sign in, verify the address and reset the password. This ADR is what changed
and, more usefully, what did not.

The three problems a password brings that OAuth does not:

- **An address is now something a player types, so it is no longer something a provider vouches for.**
  GitHub and Google report whether *they* verified an address, and the linking rule in 0018 § 2 turns on
  that. Nothing verifies an address a player typed until a message sent to it comes back, which is a new
  fact the schema did not have.
- **A password is a secret the platform holds**, so a database that leaks is a database that hands out
  accounts. Nothing in the platform held such a secret before.
- **Mail is an external dependency on somebody else's server**, and `npm test` and `npm run dev` must not
  acquire one.

## Decision

1. **The password is an identity, not a column on the account.** A sign-up writes a row in `identities`
   with `provider: 'password'` and the **lowercased address as its `provider_user_id`**, and the secret
   itself lives in `password_credentials`, one row per identity. Everything the platform already points
   at is the identity, so `GET /me`, the starter squad and the linking rule need no new case, and "an
   account with a password and no way in" stops being a state the schema can represent.
2. **The pair `(provider, provider_user_id)` is what keeps one password account per address**, exactly as
   it keeps one account per provider pair. `provider_user_id` being the address is the whole of the
   mechanism: the unique constraint m4-02 already has does the work, and no second uniqueness rule is
   written beside it.
3. **A password account does nothing until its address is verified.** Login answers `403`
   `email_not_verified` until a link that arrived in that mailbox has been followed. Letting an
   unverified account sign in would let anyone register with somebody else's address; and the moment the
   real owner signed in with Google, the linking rule would need a rule that does not exist to tell the
   two accounts apart. With verification first, the both-sides-verified rule of 0018 § 2 closes the case
   in both directions, and no account is ever merged into another: sign in with Google afterwards and the
   sign-in lands on the account that already has the squad.
4. **The link in the mail points at the client, and the token is spent by a `POST`.**
   `GET ${CLIENT_ORIGIN}/verify-email?token=…` is a page the player looks at and clicks; the click is what
   spends the token. A token spent by a `GET` is spent by the first machine that fetches the link, and
   mail scanners, link previews and antivirus proxies fetch every link in every message.
5. **Tokens are stored hashed, are single use and expire.** The database holds `sha256(token)` and never
   the value that was mailed, for the reason 0018 § 10 keeps a provider's refusal out of a body and the
   contact form will keep an IP out of a column: what is written down is what can be read. Verification
   is worth 24 hours and a reset 1 hour, and issuing a token spends the previous one for the same
   identity and purpose, so a mailbox read a year later is not a way in. A completed reset spends every
   outstanding token of that identity.
6. **The password hash is `node:crypto`'s scrypt.** The runtime image is `node:22-alpine`, which is musl:
   `argon2` would put `python3`, `make` and `g++` into the build stage, and `@node-rs/argon2` would put
   platform-specific optional packages into a lockfile resolved on glibc. Argon2id is the better hash on
   the merits; it is not better by enough to justify a native build in this image. Parameters are
   `cost 2^15, blockSize 8, parallelization 1`, written into the stored value so they can be raised later
   without a migration, and `maxmem` is raised to twice what those require because the default ceiling is
   exactly what they need. Comparison is `timingSafeEqual`. A login for an address with no credential
   still derives a hash, so that "this address has an account" cannot be read off the clock.
7. **The mailer has two adapters and the environment picks one.** With the five `EMAIL_*` values the
   platform sends through the configured server; with none of them it writes the message to the log and
   opens nothing. This is § 8's rule for the OAuth apps applied to the other external credential: an
   account on a third party's server must not be the reason a contributor cannot boot the project or the
   suite fails. Half a set stops the boot, naming every missing variable, because half a set is a typo
   and a mailer that silently swallows a password reset is worse than a container that refuses to start.
8. **Failed sign-ins are counted in memory, per address and per IP, and the ADR says what that is worth.**
   Ten failures per address and a hundred per IP in a fifteen-minute sliding window; a successful sign-in
   clears the address's counter. It is in the process, alongside the flow's spent-`state` map, because the
   platform is one process and this milestone adds no infrastructure. **The honest limits:** a restart
   clears every counter; a second instance would count half of what arrives; and what the per-IP counter
   really counts is decided by the proxy in front of the platform, so behind one that does not set a
   forwarded address every player shares a single bucket.
9. **The policy is length only** — at least 12 characters and at most 128, no composition rule. Length is
   the one requirement that buys anything, and the maximum is what keeps a login from being an expensive
   way to spend the platform's CPU.
10. **Register, resend and forgot always answer `202` with the same body**, whether or not the address has
    an account, so that none of the three is a way to ask which addresses do.
11. **Both new routes reuse what OAuth already ends in.** A password sign-in ends in the same
    `signSession` call the callback ends in and sets the same `ea_session` cookie, and a sign-up creates
    the account and its starter squad through the same path as a first OAuth sign-in, inside the same
    transaction. Everything downstream of the cookie — the session, the game ticket, `GET /me` — is
    unchanged code, and this ADR changes nothing about them.

## Consequences

- **"One address is verified for one account" is held in the code and not by an index.** The plan expected
  a partial unique index over `(lower(email), user_id) where email_verified` and the implementation
  dropped it: a per-user index refuses the *linked* account holding a verified GitHub identity and a
  verified Google one — precisely the state the linking rule exists to produce — and a global one refuses
  it twice over. A `provider = 'password'` filter would only restate decision 2. What holds the
  invariant is the pair in decision 2, with the address as its second half for a password identity, plus
  the linking rule. `identity.entity.ts` records the reasoning where a reader will look for the index.
- **Accounts and addresses exist only for players who asked for one.** There is no way yet to *remove* a
  password from an account, to change an address, or to merge two accounts, and no way for a player to
  see that a password exists on theirs. All of it is account management, none of it is in this delivery,
  and the privacy policy's e-mail request is the manual path in the meantime.
- **The throttle guards sign-ins only.** `forgot` is not throttled, deliberately: it is the route that
  mails a link, and throttling it by address would let anyone lock a player out of their own reset by
  guessing their address, while throttling it by IP is the counter that shares a bucket behind a proxy.
  The cost is that `forgot` can be used to send mail to an address repeatedly; the single-use
  token-and-spend rule in decision 5 bounds what that achieves, and no mail is sent to an address that
  has no account. If it becomes a problem the fix is a per-address counter that delays rather than
  refuses, and it belongs in an ADR of its own.
- **A reset does not mark the address verified.** Verification is written in one place — the verification
  link — and a reset only replaces the secret. The reset route is nonetheless open to an unverified
  account, because the link goes to the mailbox and a mailbox that receives it is the same proof either
  way; what that account cannot do afterwards is sign in, which still needs the verification link. The
  cost is a player who chooses a new password and then finds they still have to click the older message.
- **Nothing about the engine changes.** It never sees an address, a password or a token.
