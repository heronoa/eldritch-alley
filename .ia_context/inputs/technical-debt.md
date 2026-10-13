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

### DT-23 · The "not-your-turn" refusal is tested only as a pure function

- **Category:** Testing
- **Risk if untreated:** the message path that sends `rejected` for a bot-turn action is not covered by a socket test; only `resolveHumanAction` is.
- **Effort:** P
- **Trigger:** the next change to the message handlers.
- **Evidence:** `backend/game-server/src/battle-room.test.ts:52`.

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

### DT-71 · The engine's symmetry test depends on the game server's source

- **Category:** Testing
- **Risk if untreated:** the engine's test suite fails when the game server's map data moves, and the engine, which is the leaf package, depends on the server. `actions.test.ts` embeds the same heights instead, so the two test files disagree on the pattern.
- **Effort:** P
- **Trigger:** when the symmetry sweep is reused by EA-5 or EA-6, or the next change to `backend/game-server/src/maps/prototype-maps.ts`.
- **Evidence:** `backend/engine/src/sight.test.ts:6` imports `PROTOTYPE_MAPS` from `../../game-server/src/maps/prototype-maps`; `backend/engine/src/actions.test.ts` builds its boards from literal heights.

### DT-80 · Highlight and click disagree on reach with an empty magazine, until EA-14

- **Category:** Aderência
- **Risk if untreated:** with an empty magazine the area is painted at full range, but a click refuses any target beyond melee. The player sees cells that cannot be shot, with no explanation until EA-14 adds the refusal reason.
- **Effort:** P (closes with EA-14)
- **Trigger:** EA-14 (resource refusals).
- **Evidence:** `backend/engine/src/attack.ts:16-34` uses `unit.range` whatever the ammunition; `frontend/src/game/selection.ts:46-48` uses melee reach (1) when `ammo === 0`.

### DT-81 · BUG (serious): no Confirm/Cancel chips after spending the whole movement

- **Category:** Aderência (bug, found in the smoke test)
- **Severity:** serious. After a move that spends all the movement points, the two chips do not appear, so the move cannot be cancelled and looks committed. A partial move shows them.
- **Verified so far:** the engine and the client's state are correct for a full spend. A temporary test (removed afterwards) moved a unit with 3 points over 3 cells: `movementLeft` 0, `pendingMove` `{from:(0,0), cost:3}`, `moveChips` returns 2 chips, `canStillAct` true, so the countdown does not start. The chips are dropped after that point, in the scene or the HUD.
- **Not yet explained:** the code does not show the cause by reading. Two things differ on a full spend: the Move button turns off and `settleMode` moves the mode to `inspect` (`MatchScene.ts:492-493`), and the events arrive before the state that carries them (`MatchScene.ts:548-553`, `:744-746`).
- **What settles it:** in the browser, after a full-budget move, log `state.pendingMove` and `chipModel.length` inside `pushHud` and `HudScene.render`, then compare with a partial move.
- **Narrowed on 2026-10-06** (smoke test 2 feedback, slice F): the scene's half of the path is now pinned by a test — `keeps the two chips of a pending move that spent the whole budget (DT-81)` in `frontend/src/scenes/MatchScene.test.ts` hands the HUD a full-spend state with the mode on `move`, and asserts that the mode falls back to `inspect` while `moveChips` still carries the two chips. The chips therefore reach `HudScene.render` in the scene's own view. What is left to explain is the HUD's drawing (`drawMoveChips`) or what the server sends, and neither can be settled without the browser run above.
- **Effort:** P to M
- **Trigger:** now. It blocks EA-5 acceptance.
- **Evidence:** `frontend/src/game/actions.ts:145-155` (`moveChips`); `frontend/src/scenes/HudScene.ts:323-326` (`drawMoveChips`); `frontend/src/scenes/MatchScene.ts:492-493`, `:744-746`; `frontend/src/scenes/MatchScene.test.ts` (`keeps the two chips of a pending move that spent the whole budget`).

### DT-85 · The EA-8 hit test and refusal intent are in the EA-12 branch

- **Category:** Aderência
- **Risk if untreated:** one diff carries two subjects, against rule 5 of `CLAUDE.md`. The EA-8 review is diluted in the EA-12 review, and the history does not isolate the subject.
- **Effort:** P
- **Trigger:** before the merge request of `fix/camera-controls` is opened, when deciding whether to split EA-8 out or absorb it into EA-12 and say so in the plan.
- **Evidence:** `frontend/src/game/hit.ts`; `frontend/src/game/selection.ts:19-24`, `:61-95`, `:131`; commit `48d6851`.

### DT-88 · The rotation redraws a full-canvas texture on every frame

- **Category:** Performance
- **Risk if untreated:** about 27 uploads of a full-size texture per turn, with the cost not measured on a device.
- **Effort:** P
- **Trigger:** if a profile on iOS or Android shows dropped frames during a rotation.
- **Evidence:** `frontend/src/scenes/map/RotationView.ts:82-114`.

### DT-89 · `propAt` scans the prop list linearly on every cell read

- **Category:** Performance
- **Risk if untreated:** `hasLineOfSight` calls it per cell on the line and `coverFor` up to eight times per shot, so the cost of a shot grows with the number of props. Irrelevant on the current maps (≤27 props), and it stays silent if the map data densifies.
- **Effort:** P
- **Trigger:** a prop count sustained above ~100, or a profile showing `coverFor`/`hasLineOfSight` on a hot path.
- **Evidence:** `backend/engine/src/board.ts:38-43`; found in the m3-01 cover review (commit `bbd8865`).

### DT-90 · BUG: Vite's dev-server pre-bundle cache does not follow a workspace package's new exports

- **Category:** Build / Architecture (design)
- **Severity:** serious while it lasts — the symptom reads as a feature being entirely broken (nothing is thrown that a player sees; a `[pageerror]` fires silently in the console the moment the code path is actually exercised, and the UI shows nothing instead of what was built).
- **Risk if untreated:** `frontend/node_modules/.vite/deps/@eldritch-alley_engine.js` is a CommonJS bundle Vite produces once and reuses across `npm run dev` restarts; it is keyed by `@eldritch-alley/engine`'s `package.json`, not by its `dist/` output. Adding a new named export to `backend/engine/src/index.ts` and rebuilding the package (`npm run build -w @eldritch-alley/engine`) does not invalidate it, so the dev server keeps serving the stale bundle indefinitely — in this case from 2026-10-08, four commits and five days before the symptom surfaced. Importing the new export from the frontend type-checks and passes every Vitest suite (Vitest resolves the workspace package from its real `dist/`, not from Vite's dev cache), so nothing in `npm test` or `npm run typecheck` catches it. It only throws (`"<name> is not a function"`) the first time a real browser session reaches the code path that calls the new export, which can be well after the feature looked finished.
- **Effort:** P to fix one occurrence (`rm -rf frontend/node_modules/.vite && npm run dev:frontend`); M for a durable fix (e.g. a `predev`/`postbuild` hook on `@eldritch-alley/engine` that clears `frontend/node_modules/.vite`, or moving the engine off `optimizeDeps.include` now that its `dist/` is small).
- **Trigger:** every time a new export is added to `backend/engine/src/index.ts` (or any workspace package in `optimizeDeps.include`) without restarting the frontend dev server with a cleared `.vite` cache. Already flagged as a risk, informally, in the EA-16 plan's "out of scope" section (§7) when it first became a documented concern; this is the first time it actually broke a shipped feature end to end.
- **Evidence:** EA-18 (hit-chance preview) added `export { hitChanceFor } from './actions';` to `backend/engine/src/index.ts`. The owner reported the hover preview showing nothing in a live smoke test; a Playwright session against the real dev server reproduced `[pageerror] hitChanceFor is not a function` the moment a target actually came into range (every earlier hover attempt had no target in range yet, so the broken code path was never reached and the bug looked intermittent). `frontend/vite.config.ts`'s `optimizeDeps: { include: ['@eldritch-alley/engine'] }`; the stale file's mtime (`2026-10-08`) predated the export by five days. Fixed by `rm -rf frontend/node_modules/.vite`.

---

## Closed

Moved to [technical-debt-closed.md](./technical-debt-closed.md).
