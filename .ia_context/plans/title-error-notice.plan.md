# Plan — A notice for every failure that keeps the player out of a match

**Milestone:** — (single frontend plan: one new pure module, one flow event, markup, CSS)
**Parent debts:** [DT-68](../inputs/technical-debt.md) (a second tab during a match reports the wrong reason)
**Created on:** 2026-10-05
**Status:** pending

---

### 0. Visual change, flagged

The title screen's look was approved in M3 of the visual identity work, and this plan changes it: the
12 px `.alert` line under the call to action is **removed** and replaced by a modal card. The owner
asked for this on 2026-10-05 — the line is too quiet and sits on the palette's lowest-contrast token
(`--stamp`), so a failure that costs the player a match reads as a footnote. The change is confined
to the failure state: the title, the stamp, the call to action and the switcher keep the approved
look, and `title.css` gains rules instead of altering existing ones.

---

### 1. Objective

Whatever keeps the player out of a match is announced in one place: an opaque card over the title,
with a heading that names the kind of failure, the sentence that explains it, and a button that
closes it. Three failures use it today — the seat another session holds, a server that did not
answer, and the match's own code failing to download — and a fourth reason costs one catalog key and
one line in a mapping table, which is what "reusable" means here.

Closing returns the screen to `idle`: the card goes, no line is left behind, and the call to action
is usable again.

---

### 2. What exists today, and what changes

- The title shows failures in `#alert`, a 12 px paragraph in `--stamp` (`#d9473d`) under the button.
  It is written by `renderFlow` (`frontend/src/title/title.ts:80-82`) from `copy.unavailable` or
  `copy.occupied`, chosen by `failureLine` (`:87-90`).
- `Flow.failure` already carries a reason: `'occupied' | 'unavailable'`, from `joinFailure`
  (`frontend/src/net/join-failure.ts`). `title.ts` classifies the caught join error with it.
- One failure is **not** a join failure and has no reason of its own: when `loadMatch()` cannot
  download the match's code, `handOver` (`frontend/src/title/title.ts:230-241`) sets `failed` by hand
  with `failure: null`, so the screen says "Servidor indisponível" about a server that answered
  correctly. In a 12 px footnote that is a small inaccuracy; in a modal it is a visible lie, which is
  why the owner asked for its own message.
- `.alert` is referenced in exactly three places: `index.html:62`, `title.css:209`, and the two lines
  of `title.ts` above.

---

### 3. Decisions taken

Answered by the owner on 2026-10-05.

**D1 — The look — chosen: a card with a filled red bar.**

- **Chosen.** Opaque panel in `--game` (`#0b0e18`), `2px` border `#e07a6f`, the hard `6px 6px` shadow
  the button already uses, a filled bar carrying the heading, the sentence in `--ink`, and a close
  button that wears the title's own button (`.cta`).
- **The bar's red is `#a8322a`, not `--accent`.** Measured, not chosen by eye: `--ink` on `--accent`
  (`#c8322a`) is **3.90**, below the 4.5 the notice's text needs, and Special Elite ships weight 400
  only, so the large-text exemption at 18.66 px bold is not available. `--ink` on `#a8322a` — the
  button's own red, already pinned at 5.56 in `contrast.test.ts` — is **4.88**. The alternative,
  `--stamp` with `--night` type, is 4.71 and was not taken: red type on a red bar reads as one mass,
  and it would put the notice's red at odds with the action's.
- The panel is **opaque** on purpose: `--ink` on `--game` is 14.12, and an opaque panel means the
  notice's contrast does not depend on what the city happens to be drawing behind it. The `.lang`
  switcher needed a pool of night for exactly that reason; the card does not.
- **No animation.** Nothing moves in or out, so `motion.ts` and the reduced-motion policy gain no
  rule. The screen is already loud enough without a transition.

**D2 — What the close button does — chosen: back to `idle`.**

- **Chosen.** The card goes, the flow returns to `idle`, and the call to action is usable. Because
  the notice replaces `.alert` rather than sitting above it, closing must not leave the small line
  behind: keeping it would mean two notices for one failure, one of them the quiet one this plan is
  removing.
- Not done: closing into a lingering `failed` (keeps the old footnote and its problem), and a close
  that immediately retries (the player has not read the card yet).

**D3 — The messages — chosen: a reason of its own for the failed download.**

- **Chosen.** Three reasons, and the heading follows them: `occupied` and `unavailable` are refusals
  and share "ACESSO RECUSADO"; a match whose code did not download was **authorized**, so it gets
  "FALHA AO CARREGAR". Saying "Servidor indisponível" there would be false in a way a modal makes
  obvious.
- The two existing sentences become the card's body unchanged, so `title.occupied` and
  `title.unavailable` keep their keys and their wording.

---

### 4. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/title/notice.ts` | create | `FailureReason`, `NoticeCopy`, `noticeFor`. The reason vocabulary and the reason → lines mapping, pure |
| `frontend/src/title/notice.test.ts` | create | Cases in section 6 |
| `frontend/src/title/connect-flow.ts` | modify | `Flow` becomes a union: `failed` always carries a reason. New `'dismiss'` event. New `failureReason(flow)` |
| `frontend/src/title/connect-flow.test.ts` | modify | Cases in section 6 |
| `frontend/src/title/copy.ts` | modify | `TitleCopy` gains `noticeRefused`, `noticeLoadFailed`, `loadFailed`, `noticeClose` |
| `frontend/src/title/copy.test.ts` | modify | Pins the four new lines in both locales, next to `unavailable` and `occupied` |
| `frontend/src/i18n/catalog.pt-BR.ts` | modify | The four keys |
| `frontend/src/i18n/catalog.en-US.ts` | modify | The four keys, in the drafted English |
| `frontend/src/i18n/catalog.test.ts` | modify | Pins the four keys in both locales |
| `frontend/index.html` | modify | Drops `#alert`; adds the notice's markup, hidden, with empty text |
| `frontend/src/title/title.css` | modify | Drops `.alert`; adds `.notice`, `.notice-card`, `.notice-heading`, `.notice-body`, `.notice-close` |
| `frontend/src/title/contrast.test.ts` | modify | Holds the three new colour pairs, and holds the panel to `--game` and the bar to the button's red |
| `frontend/src/title/title.ts` | modify | Drops `alertLine` and `failureLine`; renders the notice; focus, Escape and the Tab rule; `handOver` names `'load-failed'` |
| `.ia_context/inputs/technical-debt.md` | modify | On completion: DT-68's "Suggested fix" pointer moves from `new-tab-during-match.plan.md` to this plan, whose checks supersede that plan's |
| `.ia_context/inputs/technical-debt-closed.md` | modify | On completion: closes DT-68 with its resolution |

`frontend/src/net/join-failure.ts` is **not** changed: it answers what a caught join error means, and
`'load-failed'` is not a join failure — the join succeeded before the download was attempted. Its
type is reused, not extended.

`backend/` is **not** changed, the protocol is **not** changed, and `new-tab-during-match.plan.md` is
left as it is apart from a pointer note, because its subject (the wording of the second-tab refusal)
is now this plan's subject.

---

### 5. Contracts

**`FailureReason`** (`frontend/src/title/notice.ts`)

- `JoinFailure | 'load-failed'`, so the two reasons the network layer can diagnose are declared once,
  next door to the classifier that produces them, and the screen adds only what it knows by itself.

**`Flow`** (`frontend/src/title/connect-flow.ts`) — a discriminated union

- `{ state: 'idle' | 'connecting' | 'ready'; stampStartedAt: number | null; failure: null }` or
  `{ state: 'failed'; stampStartedAt: null; failure: FailureReason }`.
- This tightens the field added by the previous plan: `failed` carried `JoinFailure | null`, where
  `null` meant "nothing diagnosed it", and `renderFlow` had to treat that as the generic line. No
  path sets `failed` without a reason any more — `handOver` names `'load-failed'` — so the `null` arm
  was a state the type allowed and the code never reached. The union removes it instead of leaving a
  fallback that cannot fire.

**`next(flow, event, now, failure?)`**

- New event `'dismiss'`, answered by `failed` alone: it returns `idle` with `failure: null`. Every
  other state ignores it and returns the flow it was given, the same object, as with every other
  event it does not answer.
- `'press'` still carries `failed → connecting`, unchanged: the flow must keep answering a retry.
  What keeps a press from firing behind the open card is the title, not the flow (see below).

**`failureReason(flow): FailureReason | null`**

- The reason the notice shows, or `null` when there is nothing to show. Total: no fallback, because
  the union makes a `failed` without a reason impossible.

**`noticeFor(copy: TitleCopy, reason: FailureReason): NoticeCopy`** (`frontend/src/title/notice.ts`)

- **Input:** the copy of the language on screen, already resolved, and a reason. It does not read the
  locale itself, and does not touch the DOM.
- **Output:** `{ heading, body, close }`, all three from the copy it was handed.
- **Mapping:** `occupied` and `unavailable` share the refusal heading; `load-failed` gets its own.
- **Never throws.** Every reason in the union has an answer, so there is no default branch to guess.
- **What it does not do:** it does not decide whether the notice is open (that is `failureReason` on
  the flow), does not read the catalog, and does not know a button exists.

**The title's own rules** (`frontend/src/title/title.ts`, the DOM file, untested as its neighbours are)

- The notice is visible exactly when `failureReason(flow) !== null`.
- Focus moves to the close button when the notice opens, and back to the call to action when it
  closes. It is not moved on a re-render that leaves the notice open, so switching language with the
  card up does not yank focus.
- Escape closes it. Tab is contained: the card holds one control, so Tab and Shift+Tab keep focus on
  it rather than leaving a dialog that `aria-modal` promises is modal. A second control in the card
  means this rule must become a real cycle — recorded in a comment beside it.
- `press()` returns early while the notice is open, for the same reason it returns early during a
  match: with the card up, Enter belongs to the card. The close button has focus, so the browser
  fires its own click on Enter, which is what closes it.
- Clicking the backdrop does **not** close: a warning the player paid for with a lost match wants an
  explicit press.

---

### 6. Tests

Automated:

- [ ] `notice.test.ts` — each of the three reasons answers a heading and a body, and `occupied` and
      `unavailable` answer the *same* heading while `load-failed` answers a different one; the three
      lines are non-empty in both locales; the mapping reads the copy it was handed (the same reason
      in the two locales answers the two languages); it does not mutate the copy it was given.
- [ ] `connect-flow.test.ts` — `dismiss` from `failed` answers `idle` with no reason; `dismiss` is
      ignored in the other three states, returning the same object; `press` from `failed` still
      answers `connecting` (the retry path is unchanged); `failureReason` answers `null` in the three
      non-failed states and the reason in `failed`; the existing transitions are unchanged.
- [ ] `catalog.test.ts` — both catalogs carry the four new keys, each pinned to its exact string, so
      changing the wording is a deliberate edit.
- [ ] `copy.test.ts` — the four new lines are exposed in both locales, pinned.
- [ ] `contrast.test.ts` — `--ink` on the bar's red is at least 4.5 and is measured at 4.88; `--ink`
      on the panel's background is at least 7 and is measured at 14.12; the bar's red **is** the
      button's red and the panel's background **is** `--game`, held together the way `grid.test.ts`
      holds the board's two colour tables, so a palette edit cannot leave the notice behind.
- [ ] `session.test.ts`, `join-failure.test.ts` — unchanged.

Manual, in the browser (`npm run dev`):

- [ ] Start a match, open a second tab, press the button there: the card says "ACESSO RECUSADO" and
      "Você já tem uma partida aberta em outra aba", and it is not the quiet line.
- [ ] Back in the first tab, the match is still there and still playable.
- [ ] Let a match end, keep the result screen open, open a second tab and press: the same card.
- [ ] With the server down, press: "ACESSO RECUSADO" with "Servidor indisponível", not the occupied
      sentence — the mapping did not swallow the reason.
- [ ] Press Fechar: the card goes, no line is left, and Enter starts a fresh match.
- [ ] With the card up: Escape closes it, Tab never leaves the card, and the focus is back on the
      call to action afterwards.
- [ ] Switch language with the card up: the card is written again in the other language, and the
      focus is not moved.
- [ ] Block the match's chunk in DevTools (request blocking on `main-*.js` against `npm run
      preview`, or `/src/main.ts` against `npm run dev`) and press: "FALHA AO CARREGAR" with its own
      sentence, and the button works again afterwards.

Command: `npm test` and `npm run build` in `frontend/`.

The owner reviews the English of the four new keys before this plan closes, as M3's copy was reviewed.

---

### 7. Dependencies

- None. Base `develop`, which already carries the occupied-seat work this plan replaces the screen of.
- Order inside the plan: **logic** first (`notice.ts`, `connect-flow.ts`, `copy.ts`, the catalogs and
  their tests), then the **screen** (`index.html`, `title.css`, `contrast.test.ts`, `title.ts`), then
  the browser checks. The logic half is reviewable on its own, and the whole of the visual change is
  in the second half.

---

### 8. Out of scope

- **In-match connection failures.** `match.reconnecting` and `match.lost` are the HUD's own lines on
  the match screen, shown while the match is on; this notice belongs to the title, and it is the
  entry it is about.
- **The two contrast gaps `contrast.test.ts` already records** — the hovered button at 4.15 and the
  footer at 4.02. Both are the owner's to decide, and neither is the notice's text.
- **A general dialog component.** The notice is the title's; the match screen has no use for it yet,
  and inventing a shared component for one caller is how a component ends up shaped like its first
  caller. When a second caller appears, the module is the thing to lift.
- **Retrying from the card**, and **closing on a backdrop click**. Both were considered in D2 and
  left out.
- **`new-tab-during-match.plan.md`'s inline `.alert` work.** Its automated checks stay green, its
  manual checks are superseded by this plan's, and the plan is not rewritten — only DT-68's pointer
  moves.
