# Technical debt

Living list of known debts. Each item has a trigger: the condition that moves it out of the list and into work. Closed items move to [technical-debt-closed.md](./technical-debt-closed.md) with their resolution, so the history of decisions is kept. An item that stops making sense is closed as obsolete, with the reason, and never deleted.

Status values: **Open**, **Closed**.

Planned features are not debt: they live in [backlog.md](./backlog.md).

---

## Open

### DT-19 · Low and moderate advisories left after the Colyseus 0.18 migration
- **Category:** Security
- **Risk if untreated:** `npm audit` still reports 19 advisories: 14 low and 5 moderate, none high and none critical. The low ones sit on the `@colyseus/*` packages and `colyseus` itself; the moderate one is `grant`, pulled in by `@colyseus/auth`. They have no fix inside 0.18.9.
- **Effort:** P (re-check on each Colyseus release; nothing to do until then).
- **Trigger:** a Colyseus release past 0.18.9, or an advisory on the same packages moving to high.
- **Evidence:** `npm audit --json` run on 2026-10-03: `{"low":14,"moderate":5,"high":0,"critical":0,"total":19}`; `docs/adr/0008-colyseus-0.18.md`.

### DT-21 · The bot only starts playing after a human action
- **Category:** Architecture (design)
- **Risk if untreated:** if the initiative ever starts with a bot unit, nothing triggers the bot, the human gets `not-your-turn` on every action, and the match stalls. It does not happen today, because the sniper of team A has the highest speed.
- **Effort:** P
- **Trigger:** any change to the roster or the speeds, or the start of M3.
- **Evidence:** `backend/game-server/src/battle-room.ts:124,128`.

### DT-22 · ADR 0008 contradicts itself about setMetadata
- **Category:** Documentation
- **Risk if untreated:** the decision says `setMetadata` replaces the object, and the sentence after it says it merges. Whoever uses `setMetadata` later may follow the wrong one. No code uses it today.
- **Effort:** P
- **Trigger:** the first use of room metadata (matchmaking, M5).
- **Evidence:** `docs/adr/0008-colyseus-0.18.md`, section Decision.

### DT-23 · The "not-your-turn" refusal is tested only as a pure function
- **Category:** Testing
- **Risk if untreated:** the message path that sends `rejected` for a bot-turn action is not covered by a socket test; only `resolveHumanAction` is.
- **Effort:** P
- **Trigger:** the next change to the message handlers.
- **Evidence:** `backend/game-server/src/battle-room.test.ts:52`.

### DT-25 · The move-preview intent is declared but never returned
- **Category:** Documentação (código morto)
- **Risk if untreated:** the type suggests a behaviour that does not exist.
- **Effort:** P
- **Trigger:** when the match scene draws the move preview (m2a-integration), or remove the variant before then.
- **Evidence:** `frontend/src/game/selection.ts:10`.

### DT-29 · The HUD view plan disagrees with the code on two numbers
- **Category:** Documentation
- **Risk if untreated:** the plan says 14 log lines and five panel rows; the code has 12 and six. Whoever reads the plan later will misjudge the layout.
- **Effort:** P
- **Trigger:** together with the next edit of the HUD plans.
- **Evidence:** `.ia_context/plans/m2a-hud-view.plan.md` section 4.1 versus `frontend/src/view/layout.ts:84` (`LOG_LINES = 12`) and the six rows of `frontend/src/game/panel.ts`.

### DT-46 · Highlight graphics are recreated on every redraw
- **Category:** Performance
- **Risk if untreated:** object churn in the scene on each state change. Suspected cost only; not measured.
- **Effort:** P
- **Trigger:** only if a measurement in a real match shows a cost.
- **Evidence:** `frontend/src/scenes/MatchScene.ts:453-454` destroys the previous highlights, and `:468` creates a new `Graphics` for each highlighted cell.

### DT-41 · The match scene has no automated test
- **Category:** Testing
- **Risk if untreated:** regressions in `MatchScene`, `units.ts` and `effects.ts` appear only in the browser, by hand.
- **Effort:** M
- **Trigger:** the first change to those files after this entry; first step was DT-47, now closed (the depth table in `view/depth.ts`).
- **Evidence:** `frontend/src/scenes/MatchScene.ts`, `units.ts`, `effects.ts`; the Node suites only cover the pure modules they call.

### DT-43 · `README-license-section.md` sits loose at the repository root
- **Category:** Documentation
- **Risk if untreated:** two licence sources that can drift apart; a reader does not know which one is authoritative.
- **Effort:** P
- **Trigger:** when the licence files are split out of the visual identity branch (DT-51).
- **Evidence:** `README-license-section.md` at the root; not linked from `README.md`.

### DT-51 · The visual identity branch mixes three subjects
- **Category:** Architecture (design)
- **Risk if untreated:** the MR for the visual identity carries the title-screen plans, the title prototype and the licence files, against `CLAUDE.md` rule 5 (one subject per diff).
- **Effort:** P
- **Trigger:** before the MR of `feat/visual-identity` is opened.
- **Evidence:** `git diff --stat develop...feat/visual-identity` lists `.ia_context/plans/title-screen-*`, `.ia_context/prototypes/eldritch-alley-title-screen/`, `ASSETS_LICENSE.md`, `README-license-section.md`.

### DT-64 · Memory and texture cost of one canvas per cell is not measured
- **Category:** Performance
- **Risk if untreated:** a long match may slow down or use more memory than expected, with no signal until the player feels it.
- **Effort:** M
- **Trigger:** if a measurement in a long match shows high cost.
- **Evidence:** `frontend/src/scenes/map/MapView.ts` (one canvas and one texture per cell, plus the animated layers). Suspected, not measured.
- **Measured on 2026-10-04**, headless Chrome 150 against the production build, one valid match: 134 canvases created for the match, about 7.3 Mpx, so about 29 MB of canvas memory (estimate: 4 bytes per pixel). JS heap 6 MB, unchanged after 20 s idle. Frame rate 13 fps during the match, but Chrome ran without a GPU (`--disable-gpu`), so that number does not describe a real browser. **Still open:** the next three matches in the same run did not start (see DT-60), so growth across matches is not measured yet.
### DT-66 · The "room full" error is printed by the server test suite
- **Category:** Testing
- **Risk if untreated:** expected log noise can hide a real server error.
- **Effort:** P
- **Trigger:** the next change to `battle-room.test.ts`.
- **Evidence:** `backend/game-server/src/battle-room.test.ts:75-80` (the test that expects `room full` prints it in the output).

### DT-68 · A second tab during a match reports the wrong reason
- **Category:** UX (client)
- **Risk if untreated:** a player who opens a second tab is told "Servidor indisponível", which points at the server instead of at the tab they left open. They retry against a server that is answering perfectly well, and the message never tells them what to close.
- **Effort:** P
- **Trigger:** before the next playtest.
- **Evidence:** `frontend/src/net/session.ts` (`open()` tries `reconnect()`, gets `false` with no token, and falls through to `connect()`); `backend/game-server/src/battle-room.ts:105-111` (`onJoin` is the only admission guard, and throws `Error('room full')` for a second session); `frontend/src/title/title.ts` (`press()` catches every failure the same way, so `renderFlow` renders `title.unavailable`). The matchmaker offers the occupied room because `findOneRoomAvailable` (`@colyseus/core`, `build/MatchMaker.cjs:248`) filters only on `{ locked, name, private, ...getFilterOptions() }` — capacity is not a criterion. The room is also still held by a **finished** match, because the client only leaves on "Voltar ao início" (`frontend/src/scenes/MatchScene.ts:197-198,426`), so the same wrong line appears there.
- **Suggested fix:** [new-tab-during-match.plan.md](../plans/new-tab-during-match.plan.md) — the client reads the refusal and shows a line that names the other tab. Routing the second tab into its own battle was offered and rejected by the owner. Letting it into the existing match, in progress or finished, needs player identity on the game server, and is tracked with the identity ADR instead.
- **Do not "fix" this by setting `maxClients` on the room.** It looks like the proper repair and makes it worse: `Room._reserveSeat` (`@colyseus/core`, `build/Room.cjs:1333`) would return `false`, `reserveSeatFor` would raise `SeatReservationError`, and `joinOrCreate` would retry five times against the same room (`build/MatchMaker.cjs:167`) before failing with a Colyseus error. The message reaching the client would stop being `room full`, so any client-side reading of it would break silently. The admission guard stays in `onJoin`.

---

## Closed

Moved to [technical-debt-closed.md](./technical-debt-closed.md).
