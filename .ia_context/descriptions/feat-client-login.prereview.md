# Pre-review — Sign in from the title screen by GitHub, Google or an address and a password, with a profile, a battle history, and the ticket on the join (M4 · m4-04)

**Branch:** `feat/client-login`
**Generated:** 2026-10-17

---

### 1. What to test

The stack is m4-02's: `npm run infra:up`, `npm run db:migrate`, then `npm run dev:platform-api`,
`npm run dev:game-server` and `npm run dev:frontend` in three terminals. The frontend reads
`VITE_API_URL` (default `http://localhost:3000` under `vite dev`), the platform reads `CLIENT_ORIGIN`
(`http://localhost:5173`) and `OAUTH_REDIRECT_BASE_URL` (`http://localhost:3000`). With no `EMAIL_*`
set, the platform's `LogMailer` prints every mail — link included — in its own terminal. The game-server
still needed for a match; the platform is needed only for the account scenarios, and the game-server
needs `GAME_TICKET_PUBLIC_KEY` for the ticket path.

Run the scenarios in this order; the first two are the ones a regression would hurt most.

1. **The guest path, with the platform down.** Stop `dev:platform-api` (or point `VITE_API_URL` at a
   closed port), reload `/`. *Expected:* the title renders and plays exactly as before; the account
   control says "Entrar"; the boot's one `/me` fails silently (no error card); pressing `Iniciar
   partida` or Enter starts a match. *In DevTools:* the press makes **no** request to the platform —
   not `game-ticket`, not `/me`. This is D1 seen from the browser.

2. **A signed-in press carries a ticket, and the match is recorded.** Sign in (scenario 5), then press
   `Iniciar partida`. *Expected:* a `POST /auth/game-ticket` goes out at the moment of the press, and
   the join request carries `ticket` in its payload; the match plays. With m4-03's recording stack up,
   the finished match appears in the history (scenario 11). *Mock state:* a valid `GAME_TICKET_PRIVATE_KEY`
   on the platform and the matching `GAME_TICKET_PUBLIC_KEY` on the game-server.

3. **A ticket the room refuses is retried once, as a guest.** Sign in, then restart `dev:game-server`
   with `GAME_TICKET_PUBLIC_KEY` unset (or set to a different keypair's public key), and press. *Expected:*
   the room refuses the ticket, the client opens **one** second session without it, and the match starts.
   The server logs its warning ("a ticket was offered but …"); the player sees no error. *Also:*
   sign in, stop the platform **after** boot, press — the ticket request fails and the match starts as
   a guest, with no retry (only a refusal retries). Both are D3.

4. **A mailed link is read on open and spent on press.** Sign up with any address under `LogMailer`;
   copy the `/verify-email?token=…` link from the platform terminal and open it. *Expected:* the page
   shows the confirmation text and a button, and the Network tab shows **no** request on load — the
   token was only read (ADR 0021 § D12). Press: `POST /auth/password/verify`, then the done state with
   no button. Reload the same link: `invalid-token` state, no button, a way back to the title. Open
   `/verify-email` with no `?token`: `missing-token` state. Open `?token=garbage`, press: `invalid-token`.

5. **Address and password, end to end.** Signed out, press the control → dialog on the *Entrar* tab.
   Try `Criar conta` with an 11-character password: the submit stays disabled and the hint says
   12–128. Register with a valid password (the display name is optional): the `check-mail` card
   replaces the form; `Voltar` returns to the tabs. Press `Entrar` before verifying: "verify your
   email" line, form still usable. Take a fresh link from the platform's log and verify it, then sign
   in: the dialog closes, and the control shows the display name the platform answered.

6. **The failure lines of the sign-in form.** Wrong password: the credentials line. An unverified
   account: the verification line. Ten wrong passwords in a row (the platform's default failure limit,
   in a 15-minute window): the throttling line. Stop the platform
   with the dialog open and submit: the offline line, and the form stays usable for a retry. *Expected
   in all four:* the line sits inside the card, the submit goes back to answering, and the title's
   `Enter` does not start a match while the card is open.

7. **Forgot and reset, including a reused link.** `Esqueci a senha` → address → the `check-mail` card
   (the same one, on purpose: it does not reveal whether the address exists). Take the
   `/reset-password?token=…` link: focus lands on the new password; a short password or a mismatched
   confirmation is answered without a request; a valid one reaches the done state. Sign in with the
   new password (and not the old one). Reopen the same link: `invalid-token` (a used and a forged link
   say the same sentence). Open `/reset-password` without a token: `missing-token`.

8. **The provider buttons follow the deployment.** With `OAUTH_GITHUB_*`/`OAUTH_GOOGLE_*` empty
   (`.env.example`'s default), open the dialog: no buttons and no "sign in with" label — the form is
   the whole offer. Set only GitHub's pair and restart the platform, then reload the page and open the
   dialog: exactly one button; a second open in the same page load does not ask again (one
   `GET /auth/providers`). Pressing the button navigates to the platform's `/auth/github`. *Completing
   the round trip needs a real registered app* — see § 4.

9. **The profile panel.** Signed in, press the control: the profile shows the display name, the email,
   the avatar when the provider gave one, and one row per agent (class + level). A squad with no
   agents shows the empty line, not an empty box. Point the avatar at a URL that 404s: the picture
   disappears and the panel keeps its shape. Press `Sair` with the platform up: the control returns
   to "Entrar". Press it with the platform stopped: the panel stays, with the failure line, because the
   cookie is still alive.

10. **The page before its script, and the offline lines.** Block the boot module in DevTools (Network →
    Block request URL, `/src/boot.ts`) and reload: the title's Portuguese fallback text stands, no dead
    control appears, and nothing throws. Then unblock it, open `/verify-email?token=…`, stop the
    platform and press: the offline line, and the button answers again. Same for `/reset-password`
    with a valid-looking token.

11. **The history panel.** With a signed-in account that has played matches, `Perfil → Histórico`: one
    row per match with date, map, result and rounds, most recent first. With more matches than a page,
    `Carregar mais` appends the next page and the button turns into "loading" while the request is out;
    the last page hides it. *Failure:* load the first page, stop the platform, press `Carregar mais` —
    the rows already on screen stay and the failure line appears. *Empty:* a fresh account shows the
    empty sentence. *Freshness:* finish a match, reopen the panel — the new row is there without a
    reload (the panel re-asks page 1 on every open).

12. **Keyboard and focus.** With any card open, press Enter: no match starts (the card owns the key),
    and inside the form Enter submits it. Escape closes the open card and focus returns to the account
    control. Focus lands on the address field when the sign-in dialog opens, and on the new-password
    field when the reset page opens; the verify page focuses its button. On the history, Tab reaches
    the panel's own controls in order; it can also leave the card for the page behind (see § 4).

13. **Language.** Switch to EN with the dialog open: title, tabs, labels, hints and the check-mail card
    rewrite without closing it. *Known quirk:* a failure sentence already on screen is stored as text,
    not as a problem key, so it stays in the language it was shown in until the next submit — confirm
    whether that is acceptable (see § 4). Open a mailed link with the saved locale at EN: the mail
    page is in EN too.

14. **Phone width and contrast.** At 375 px: the account control is reachable without covering the
    call to action, the cards take the 16 px gutter and scroll rather than clip, and the history rows
    stack. Tab through both cards under the system's forced-colours setting: every focus ring is
    visible. (The 12 contrast cases are asserted; the layout is not — see § 4.)

15. **The suite, the build and the mail chunk.** `npm test -w @eldritch-alley/frontend` → 1023 passing
    across 80 files. `npm run build -w @eldritch-alley/frontend` → clean, `tsc --noEmit` included.
    Serve the build with `npm run preview -w @eldritch-alley/frontend`, open `/verify-email?token=x`,
    and check the Network tab: the mail page chunk (~3 kB) loads and **no** Phaser chunk is requested.

---

### 2. Code checklist

- [ ] Every platform call goes through `createApi`: one `credentials: 'include'`, one
      `referrerPolicy: 'no-referrer'`, one timeout per request. No second `fetch` elsewhere in
      `frontend/src`.
- [ ] `mail.ts` never spends a token: the request happens inside `press()`, and only after a real
      `submit` event. `initialMailState` is pure and does not touch `api`.
- [ ] `isTicketRefusal` still requires **both** `525` and `/onAuth failed/`; a code alone must not
      retry.
- [ ] `joinWithTicket` closes the first session on every failure path, and only creates the second
      session when a ticket was offered **and** refused. A guest failure and a network failure are
      rethrown, not retried.
- [ ] `title.ts` asks for the ticket at press time only; there is no `gameTicket()` call in the boot
      path and no polling anywhere.
- [ ] `press()` still refuses to run while a card is open (`cardIsOpen()`), and `modal.ts`'s counter
      cannot go negative (`setCard` is idempotent; `cardClosed` guards at zero).
- [ ] `signIn` writes the store **before** the dialog closes; `signOut` keeps the state when the
      request fails; a `/me` after login that fails keeps the profile and an empty squad.
- [ ] History: rows deduplicated by id; a failed page keeps the rows and the cursor; `Carregar mais`
      is hidden when `cursor` is `null` and disabled while loading.
- [ ] Every response body is validated at the boundary in `api/client.ts`; a wrong shape is `unknown`,
      never a thrown type error deeper in a screen.
- [ ] No user-facing string is written in `account.ts` / `mail-page.ts`; everything comes from
      `copy.ts`. Both catalogs have every `account.*` and `mail.*` key.
- [ ] `VITE_API_URL` is read only through `config.apiBaseUrl`; a production build without it throws
      instead of defaulting to localhost.
- [ ] The CSS invents no colour and no `z-index` outside the tokens `contrast.test.ts` and
      `layers.test.ts` assert.
- [ ] No leftover `console.log`; the deliberate `console.error` calls (city assets, boot failure) are
      the only ones.
- [ ] `frontend/index.html`: the title and account cards keep their Portuguese fallback; the mail
      page is deliberately empty (see § 4).
- [ ] The diff of `01cfcd7` touches only `frontend/` and `.ia_context/` — no backend source hid in it.
- [ ] `npm run build -w @eldritch-alley/frontend` and the full frontend suite are green at the head of
      the branch.

---

### 3. Behaviour checklist

**Guest flow**
- [ ] The title plays with the platform stopped, and the press sends no request to it.
- [ ] With no account, the control reads "Entrar" and press opens the sign-in tab.

**Sign-in and sign-up**
- [ ] A correct address and password close the dialog and put the name on the control.
- [ ] A wrong password, an unverified address, a throttled attempt and an offline submit each show
      their own sentence, and the form stays usable.
- [ ] Sign-up with a short password cannot be submitted; the optional display name is accepted.
- [ ] `check-mail` is the identical answer for sign-up and forgotten, and `Voltar` returns to the tabs.

**Mailed links**
- [ ] Opening a link makes no request; pressing does.
- [ ] A used, forged or absent token is a state with a way back, never a blank page.
- [ ] The reset page checks length and confirmation before the round trip, and the new password works
      while the old one does not.

**Providers**
- [ ] A deployment with no OAuth app draws no button and no label.
- [ ] A deployment with one draws one, and only asks `/auth/providers` once per page load.
- [ ] The button navigates (full page), not a failed cross-origin fetch.

**Join with ticket**
- [ ] Pressing while signed in fetches the ticket at that moment.
- [ ] A refused ticket costs exactly one guest retry; a failed ticket request costs none.
- [ ] The match still starts when either happens, and a guest match is not recorded as the account's.

**Profile**
- [ ] Name, email, avatar and one row per agent; empty squad has a sentence.
- [ ] A broken avatar leaves the panel intact.
- [ ] Sign-out with the platform up returns the control to "Entrar"; with it down the panel stays and
      says the request failed.

**History**
- [ ] Rows, pagination, empty state and failure state behave as in scenario 11.
- [ ] A just-finished match appears when the panel is reopened, without a reload.

**Keyboard, focus and accessibility**
- [ ] Enter never starts a match behind a card; Escape closes each card and returns focus.
- [ ] Every input has a label; problem lines are announced (`role="alert"`).
- [ ] The dialog opens with focus on the field that answers first.

**Language, layout, build**
- [ ] Open screens rewrite on a language switch; a failure sentence already shown does not (see § 4).
- [ ] 375 px layout is reachable and scrolls.
- [ ] Suite (1023), build and the mail page's own chunk, as in scenario 15.

---

### 4. Known gaps, deliberately not closed

- **No DOM tests.** The repository has no DOM test setup on purpose; the pure modules carry the
  decisions and `account.ts` / `mail-page.ts` are the untested halves. A DOM setup is a decision for a
  milestone that needs it, not a side effect of this one. The browser run above is the proof.
- **There is no "resend the verification mail" control.** Plan § 8 lists resend among the four routes
  the form drives; `api.resend` exists and is tested, but nothing calls it. Confirm that this is the
  intended scope for this MR before opening it — if not, the smallest shape is a link on the
  `email_not_verified` line that calls `api.resend(email)` and moves the dialog to `check-mail`.
- **A failure sentence does not change language while it is on screen.** `account.ts` stores the
  rendered sentence (`problem`) rather than the key it came from, so `renderAuth()` on a locale change
  rewrites labels but repeats the old sentence. The next submit writes it again in the new language.
  Either accept it for now or store the problem key; the fix is small but touches the dialog's state.
- **Tab is not trapped inside the account cards.** `keepKeys` stops the card's keys from reaching the
  title and closes on Escape, but Tab can still walk focus to the page behind the card. `Enter` remains
  inert there because `cardIsOpen()` is still true, so nothing dangerous happens; a real focus trap is
  a follow-up if the audit asks for one.
- **The two mail pages have no pre-script fallback text.** One document serves both kinds, and the
  heading differs by kind, so `index.html` leaves those lines empty. Plan § 5's fallback item is met
  for the title and the cards only.
- **The phone block is not asserted.** `account.css`'s `@media (max-width: 520px)` exists and is
  checked by eye in scenario 14; no test reads it.
- **The OAuth round trip has never run against a real provider.** The client and the server are each
  covered with fakes, but no live GitHub or Google app was registered and completed. That is a
  deployment task with credentials, and it stays on the owner.
- **The provider list is per page load.** A redeployment of the platform's OAuth config is picked up by
  a reload, not by reopening the dialog.
- **The history has no cache.** Every open asks again for page 1; that is what makes a fresh match
  appear, at the cost of one request per open.
- **The message of `81df467` overstates its diff.** It announces Keycloak SSO and account deletion; the
  commit adds `.ia_context/inputs/sso.login.input.md` and nothing else. The spec is an input for a
  future milestone, not work in this MR.
- **`DT-92` is still open.** A session for a deleted account gets `401` from `/me` and `200` empty from
  `/me/matches`. The client asks `/me` first, so it signs out and never draws that contradiction; which
  side changes is m4-05's or `DT-92`'s call.
- **No e2e covers the client.** `backend/e2e` exercises the API and the room; driving a browser through
  sign-in and a match is not part of this milestone.
