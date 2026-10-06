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

### DT-72 · Prévia do primeiro toque não mostra caminho nem custo (EA-7)

- **Categoria**: Aderência
- **Risco se não tratado**: o EA-7 fica incompleto — o jogador não vê o caminho nem o custo
  antes de confirmar; o primeiro toque não dá feedback visual algum.
- **Esforço estimado**: P
- **Gatilho para tratar**: antes de fechar o EA-7 / antes do deploy do lote 1.
- **Evidência**: frontend/src/scenes/MatchScene.ts:242-244; frontend/src/game/selection.ts:72

### DT-79 · The inspection gesture has no scene-level test

- **Category:** Testing
- **Risk if untreated:** the long press (400 ms), the right button, the 6 px drift that turns a press into a pan, and the release that must not click again after a long press (`MatchScene.ts:259-308`) are untested. This is the most fragile input path, and a regression there would pass the suite.
- **Effort:** M
- **Trigger:** the first pointer or touch bug, or a Phaser pointer harness in the project.
- **Evidence:** `frontend/src/scenes/MatchScene.ts:259-308`; `frontend/src/scenes/MatchScene.test.ts` has no gesture case. The pure part, `resolveInspect`, is covered in `frontend/src/game/selection.test.ts`.

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
- **Effort:** P to M
- **Trigger:** now. It blocks EA-5 acceptance.
- **Evidence:** `frontend/src/game/actions.ts:145-155` (`moveChips`); `frontend/src/scenes/HudScene.ts:323-326` (`drawMoveChips`); `frontend/src/scenes/MatchScene.ts:492-493`, `:744-746`.

### DT-82 · BUG (serious): Attack stays disabled unless an enemy is already in reach

- **Category:** Aderência (bug, found in the smoke test)
- **Severity:** serious. The Atacar button is greyed out whenever no enemy is in reach from the current cell. The attack area of EA-5 cannot be opened, so the button looks inaccessible.
- **Cause (verified):** `canAttack` is `canAct && hasTarget(...)` (`frontend/src/game/actions.ts:105`). Commit `5bb129b` (EA-5) changed it from `highlightedCells(...).length > 0`, which enabled the button whenever an attack area existed. The test `refuses an attack when no enemy is inside the reach` (`frontend/src/game/actions.test.ts:129-138`) locks in the new rule.
- **Conflicts with the plan:** EA-5 section 1 has `Idle ──Attack──▶ (red only: attackArea from the current cell)`, with no condition on an enemy being in reach. The code comment calls the new rule deliberate, so the owner decides between the two.
- **Recommended:** restore "enabled when the attack area is not empty", which matches the plan, and change the test to match.
- **Effort:** P
- **Trigger:** now. It blocks EA-5 acceptance.
- **Evidence:** `frontend/src/game/actions.ts:105`; `frontend/src/game/actions.test.ts:129-138`; `git show 5bb129b -- frontend/src/game/actions.ts`; `.ia_context/plans/ea-5-range-display.plan.md` section 1.

### DT-83 · Confirm and Cancel chips have no padding, so the labels spill out of the box

- **Category:** Aderência (UI, minor)
- **Risk if untreated:** the chips look broken on the board. The labels "Confirmar movimento" and "Cancelar movimento" are wider and taller than the box.
- **Cause:** `MOVE_CHIP` is 184 × 24 (`frontend/src/view/layout.ts:157`). The caption uses the 18 px body font (`frontend/src/view/theme.ts:94`) centred on the box, with no inner padding.
- **Proposed:** shorten the labels to "Confirmar" and "Cancelar", since the chips only appear after a move and the context gives the rest. Give the chips a height that fits the text, or a smaller font. The copy is the owner's call.
- **Effort:** P
- **Trigger:** together with DT-81 and DT-82, before the next smoke test.
- **Evidence:** `frontend/src/view/layout.ts:157`; `frontend/src/view/theme.ts:94`; `frontend/src/i18n/catalog.pt-BR.ts` (`action.confirmMove`, `action.cancelMove`).

---

## Closed

Moved to [technical-debt-closed.md](./technical-debt-closed.md).
