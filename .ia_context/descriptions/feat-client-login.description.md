# MR — Sign in from the title screen by GitHub, Google or an address and a password, with a profile, a battle history, and the ticket on the join (M4 · m4-04)

**Branch:** `feat/client-login`
**Base branch:** `develop` — the range `develop...feat/client-login` also carries m4-02 and m4-03, because the branch sits on `feat/auth`, whose head is also where the match-recording work landed. m4-01 is already merged into `develop`. m4-01 and m4-02 have their own descriptions ([m4-01](./feat-persistance-foundation.description.md), [m4-02](./feat-auth.description.md)); this document covers **m4-04 alone**
**Milestone:** M4 · Accounts and persistence — m4-04 (client: sign-in, profile and battle history), of [`.ia_context/plans/m4-accounts-and-persistence.index.md`](../plans/m4-accounts-and-persistence.index.md). No ADR: the plan records that these are screens, not architecture
**Ticket(s):** None recorded for this milestone — the plan names none. The only `DT-` item in play is `DT-92`, which this MR does not close (see § 4)
**Date:** 2026-10-17

---

### 1. What this MR delivers

Playing as a guest is still the default action and still one click: the title boots, asks `/me` once, gets a
`401` and renders exactly as it did before. Signing in is now possible from the same screen — a control in
the corner opens a dialog with GitHub and Google buttons and an address-and-password form — and it is never
a precondition. The guest press makes **no request to the platform at all**; a signed-in press asks for a
game ticket at that moment, not at boot, and joins with it. A ticket the room refuses costs exactly one
retry without it, and a ticket the platform could not issue costs nothing: the player joins as a guest,
because playing is the default (plan D1–D3).

Around that join, the player gets the two panels the milestone promised. The profile shows the display name,
the avatar, one row per agent with class and level, and sign out. The history shows one row per finished
match — date, map, result, rounds — with cursor pagination, a "load more" that only asks when pressed, an
empty state that says so in words, and a failure that keeps the rows already on screen. Both are DOM, like
the title and the onboarding (plan D4), and both speak both locales.

The sign-in dialog is the part m4-02's § 8 and § 9 handed over, and it is bigger than the plan's original
sketch: the OAuth buttons are drawn from `GET /auth/providers`, so a deployment with no OAuth app draws **no**
button instead of one that answers `404`; the address-and-password form drives sign-in, sign-up and "I forgot
my password"; and the two links the platform mails land on client screens, `/verify-email` and
`/reset-password`. Opening those pages **reads** the token and never spends it — the press does — because mail
scanners and link previews fetch every URL in a message (ADR 0021 § D12). A registration and a forgotten
password both end on the same "check your mailbox" card, which is the only answer that does not turn the
form into a way to ask which addresses have accounts.

Implementation followed the plan's contract; the divergences are named rather than silenced:

- **The three steps arrive as one commit.** `01cfcd7` holds Logic, Integration and Design together, while plan
  § 2's owner decision says one commit per step. Nothing is lost from the diff, but a reviewer who picks
  commits apart will find three steps in one.
- **The branch's second commit is an input document, not an implementation.** `81df467` is titled *"implement
  SSO via Keycloak with lazy account linking and account deletion feature"*, and its entire diff is
  `.ia_context/inputs/sso.login.input.md` (383 lines, Portuguese): a spec for a milestone that is not planned
  or approved. There is no Keycloak code, no `DELETE /auth/account` and no `/settings/security` anywhere in this
  branch. The spec proposes removing the GitHub and Google buttons this MR draws. It is a recorded input for a
  future milestone, not delivered work, and should be reviewed as such.
- **`frontend/src/account/modal.ts` and `frontend/src/net/join-failure.ts` are outside § 3's table.** The first
  counts the account cards that are open, because the title's Enter starts a match from anywhere and must stop
  doing that behind a dialog. The second gained `isTicketRefusal`: the room's `525` **and** the words
  `onAuth failed`, because Cloudflare reuses 525 for its own TLS timeout. A code alone would retry a guest join
  after a network fault, which D3 does not allow.
- **`AccountState` wraps the platform's answer instead of flattening it.** Plan § 4 sketches
  `{ status: 'signed-in', profile, agents }`; the code holds `{ status: 'signed-in', account: { user, agents } }`,
  because that is what `/me` already answers and re-spelling it in the client would be a second contract to keep.
- **The resend route is in the client and has no caller.** Plan § 8 says the form drives four password
  routes — sign in, sign up, forgot and *resend the message* — and `api/client.ts` implements all six
  routes and tests `resend`, but no screen calls it. A player whose verification mail never arrived has
  the register form (which answers the same "check your mailbox") and, once verified, the forgot route;
  there is no "send it again" control. This is the one promised behaviour that did not land, and the
  reviewer should decide whether it is a blocker for this MR or a follow-up.
- **Every request carries an 8-second timeout and `referrerPolicy: 'no-referrer'`.** Neither is in the plan. The
  timeout keeps a silent platform from leaving the title waiting — the ticket is valid for five minutes, so eight
  seconds is far inside it. The referrer policy keeps a mailed link's token, which is in the page's own URL, from
  travelling in a `Referer` header on the way to the API.
- **Plan § 5's fallback-text item holds for the title and the account cards, not for the two mail pages.** Their
  heading, body and button are empty in `index.html` and written by `mail-page.ts`, because one document serves
  both kinds and the text differs by kind. No test covers that item; it is a manual check in the pre-review.
- **The phone-width design item is implemented but not asserted.** `account.css` has a `max-width: 520px` block
  that takes the cards to the 16 px gutter and stacks the history rows; no test reads it.

**Verification at the head of this branch:** `npm test -w @eldritch-alley/frontend` → **1023/1023 across 80
files**, **125 more than `feat/auth`'s 898** (116 of them in new files; the rest in `config.test.ts`,
`net/session.test.ts` and the catalog parity case). `npm run build -w @eldritch-alley/frontend`
(`tsc --noEmit && vite build`) is clean, and the emitted chunks keep the mail page at 3.2 kB and the title's
Phaser bundle at 1.6 MB in separate chunks — a mailed link never downloads the game.

---

### 2. What changed and why

| File | What changed | Why it matters |
|------|--------------|-----------------|
| `frontend/src/api/client.ts` *(new)* | `createApi(baseUrl, fetchImpl)` with `providers`, `me`, `gameTicket`, `logout`, `matches` and the six password routes (`resend` among them, with no screen calling it yet). One `credentials: 'include'`, one `referrerPolicy: 'no-referrer'`, one timeout, and every body checked at the boundary | The whole platform contract in one file. A single call missing `credentials` is a silent logout; a body that is not the contract becomes an `unknown` failure instead of a proxy's HTML page drawn as a row. A `401` from `me()` is `null` — the guest answer — not an error |
| `frontend/src/api/errors.ts` *(new)* | `ApiError` with `kind`, `status`, `code`; `failureOf` and `isRefused` | Three failure kinds the screens actually branch on: `offline` (said out loud), `refused` (the player acts on the code), `unknown` (nothing to act on). A network failure and a bad password lead to different sentences |
| `frontend/src/net/join-with-ticket.ts` *(new)* | `joinWithTicket(ports)`: a guest joins with no platform call; a signed-in player fetches a ticket and joins with it; a refused ticket is retried exactly once, on a new `Session`, without the ticket | D1, D2 and D3 in one testable function, outside `title.ts` and outside `Session`. A ticket that could not be fetched is the same as no ticket, so playing survives the platform being down |
| `frontend/src/net/join-failure.ts` *(modified)* | `isTicketRefusal(error)`: code `525` **and** `/onAuth failed/` | The retry must mean "the room refused the ticket", not "the network failed". Cloudflare reuses 525 for TLS timeouts, so the words are half of the test — the same rule `session.ts`'s `REFUSALS` already follows |
| `frontend/src/net/session.ts` *(modified)* | `open(options?: { ticket?: string })`, passed to `joinOrCreate`; a resumed seat ignores the options | The ticket travels in the join payload and nowhere else. A reconnect already holds its seat; sending a ticket again would be a second join |
| `frontend/src/account/session.ts` *(new)* | `loadAccount`, `signIn`, `signOut` and the store (`currentAccount`, `setAccount`, `onAccountChange`) | One load on boot, one value the control, the panels and the press-time ticket all read, so they cannot disagree about who is playing. A failed sign-out keeps the state, because the cookie is still alive; a failed `/me` after a successful login keeps the player signed in with the profile and no agents, because the cookie is set and calling them a guest would be a lie |
| `frontend/src/account/auth-flow.ts` *(new)* | The dialog's steps (`closed → sign-in/sign-up/forgot → check-mail`), `canSubmit`, the 12–128 password policy and the failure-to-line mapping | Every rule of the dialog is testable without a document. The policy mirrors the platform's, so a typo is answered before a round trip — and still checked there, because a browser is not the authority |
| `frontend/src/account/history.ts` *(new)* | The pagination state machine: first page with no cursor, the cursor the platform answered, "load more", exhausted, loading, failure | A page that arrives while another is in flight cannot duplicate a row (deduplicated by id), and a failed page keeps the rows the player already has |
| `frontend/src/account/copy.ts` *(new)* | `accountCopy()` and `mailCopy()`: every line read from the catalog of the current locale | The type is the list, so a missing line is a compile error, and the screens are rewritten on a language change because the copy is read on every call |
| `frontend/src/account/panel.ts`, `history-panel.ts` *(new)* | The profile and history as pure views: name, avatar, agents, empty state, rows, action, failure, in the language on screen | The decisions live where a test can read them; the DOM half only writes strings. An unknown map id is drawn by the id itself, so a newer server's map is a plain row and not an empty one |
| `frontend/src/account/mail.ts` *(new)* | The token read from the query string and never spent, the six page states (`ready`, `working`, `done`, `invalid-token`, `missing-token`, `problem`) and the view | The click spends the token, not the open — ADR 0021 § D12 — and an unreadable, expired or spent link is a state with a way back, not an empty screen |
| `frontend/src/account/account.ts` *(new, 526 lines)* | The DOM half: the control, the dialog, the profile and the history; every press handed to the pure modules | The largest untested file in the MR: by the repository's convention it only writes strings and routes presses, which is why its decisions live next door and are tested there. It also routes Enter: a card's keys stop at the card, Escape closes it, and the title's match press is inert while a card is open |
| `frontend/src/account/mail-page.ts` *(new)* | The DOM half of `/verify-email` and `/reset-password`; focus lands on the field the page asks for | Read token, render state, spend on press. The reset page checks the length policy and the confirmation before the round trip |
| `frontend/src/boot.ts`, `boot-screen.ts` *(new)* | `screenFor(pathname)` and the one entry point: the title boots its modules; a mailed link hides the title box and imports only the mail page | The client is one document served for every path. Dynamic imports are what keep the 1.6 MB Phaser bundle out of a mailed link, and a page whose script fails still shows the markup's own text where it has any |
| `frontend/src/account/live.ts`, `modal.ts` *(new)* | One `Api` instance and the resolved platform URL; the open-card count | One place resolves `VITE_API_URL`, so a build without a platform fails at load in one place. The card count is how the title knows its Enter belongs to a dialog |
| `frontend/src/config.ts` *(modified)* | `apiBaseUrl(env)` and `VITE_API_URL`, with the same rule `gameServerEndpoint` has: declared must be `http(s)`, undeclared falls back to `http://localhost:3000` only under `vite dev`, anything else throws | A production build with no platform stops at load instead of calling the player's own machine. The registrable-domain requirement for the `SameSite=Lax` cookie is written where the value is read |
| `frontend/src/title/title.ts` *(modified)* | The account loaded once on boot (`/me`), the press routed through `joinWithTicket`, and `cardIsOpen()` added to the Enter guard | The title is the only place that knows the press. Nothing polls, and the guest path gains no request |
| `frontend/index.html` *(modified)* | The account control, the three cards, the mail page, and the Portuguese fallback text for the title and the cards (the mail page's lines are written by its script) | The markup and the DOM halves are written together; the fallback is what an offline or broken script leaves on screen |
| `frontend/src/i18n/catalog.{pt-BR,en-US}.ts` *(modified)* | The `account.*` and `mail.*` keys, both locales | `catalog.test.ts` now asserts that every account and mail key is translated in en-US, so an English screen cannot fall back to Portuguese |
| `frontend/src/account/account.css` *(new)* | The control, the cards and the mail page, borrowing the title's palette; a `max-width: 520 px` block for phones | A second screen in the title's own language, with no second palette. `contrast.test.ts` reads the colours out of both sheets |
| `frontend/src/account/contrast.test.ts`, `layers.test.ts` *(new)* | 12 contrast cases (every text pair, every focus ring, no invented colour) and 6 stacking cases (control in the switcher's layer, cards in the notice's, the board above, the boxes outside `main.title`) | The design step's whole proof. A palette edit has to say so, and a card that traps the control's `z-index` fails here rather than on a screen |
| `frontend/.env.example`, `.env.production` *(modified)* | `VITE_API_URL`, with the development and production values | The build knows where the platform is; the value is public by construction and holds no secret |
| `.ia_context/plans/m4-04-client.plan.md`, `m4-accounts-and-persistence.index.md` *(modified)* | m4-04 marked delivered; § 2 records the single-branch decision and the two files not touched; § 9 records how the milestone closed, the test count and the gap the suite cannot close | The next milestone reads its dependencies from the index. The correction is kept beside the decision it corrects |

---

### 3. Notes for the reviewer

- **The range against `develop` carries two earlier milestones.** `feat/client-login` sits on `feat/auth`,
  whose head (`5dfed42`) is also where m4-03 landed; m4-01 is already merged into `develop`. So the PR shows
  m4-02, m4-03 and m4-04 together — 138 files — and only the client files are this MR's subject. m4-02 has a
  description of its own; m4-03 is documented in its plan. Once the stack is merged, the diff here shrinks to
  the client.
- **The commit message of `81df467` is not the diff.** It announces Keycloak SSO, lazy account linking and
  account deletion; the commit adds one input document and no code. Read it as a planning artifact, and treat the
  spec's proposals — a single SSO button replacing the two provider buttons, `/settings/security`,
  `DELETE /auth/account`, `battle_history` and `unit_inventory` tables — as future work that does not exist yet.
- **The three steps are one commit (`01cfcd7`), not three** as plan § 2's owner decision says. The plan's § 9
  still says "left uncommitted for the owner", which is now historical: the owner committed the work.
- **No test in the repository has a DOM.** The pure halves are well covered; `account.ts` and `mail-page.ts` are
  not tested at all. A reviewer should read those two files by hand, especially the press routing and the focus
  handling, because nothing else will catch a mistake there. The browser run is the owner's proof.
- **The OAuth click-through has never been observed.** The client's tests use a fake `fetch` and assert only
  that the buttons are drawn from the list; the server's route cases use `FakeProvider`. Registering a real
  GitHub or Google app and completing the flow is scenario 8 in the pre-review.
- **A `/me` that fails immediately after a successful login leaves the player signed in with no agents.** That
  is deliberate — the cookie is set, so calling them a guest would be wrong — and the next reload brings the
  squad. Look for it if a reviewer wonders why `signIn` makes two requests.
- **There is no "resend the verification mail" control.** The route and its client method exist and are
  tested, but the dialog never calls them. Plan § 8 promised the form would drive it; if the reviewer
  considers m4-04 incomplete without it, the smallest shape is a link on the `email_not_verified`
  failure line that calls `api.resend(email)` and moves to `check-mail`.
- **A failure sentence keeps its language when the player switches while it is on screen.** The dialog
  holds the rendered line rather than the problem key, so a locale change rewrites the labels and the
  steps but repeats the sentence; the next submit writes it again. Small and contained to the dialog's
  state — a fix is to keep the key and read the catalog at render time.
- **The provider list is asked once per page load, on the first open of the dialog.** A deployment does not
  change its OAuth apps at runtime, and a failed fetch draws no button and no error. A reload is the answer.
- **The history asks for the first page every time the panel opens.** Nothing is cached, which is what makes a
  match just played appear without a reload. The cost is one request per open.
- **The `DT-92` divergence is unchanged.** `/me` answers `401` for an account deleted behind the session's back,
  while `/me/matches` answers `200` empty. The client asks `/me` first, so it signs out and never draws the empty
  history; the decision between `DT-92` and m4-05 remains the owner's.
- **`account.css`'s phone block is not covered by a test.** It is the one design item in plan § 5 that is
  implemented without an assertion, and the check is a manual resize in the pre-review.
- **The two mail pages show an empty card until their script runs.** The title and the account cards carry
  Portuguese fallback text in `index.html`; these two do not, because one document serves both kinds. Plan § 5's
  fallback item is therefore only partly met — named here rather than left to be discovered.
