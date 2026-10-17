# Plan — m4-04 · Client: sign-in, profile and battle history

**Milestone:** m4-04
**Parent feature:** m4-accounts-and-persistence
**Created:** 2026-10-16
**Status:** approved (2026-10-17) — delivered on `feat/client-login` and merged in PR #28
**ADR:** none. ADR 0009 already covers the localization these screens follow, and the client's own decisions here are screens, not architecture

## 1. Objective

The title screen offers signing in with GitHub and Google without ever requiring it: playing as a guest
stays the default action and stays one click away. A signed-in player gets a profile panel — name,
avatar, the three agents with class and level, and sign out — and a battle history panel with date,
map, result and number of rounds. When a signed-in player starts a match, the client asks the platform
for a game ticket and joins with it; when nobody is signed in, the join is exactly today's.

## 2. Delivery order

Three steps, in the order the planning workflow asks for and the onboarding delivery already followed
(`.ia_context/plans/onboarding.index.md`). **Owner decision (2026-10-17): the three steps are committed
one per commit on the same branch, `feat/client-login`, and reviewed as one PR.** That supersedes the
"three PRs, one branch each" this section carried when the plan was written; the index is corrected to
match.

| Step | What it delivers | Files |
|---|---|---|
| **1 · Logic** | The pure modules: talking to the platform, the account state, the history's pagination, the sign-in flow, the copy and the two panel views. No DOM, no Phaser | `frontend/src/api/`, `frontend/src/account/{types,session,history,auth-flow,copy,panel,history-panel}.ts`, `frontend/src/config.ts`, their tests |
| **2 · Integration** | The wiring: the boot screen, the ticket in the join, the DOM halves of the dialog, the profile, the history and the two mailed-link pages, the markup and the catalogs | `frontend/src/boot.ts`, `boot-screen.ts`, `frontend/src/net/{session,join-with-ticket}.ts`, `frontend/src/title/title.ts`, `frontend/src/account/{account,mail,mail-page,live}.ts`, `frontend/index.html`, the i18n catalogs, the env files, their tests |
| **3 · Design** | The styles, the contrast floor and the stacking check, in the `visual-identity` convention | `frontend/src/account/{account.css,contrast.test.ts,layers.test.ts}` |

Two files this plan listed for Integration were **not** touched, and the reasons are the plan's own:
`title/connect-flow.ts` keeps its `idle → connecting → ready/failed` machine, because the wait for the
ticket fits inside `connecting` and the ticket rule belongs to the network (`net/join-with-ticket.ts`);
`title/copy.ts` keeps the title's lines, because the account's copy is `account/copy.ts`. `title.css`
needed no anchor point: the account's cards stand outside `main.title` and carry their own sheet.

## 3. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `frontend/src/api/client.ts` | create | `createApi(baseUrl, fetchImpl)`: `me()`, `gameTicket()`, `logout()`, `matches(cursor)`. `credentials: 'include'` on every call, one place |
| `frontend/src/api/errors.ts` | create | The failure kinds the screens react to: offline, refused, unknown |
| `frontend/src/account/types.ts` | create | `Profile`, `Agent`, `MatchSummary`, `AccountState` |
| `frontend/src/account/session.ts` | create | `loadAccount`, `signOut`, and the state a screen reads |
| `frontend/src/account/history.ts` | create | The pagination state machine: a page, a next cursor, loading, exhausted |
| `frontend/src/account/panel.ts` | create | The profile panel: what it draws, and the two things it emits (sign out, open history) |
| `frontend/src/account/history-panel.ts` | create | The history list, its rows and its "load more" |
| `frontend/src/account/account.css` | create | The panel styles, in the title's own language |
| `frontend/src/account/contrast.test.ts` | create | The contrast floor, as `title/contrast.test.ts` does it |
| `frontend/src/config.ts` | modify | `VITE_API_URL` and `apiBaseUrl(env)`, with the same rule `gameServerEndpoint` has |
| `frontend/src/config.test.ts` | modify | Section 5 |
| `frontend/src/title/title.ts` | modify | The account loaded once on boot, and the join with a ticket |
| `frontend/src/title/connect-flow.ts` | **not changed** | The wait for the ticket fits inside `connecting`; the ticket rule lives in `net/join-with-ticket.ts` |
| `frontend/src/title/copy.ts` | **not changed** | The account's lines live in `account/copy.ts` |
| `frontend/src/net/session.ts` | modify | `open(options?: { ticket?: string })`, passed to `joinOrCreate` |
| `frontend/src/net/session.test.ts` | modify | Section 5, plus `net/join-with-ticket.test.ts` |
| `frontend/index.html` | modify | The account control, the three cards, the mail page, and the Portuguese fallback text the page shows before its script runs |
| `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | The new `account.*` and `mail.*` keys, both locales |
| `frontend/.env.example`, `frontend/.env.production` | modify | `VITE_API_URL`, with the development and production values |
| `frontend/src/title/title.css` | **not changed** | The account's sheet carries its own anchors; `account.css` borrows the title's tokens |
| `.ia_context/plans/m4-accounts-and-persistence.index.md` | modify | The milestone marked delivered, and the single-branch decision |

## 4. Contract of the layer

**The API client.** One factory, one place that knows the base URL and the credentials mode:

```ts
export interface Api {
  me(): Promise<Account | null>;              // null is a 401: nobody is signed in. Not an error
  gameTicket(): Promise<GameTicket>;          // { ticket, expiresAt }
  logout(): Promise<void>;
  matches(cursor?: string): Promise<MatchPage>; // { matches, nextCursor }
}
export function createApi(baseUrl: string, fetchImpl: typeof fetch): Api;
```

A `401` from `me()` is **not** a failure: it is the answer that says the player is a guest, and the
title renders exactly as it does today. A network failure is a different kind and is reported as one,
because the two lead to different screens: "you are not signed in" is silent, "the platform did not
answer" is said out loud.

`apiBaseUrl(env)` follows `gameServerEndpoint` in `config.ts`: a declared value must be an `http://` or
`https://` URL, an undeclared one falls back to `http://localhost:3000` **only** under `vite dev`, and
anywhere else it throws, so a build with no platform fails at load instead of calling the player's own
machine.

**The account state.** `AccountState` is `{ status: 'guest' }` or `{ status: 'signed-in', profile,
agents }`. One load on boot, and the panels read it. Nothing polls: the state changes when the player
signs in, signs out, or reloads.

**The ticket in the join.** `connect-flow` decides once, at press time:

| Account | The join |
|---|---|
| Guest | `connect()`, exactly as today. No request to the platform, no wait |
| Signed in | `gameTicket()`, then `connect({ ticket })`. A ticket that could not be fetched is not a failure: the join goes ahead as a guest, because playing is the default and signing in is not a precondition |

A join the server refuses because the ticket is expired or badly signed is retried **once**, without the
ticket. The player gets a match either way; the alternative — an error card for a ticket that expired
while they were reading the title — is a worse answer to a problem the player cannot act on.

**The panels.** The profile panel shows the display name, the avatar, one row per agent (class and
level) and sign out. The history panel shows one row per match — date, map, result, rounds — and loads
the next page only when the player asks. An empty history says so; it is not an error and it is not an
empty box.

**What this layer does not do.** No release-emails checkbox and no privacy link inside the panel: both
arrive in m4-05, additively, in the same panel. No replay screen. No guest-to-account migration of
anything, because nothing about a guest is stored. No account deletion — the privacy policy says that
is an e-mail request in this delivery.

## 5. Tests planned

**Logic (step 1)**
- [ ] `me()` answers `null` on a `401` and the account on a `200`, and never throws for the first.
- [ ] A network failure and a `500` are reported as distinct kinds.
- [ ] Every call carries `credentials: 'include'` — asserted on the fake fetch, because a single missing
      one is a silent logout.
- [ ] `apiBaseUrl` accepts an `http(s)` URL, falls back to the development value under `vite dev`, and
      throws on anything else, naming the variable (the mirror of `gameServerEndpoint`'s cases).
- [ ] `loadAccount` answers the guest state on `null`, and the signed-in state with the agents in the
      order the platform sent them.
- [ ] `history` asks for the first page with no cursor, keeps the cursor the platform answered, appends
      the second page, and stops asking when `nextCursor` is null.
- [ ] A page that arrives while another is in flight does not duplicate a row.

**Integration (step 2)**
- [ ] The title boots with no account: the guest call to action is enabled and unchanged, and the
      sign-in control is present and inert until pressed.
- [ ] Pressing the guest call to action sends **no** request to the platform (asserted on the fake).
- [ ] Pressing it signed in fetches a ticket and joins with it, and the join options carry it.
- [ ] A ticket request that fails joins as a guest, and the player reaches a match.
- [ ] A join refused for the ticket is retried exactly once, without it.
- [ ] Signing out clears the panel and returns the title to the guest state.
- [ ] The panel's lines come from the catalogs in both locales, and a key missing from either is a
      compile error, as `catalog.test.ts` already enforces.
- [ ] The markup a page shows before its script runs carries the same text as the catalog's Portuguese,
      the rule `index.html` already follows.

**Design (step 3)**
- [ ] Every new text and control passes the client's contrast floor, with the same test shape as
      `title/contrast.test.ts` and `onboarding/contrast.test.ts`.
- [ ] The panel is usable at phone width, with the page's own gutter, and does not scroll the page
      sideways.
- [ ] The panels sit above the title's text and below the onboarding overlay, in the order the title's
      own stacking comments describe — a check in the same spirit as `scenes/depth-usage.test.ts`,
      because this is the second overlay the title grows and the first one already needed a note about
      stacking contexts.

## 6. Dependencies

- **Logic** depends on m4-02's and m4-03's contracts being frozen, not on their PRs being merged: the
  step is built against a fake `fetch`, in the same way the match client was built against a mocked
  server.
- **Integration** depends on Logic approved. It is the step that needs a running platform to be tried
  in a browser, and it can be reviewed without one.
- **Design** depends on Integration approved. There is no approved design for these panels, so this step
  proposes one and tests its contrast floor, as the onboarding's design step did.
- A running platform with a real OAuth app for the browser run; the automated tests need neither.

## 7. Decisions

**D1 · The guest path never touches the platform.** The title's default action makes no network request
it did not make before this milestone. This is the spec's "playing as a guest stays one click away and
stays the default action" expressed as a test rather than as an intention, and it is also what keeps the
game playable when the platform is down — the match server and the platform fail independently.

**D2 · The ticket is fetched at press time, not on boot.** A ticket lasts five minutes; a player who
reads the title for six minutes would arrive at the join with a dead one. Fetching at press time makes
that window the length of the join.

**D3 · A refused ticket falls back to a guest join, once.** See section 4. The alternative is an error
the player cannot act on.

**D4 · The panels are DOM, like the title and the onboarding.** ADR 0009 and the onboarding's decision
D1 put every screen that is not the board in the document. Phaser draws the match; it does not draw a
list of past matches.

**D5 · `VITE_API_URL` and not a path on the game server's origin.** The two services are deployed
separately (Cloudflare for the client, the ALB for the backends), they have different hosts, and the
cookie's domain is what lets the browser send it. A relative path would tie the client's build to being
served from the platform's origin, which it is not.

## 8. Note — what m4-02 hands this milestone (2026-10-16)

Written while m4-02 was being applied, because two of its amendments are work that lands **here** and
were deliberately left out of that PR. Neither is in section 3's file list yet, and both belong in
**Integration** (step 2), not in Logic.

**The provider buttons are a list, not a pair.** m4-02 § 8 made the OAuth apps optional, and
`GET /auth/providers` is how the client learns which ones this deployment has: `{ providers: ['github'] }`
or `{ providers: [] }`. The title draws one button per name and **none at all** when the list is empty —
a deployment with no OAuth app must not show a button that answers 404. A failure to fetch that list is
not an error to report: it means the OAuth buttons are not drawn, and the address-and-password form
below is still there.

**There is a second way in, and it is a form.** m4-02 § 9 added six routes under `/auth/password`
(ADR 0021): register, resend, verify, login, forgot, reset. This milestone's title screen gains the form
that drives four of them — sign in, sign up, "I forgot my password" and "resend the message" — and the
client the two pages the mailed links land on:

| Route in the mail | The page | What it does |
|---|---|---|
| `GET ${CLIENT_ORIGIN}/verify-email?token=…` | `/verify-email` | Reads the token out of the query string and shows one button; the button `POST`s it to `/auth/password/verify` |
| `GET ${CLIENT_ORIGIN}/reset-password?token=…` | `/reset-password` | Reads the token, asks for the new password and its confirmation, and `POST`s both to `/auth/password/reset` |

**A page and not a direct link to the API, and the button is not decoration** (ADR 0021, D12): mail
scanners, link previews and antivirus proxies fetch every URL in every message, so a `GET` that spent
the token would be spent before the player ever saw it. The page reads the token and the click spends it.
Both pages answer the same way afterwards — an unreadable, expired or already-spent token is
`400 invalid_token`, and the page says so and offers the form again rather than an empty screen.

The form's own refusals are the ones section 4 already describes for `me()`: `401 invalid_credentials`
and `403 email_not_verified` are answers the player acts on, a network failure is a different kind and
is said out loud. Registration always answers `202`, whether or not the address has an account, and the
page must say the same thing in both cases — "check your mailbox" is the whole answer, and it is the
only one that does not turn the form into a way to ask which addresses have accounts.


## 9. How the milestone closed (2026-10-17)

The three steps were applied on `feat/client-login` and left uncommitted for the owner, one commit per
step as § 2 now says. What shipped, beyond this plan's original sketch, is named in § 2.

**The pure half is where the decisions live.** `api/client.ts` (one `credentials: 'include'`),
`account/session.ts` (the store), `account/history.ts` (pagination), `account/auth-flow.ts` (the steps
of the dialog), `account/copy.ts`, `account/panel.ts`, `account/history-panel.ts`, `account/mail.ts`,
`net/join-with-ticket.ts` and `boot-screen.ts` are all tested in node. The DOM halves — `account/account.ts`,
`account/mail-page.ts`, `boot.ts` — are thin by the repository's convention and are not tested.

**Tests.** 1023 frontend tests pass (`npm test -w @eldritch-alley/frontend`), 18 of them from this
milestone's design step: twelve in `account/contrast.test.ts` (every pair on the title's palette, the
borrowed tokens, and no invented colour) and six in `account/layers.test.ts` (the cards in the notice's
layer, the control in the switcher's, the board above both, and the control and the cards outside
`main.title`). The build (`tsc --noEmit && vite build`) passes, and the emitted chunks show the mail page
in its own chunk — the title's Phaser bundle is not loaded on a mailed link.

**The gap the suite cannot close.** There is no DOM in any test here, so the items of § 5 that name
elements are asserted on the pure views they render (`profileView`, `historyView`, `mailView`,
`screenFor`) and on `index.html` read as text, as `onboarding/layers.test.ts` already reads it. The
browser run stays the owner's manual proof: register, read the token in the `LogMailer` log, sign in,
see the profile and the squad, play a match, see it in the history, sign out, and start a match with the
platform off. The OAuth buttons need the real applications registered (m4-02 § 8) and are exercised by
neither the suite nor the run without them.

**Still open.** The divergence m4-03 recorded — `/me` answers 401 for an account deleted behind the
session's back while `/me/matches` answers 200 empty — is unchanged. The client asks `/me` first, so it
signs out and never draws that empty history; the decision between DT-92 and m4-05 remains the owner's.
