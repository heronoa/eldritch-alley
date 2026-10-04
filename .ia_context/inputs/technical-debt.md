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

### DT-20 · Validate the shape of client messages in the match server
- **Status:** Implemented: `backend/game-server/src/action-shape.ts` and the check in `resolveHumanAction`, which answers `malformed-action`. The shape tests pass (6/6) and the resolver was checked directly (malformed refused, valid accepted). The `battle-room.test.ts` case is written but cannot run until DT-32 is fixed.
- **Category:** Security
- **Risk if untreated:** a malformed `action` payload (for example, a move without `to`) throws inside the room handler, because the payload is cast and handed to the engine without a shape check or a try/catch. The damage is limited to that one match, but a client can break its own room.
- **Effort:** P
- **Trigger:** before the M2-b public deploy.
- **Evidence:** `backend/game-server/src/battle-room.ts:80,117`.

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

### DT-32 · The game-server test suite does not start at all
- **Status:** Implemented in part. The config is now `vitest.config.mts`, and the suite starts. Still blocked: `battle-room.test.ts` and `integration.test.ts` fail at load with `SyntaxError: Unexpected token 'with'`; the cause is not located yet (`@colyseus/testing` loads fine under plain Node, so it is in the vitest transform). The root `npm test` is still red.
- **Category:** Testing
- **Risk if untreated:** `npm test` at the root stops on the second workspace, so every `battle-room` test is dead weight: they have not run, and no regression in the room, the bot or the message handlers can be caught. It also hides DT-31, because the root command never reaches the frontend.
- **Effort:** P
- **Trigger:** before the next change to `backend/game-server`, and before the M2-b deploy.
- **Evidence:** `npm test -w @eldritch-alley/game-server` (and `npx vitest run` inside the workspace, Node 22.19, vitest 3.2.7) fails with `failed to load config from backend/game-server/vitest.config.ts` / `Error [ERR_REQUIRE_ESM]: require() of ES Module .../vite/dist/node/index.js from .../vitest/dist/config.cjs not supported`. `frontend/package.json` carries `"type": "module"` and its suite runs; `backend/game-server/package.json` has no `type`, so Vite bundles the config as CJS and the `import { defineConfig } from 'vitest/config'` on line 1 lands on the CommonJS entry point, which `require`s the ESM-only `vite`. Suspected fix: add `"type": "module"` to the workspace (checking `tsconfig` and the `dist` output first), rename the config to `vitest.config.mts`, or drop the `vitest/config` import for a plain object. Not tried: nothing in the visual identity work touches `backend/` (`git status --porcelain -- backend/game-server/` is empty).

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

### DT-48 · Wall and reach invariants of the map plan use orthogonal adjacency
- **Category:** Testing
- **Risk if untreated:** a map with a level-2 cell diagonal to a level-3 wall passes the test, and a unit can step diagonally into the wall. The engine allows diagonal steps (Chebyshev distance 1).
- **Effort:** P
- **Trigger:** before `map-variety-m3-server` is executed.
- **Evidence:** `.ia_context/plans/map-variety-m3-server.plan.md` (I1, I1b, I3); `backend/engine/src/actions.ts:96` (`distance(...) !== 1`), `backend/engine/src/board.ts:19-21`.

### DT-49 · Map variety starts with DT-44 still open, despite the declared blocker
- **Category:** Architecture (design)
- **Risk if untreated:** the three maps and the four milestones are built on attack effects that are partly invisible.
- **Effort:** P
- **Trigger:** before `map-variety-m1-logic` starts.
- **Evidence:** `frontend/src/scenes/effects.ts` (no `setDepth`); DT-44 in this file, marked as required before the M2 approval.

### DT-50 · Map plan measures the panel edge with a 4 px error
- **Category:** Documentation
- **Risk if untreated:** the layout reading of the map plan is wrong in the review.
- **Effort:** P
- **Trigger:** next edit of `map-variety-m1-logic.plan.md`.
- **Evidence:** `.ia_context/plans/map-variety-m1-logic.plan.md` (west corner at x 320; the left panel ends at x 316, `layout.ts` `PANEL_RECT`).

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

---

## Closed

Moved to [technical-debt-closed.md](./technical-debt-closed.md).
