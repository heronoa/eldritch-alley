# Technical debt

Living list of known debts. Each item has a trigger: the condition that moves it out of the list and into work. Closed items move to [technical-debt-closed.md](./technical-debt-closed.md) with their resolution, so the history of decisions is kept. An item that stops making sense is closed as obsolete, with the reason, and never deleted.

Status values: **Open**, **Closed**.

Planned features are not debt: they live in [backlog.md](./backlog.md).

---

## Open

### DT-12 · Frontend bundle size warning
- **Category:** Performance
- **Risk if untreated:** the Phaser bundle exceeds Vite's chunk-size limit, so the first load is heavier than it needs to be.
- **Effort:** P
- **Trigger:** building the M2 client.
- **Evidence:** `npm run build` output: "Some chunks are larger than 500 kB".

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

### DT-31 · The engine property test sits on the default 5 s timeout and fails on a loaded machine
- **Status:** Implemented: the property test has an explicit 30 000 ms timeout. Engine suite passes (122/122). Not yet run on a loaded machine.
- **Category:** Testing
- **Risk if untreated:** `npm test` fails intermittently for a reason that has nothing to do with the change being tested, so a real regression can be dismissed as "the flaky one".
- **Effort:** P
- **Trigger:** the next red run of the engine suite, or the next change to `properties.test.ts`.
- **Evidence:** `backend/engine/src/properties.test.ts:158`, "replays every accepted sequence to the same hash". 200 seeds × 40 steps, each hashing the whole state. Measured on 2026-10-04 with the browser harness, the Colyseus server and the Vite preview running: the test reports **6112 ms** in the full suite (13 files in parallel), over the 5000 ms default timeout, so it fails; **4.4 s** on its own, so it passes. Run `npm test -w @eldritch-alley/engine` with the machine otherwise idle and it passes. Untouched by the visual identity work (`git status --porcelain -- backend/` is empty); the test predates it.

### DT-46 · Highlight graphics are recreated on every redraw
- **Category:** Performance
- **Risk if untreated:** object churn in the scene on each state change. Suspected cost only; not measured.
- **Effort:** P
- **Trigger:** only if a measurement in a real match shows a cost.
- **Evidence:** `frontend/src/scenes/MatchScene.ts:453-454` destroys the previous highlights, and `:468` creates a new `Graphics` for each highlighted cell.

### DT-47 · No test of the scene's depth order
- **Status:** Partly done: the constant test (effects above the board, below the HUD) is in `iso.test.ts`. The scene-level test is still open.
- **Category:** Testing
- **Risk if untreated:** a regression like DT-44 comes back without any failing test. `iso.test.ts` covers the depth values of the module, but not that every effect, unit and HUD object sits in the right layer.
- **Effort:** M
- **Trigger:** together with the fix of DT-44.
- **Evidence:** `frontend/src/view/iso.test.ts` (depth functions only); no test imports `MatchScene` or `effects.ts`.

### DT-40 · Client bundle is 1.69 MB, not compared with develop
- **Category:** Performance
- **Risk if untreated:** a heavier first load on the Cloudflare deploy than necessary; unknown whether the growth comes from Phaser or from the new code.
- **Effort:** P
- **Trigger:** before the M2-b deploy.
- **Evidence:** `npm run build -w @eldritch-alley/frontend` output, `dist/assets/index-*.js` 1,686 kB (gzip 402 kB). Not compared with a build of `develop`.

### DT-41 · The match scene has no automated test
- **Category:** Testing
- **Risk if untreated:** regressions in `MatchScene`, `units.ts` and `effects.ts` appear only in the browser, by hand.
- **Effort:** M
- **Trigger:** the first change to those files after this entry; first step is DT-47.
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

### DT-60 · A refresh in the middle of a match cannot return to it; the lobby shows "Servidor indisponível"
- **Category:** Architecture (design)
- **Risk if untreated:** a page reload during a match loses the match for the player. Starting a new one then fails with a misleading message. The player has no way back to the battle they were in, although the server keeps the seat for 120 s.
- **Effort:** P
- **Trigger:** before the next playtest.
- **Evidence:** `frontend/src/scenes/LobbyScene.ts` (`startMatch` calls only `session.connect()`, which joins or creates a room); `frontend/src/net/session.ts` (`reconnect()` reads the token from `sessionStorage` but only `MatchScene.handleDrop` calls it); `backend/game-server/src/battle-room.ts` (`onJoin` throws `room full` for a second human; `onReconnect` sends the state). **Suspected, not yet reproduced:** `connect()` lands in the old room and fails on `room full`, which is why the lobby shows "Servidor indisponível".
- **Suggested fix:** the lobby tries `session.reconnect()` first when a token is stored, and falls back to `connect()` only when the token is missing or stale. A stale token is cleared, so it is not tried again.
- **Reproduced again on 2026-10-04:** in a measurement run, three page loads in a row did not start a match after the first one, while the first did. The lobby never reconnected, which is the cause this item describes.
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

---

## Closed

Moved to [technical-debt-closed.md](./technical-debt-closed.md).
