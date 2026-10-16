# Plan — m4-04 · Client: sign-in, profile and battle history

**Milestone:** m4-04
**Parent feature:** m4-accounts-and-persistence
**Created:** 2026-10-16
**Status:** pending
**ADR:** none. ADR 0009 already covers the localization these screens follow, and the client's own decisions here are screens, not architecture

## 1. Objective

The title screen offers signing in with GitHub and Google without ever requiring it: playing as a guest
stays the default action and stays one click away. A signed-in player gets a profile panel — name,
avatar, the three agents with class and level, and sign out — and a battle history panel with date,
map, result and number of rounds. When a signed-in player starts a match, the client asks the platform
for a game ticket and joins with it; when nobody is signed in, the join is exactly today's.

## 2. Delivery order

Three steps, three PRs, in the order the planning workflow asks for and the onboarding delivery already
followed (`.ia_context/plans/onboarding.index.md`). Each is reviewed on its own, and the next starts
after the previous is approved.

| Step | What it delivers | Files |
|---|---|---|
| **1 · Logic** | The pure modules: talking to the platform, the account state, the history's pagination. No DOM, no Phaser | `frontend/src/api/`, `frontend/src/account/session.ts`, `account/history.ts`, `account/types.ts`, `frontend/src/config.ts`, their tests |
| **2 · Integration** | The wiring: the sign-in panel on the title, the ticket in the join, the profile and history panels over a real document | `frontend/index.html`, `frontend/src/title/title.ts`, `title/connect-flow.ts`, `title/copy.ts`, `frontend/src/net/session.ts`, the i18n catalogs, their tests |
| **3 · Design** | The styles and the contrast floor, in the `visual-identity` convention | `frontend/src/account/account.css`, `frontend/src/account/contrast.test.ts` |

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
| `frontend/src/title/title.ts` | modify | The sign-in button, the panel it opens, the account loaded once on boot |
| `frontend/src/title/copy.ts` | modify | The lines the new controls read |
| `frontend/src/title/connect-flow.ts` | modify | The ticket before the join, and the fallback to a guest join |
| `frontend/src/net/session.ts` | modify | `connect(options?: { ticket?: string })`, passed to `joinOrCreate` |
| `frontend/src/net/session.test.ts` | modify | Section 5 |
| `frontend/index.html` | modify | The sign-in control, the panels' markup, and the Portuguese fallback text the page shows before its script runs |
| `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | The new keys, both locales |
| `frontend/.env.example`, `frontend/.env.production` | modify | `VITE_API_URL`, with the development and production values |
| `frontend/src/title/title.css` | modify | Only the anchor points the new panel needs; the panel's own styles are in `account.css` |
| `.ia_context/plans/m4-accounts-and-persistence.index.md` | modify | The milestone marked with its PRs |

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
