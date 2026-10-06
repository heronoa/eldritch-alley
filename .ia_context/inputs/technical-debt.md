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

### DT-70 · The client imports the engine's source file, not the package entry

- **Category:** Architecture (design)
- **Risk if untreated:** a change to the internal layout of the engine breaks the frontend build without any contract change to warn about. The export added to `backend/engine/src/index.ts` for the client is not used, and its comment says it is.
- **Effort:** P
- **Trigger:** before EA-2 and EA-5 import `reachableCells` and `attackArea` from the engine, so the shortcut is not repeated.
- **Evidence:** `frontend/src/game/selection.ts:4` imports `../../../backend/engine/src/sight`; `frontend/package.json` declares no engine dependency; `backend/engine/src/index.ts:9-10` exports `hasLineOfSight` with a comment that says the client reads it from there.

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

### DT-73 · applyEvent('moved') confia no path do evento sem validar
- **Categoria**: Segurança
- **Risco se não tratado**: no M4, um replay a partir de eventos armazenados com um path
- malformado produz custo e posição finais errados, sem erro.
- **Esforço estimado**: P
- **Gatilho para tratar**: início do M4 (persistência e replay a partir de eventos).
- **Evidência**: backend/engine/src/events.ts:30-40

### DT-74 · highlightedCells recomputda redraw
- **Categoria**: Performance
- **Risco se não tratado**: custo quaro; imperceptível em 8×8, relevante se os mapas crescerem.
- **Esforço estimado**: P
- **Gatilho para tratar**: um mapa maior que 8×8, ou um redraw medido como lento.
- **Evidência**: frontend/src/game/hiame/selection.ts:68

---

## Closed

Moved to [technical-debt-closed.md](./technical-debt-closed.md).
