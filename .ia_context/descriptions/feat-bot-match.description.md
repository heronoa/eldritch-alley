# MR — M2-a: a playable match against the bot

**Branch:** `feat/bot-match`
**Base branch:** `develop`
**Milestone:** M2-a
**Ticket(s):** —
**Date:** 2026-10-03

---

### 1. What this MR delivers

A person opens the client, clicks **Jogar contra o bot**, and plays a complete match — Sniper, Wizard
and Priest against the same three on the bot's side — on an 8×8 board with three height levels, in the
browser, until one side is eliminated. A forced disconnect inside 120 seconds is recovered by
reconnecting; a disconnect that outlasts the window ends the match as a loss. The server is the
authority over every action: the room owns the engine's `MatchState`, derives the acting unit from
whose turn it is (a client never names it), applies the action through the engine's public contract,
and answers with the events plus the new public state. The client only requests actions and draws what
comes back.

Clicking the board is only half of it. This MR also delivers the HUD that makes the state legible —
the turn-order carousel, the four-button action bar and the unit panel — and that closes a functional
gap rather than a cosmetic one: **before it, the human could never reload and could never end their own
turn.** Both are legal engine actions the bot used freely, but no client code path sent them, so a
Sniper that emptied its magazine was stuck and the turn never advanced unless the bot was the one
acting. The engine now also carries the unit's health ceiling (`maxHealth`), which the panel needs to
draw `12/12`, and which the bot reads instead of the roster map that used to hold a second copy of the
same number.

**Divergences from the approved plans, named explicitly:**

- **The five plans ship as one MR.** `m2a.index.md` split M2-a into server, logic, integration, design
  and HUD so each could be reviewed alone, and the commit history follows that order, but the MR
  carries all of them. Reviewing the wire (protocol, room, bot) is the highest-value pass; the scenes
  are drawing.
- **The unit's letter is no longer white.** `m2a-integration` §4.3 specified the initial letter in
  white. Playing the result, the owner reported that the letter on their own pieces had no contrast
  against the fill — measured at **1.14:1**, against 8.39:1 on the bot's dark pieces. The colour is now
  derived from the fill under it: each team takes the other team's colour, generalised so that a fallen
  unit, whose body turns dark grey, also gets a light letter. All three fills now measure ≥ 4.5:1
  (WCAG AA), and a test enforces that floor.
- **The move highlight covers 8 cells, not 4.** `m2a-hud-data` says the highlight is "the up-to-four
  neighbours". The client's `resolveClick` moves by Chebyshev distance 1, which is 8-directional, so
  the highlight is 8 cells. The code follows `selection.ts`, which this MR does not touch; the plan
  text is the part that is wrong.
- **The board was not the only file that had to change for the resize.** `m2a-hud-view` moves the
  canvas to 1280×720 with `Phaser.Scale.FIT`, which is a no-op unless the canvas has a viewport-sized
  parent. `frontend/index.html` gained the CSS that gives it one — a file the plan's table does not
  list.
- **Known defect, not fixed here: DT-30.** The owner reports that the action buttons respond to clicks
  offset from where they are drawn — further left and further up. The grid does not show the problem.
  The suspect is the `Button` container's own hit area, and the recommended fix (route the click
  through the scene's existing global handler, testing `pointer.x/y` against the same `buttonRect(index)`
  that draws the button, and drop the per-button hit area) is recorded in `technical-debt.md`. **This
  should be fixed before the merge**, because it makes the buttons hard to use and the fix removes the
  second, divergent pointer path rather than patching it.
- **Two documentation drifts are recorded rather than fixed:** DT-29 (the HUD view plan says 14 log
  lines and five panel rows; the code has 12 and six) and DT-27 (the legend calls team A "Azul claro",
  but `TEAM_COLOR.A` is beige, `0xd9d4c7`).

### 2. What changed and why

| File | What changed | Why it matters |
|------|--------------|----------------|
| `docs/adr/0008-colyseus-0.18.md` | Accepted ADR: migrate to Colyseus 0.18 before any M2-a code | Closes the high `nanoid` advisory on the server path (DT-08); `client.id` is replaced by `sessionId` and `allowReconnection` replaces the old reconnection API |
| `backend/game-server/src/map.ts` | `BOARD` (8×8, three levels), `ROSTER` and the per-class specs, `createMatchSetup()` with a fixed seed | One fixed map and one fixed roster, as data. `MAX_HEALTH_BY_UNIT_ID` is **deleted** — the health ceiling now travels in the state instead of being guessed from the id |
| `backend/game-server/src/protocol.ts` | Message names, payload types, `PROTOCOL_VERSION = 2` | Single source of truth for the wire, mirrored (not imported) by the frontend |
| `backend/game-server/src/bot.ts` | `chooseBotAction(state, team)`: a utility heuristic over legal candidates | The opponent. It scores only actions `applyAction` accepts, and never reads the rng or the events — so it stays deterministic for a given state |
| `backend/game-server/src/battle-room.ts` | One match per room: join, `action` handling, the bot loop, `ended`, reconnection and forfeit | Where "the server is the authority" is actually implemented: the actor is derived, never accepted from the client |
| `backend/game-server/src/main.ts` | Colyseus 0.18 server with `WebSocketTransport`, `battle` room | The process the client connects to |
| `backend/game-server/src/{bot,battle-room,integration}.test.ts` | 11 tests, including a scripted full match | The full-match test replays the received events onto a copy of the setup and compares against the last `state` message — the same guarantee the engine gives, checked across the wire |
| `backend/engine/src/types.ts`, `match.ts` | `UnitState` gains `maxHealth`; `toUnitState` fills it from the setup's health | A unit's ceiling becomes public state. The setup's `health` **is** the maximum, so no second field has to be kept in step, and nothing starts a unit wounded |
| `backend/engine/src/*.test.ts` | Damage lowers `health` and leaves `maxHealth`; a change to `maxHealth` alone changes the hash; `health <= maxHealth` always | The ceiling is a real invariant, not a decoration |
| `frontend/src/protocol.ts` | Copy of the server protocol, `PROTOCOL_VERSION = 2` | The frontend has no dependency on the engine package; the header says to keep the two files in sync |
| `frontend/src/net/session.ts` | `Session`: joins the room, registers handlers across reconnections, stores the token in `sessionStorage` under `ea.reconnect`, `reconnect()` | The SDK's own auto-reconnect is switched off, so the scene decides when to try. All storage access is inside try/catch — the session works without it |
| `frontend/src/view/grid.ts` | `cellToPixel` / `pixelToCell` / `heightColor`, `TILE_SIZE = 48`, `ORIGIN = {40,40}` | Coordinates and the height palette, with no Phaser in the file |
| `frontend/src/game/selection.ts` | `resolveClick` — the cell clicked becomes `none`, `select`, or a `send` action | The only place the click rules live. **Not modified by the HUD work** |
| `frontend/src/game/log.ts` | `describeEvent` and `describeRejection`, in Portuguese | A rejection is shown as a sentence, never as a raw enum such as `not-enough-movement` |
| `frontend/src/game/{turn-order,actions,highlight,panel}.ts` | `turnOrder`, `actionButtons` / `settleMode` / `applyMode`, `highlightedCells`, `unitPanel` | The HUD's decisions, all pure and all tested in Node. They exist so that no colour, label, order or enabled flag is decided inside a scene method |
| `frontend/src/view/theme.ts` | The palette and the type, plus `labelColorOn(fill)` and `cssColor` | One place for every colour. `labelColorOn` is the contrast fix: it picks a light or dark letter from the fill's luminance |
| `frontend/src/view/layout.ts` | Every HUD rectangle, the 1280×720 canvas, and `buttonRect` / `carouselSlotRect` / `panelRowPoint` | No coordinate is decided inside a drawing method. The board keeps its old origin, so all the new space is on the right and the bottom |
| `frontend/src/scenes/widgets.ts` | `Button` (a container with an enabled / armed visual state), `createPanel`, `createTurnChip`, `fillColorOf`, `initialOf` | The three widgets the HUD is built from. `LobbyScene` adopts `Button` too, so there is one way to make a button |
| `frontend/src/scenes/MatchScene.ts` | Draws the board, the highlight, the pieces, the carousel, the bar and the panel; routes clicks through `applyMode` | The scene only draws and forwards. It also **auto-selects** the acting unit when the turn arrives, which is a behaviour change beyond drawing |
| `frontend/src/scenes/LobbyScene.ts` | One button, disabled while connecting, re-enabled with "Servidor indisponível" on failure | The way into a match |
| `frontend/src/main.ts`, `frontend/index.html` | 1280×720 with `Scale.FIT`; CSS so the canvas has a viewport-sized parent | A short viewport scales the canvas down instead of cropping it |
| `frontend/package.json`, `frontend/vitest.config.ts` | `vitest` and a `test` script; environment `node`, no DOM | The frontend had no test runner at all before this MR |
| `backend/game-server/package.json`, `package.json`, `package-lock.json` | Colyseus 0.18, `@colyseus/sdk`, `@colyseus/testing` | `npm audit` now reports **0 high and 0 critical** (18 low and moderate remain, tracked as DT-19) |
| `.ia_context/` | The M2-a plans, the technical debt list, and the description and pre-review for this branch | Versioned working artifacts |

### 4. Notes for the reviewer

- **The plan checklists and index statuses were not updated.** Every plan under `.ia_context/plans/`
  still reads `[ ] pendente`, including the ones this MR implements. The plans were the input, not the
  record; the record is this MR and the test suites.
- **The plans' test counts are stale.** `m2a-hud-view` §Verification expects 119 engine, 10 server and
  33 frontend tests. The branch has **122 engine, 11 server and 101 frontend**. The frontend number
  moved because this MR creates the frontend's test suite.
- **The engine is consumed through `dist/`.** `@eldritch-alley/engine` resolves to its build output, so
  `npm run build -w @eldritch-alley/engine` must run after any engine change before the game-server
  tests can see it. The plan's verification section omits this step; the stale-dist failure looks like
  `unit.maxHealth` being `undefined`.
- **A mode narrows the click; it never invents one.** `applyMode` only filters the intent
  `resolveClick` already produced, which is why `selection.ts` is untouched and why the frontend does
  not carry a second copy of the engine's legality rules. The consequence, worth knowing while
  reviewing: the highlight and the click agree *by construction*, but both mirror the engine, so both
  drift together if the movement rule ever changes. A height step is not checked client-side, so a
  click can look legal and be refused — the refusal sentence in the log is the honest answer.
- **Auto-selection is a behaviour change, not a drawing change.** The acting unit is selected for the
  player on every state, so the panel and the highlight always have a subject. A side effect: clicking
  an enemy while nothing is selected stops being a no-op.
- **`movementLeft` and `hasActed` are match-level scalars**, describing only the unit at
  `initiative[currentIndex]` — they are not per-unit fields. The panel therefore shows `—` for a unit
  that is not the actor rather than a misleading number.
- **`Reação` and `Mana` are disabled placeholders**, by the owner's decision. Mana is M3 (ADR 0002) and
  reactions are M3 (ADR 0007); the engine has no reaction-availability concept at all. The rows are
  dimmed and are never controls, so the panel does not change shape when M3 lands.
- **The corpse is why the letter colour is computed rather than swapped.** A plain swap of the two team
  colours would put a dark letter on the corpse's dark grey body. `labelColorOn` handles all three
  fills with one rule, and `theme.test.ts` walks all three.
- **Known debt visible from here and left alone**, all recorded in `.ia_context/inputs/technical-debt.md`:
  DT-30 (button clicks land offset — see §1), DT-27 (legend wording), DT-24 (`occupantOf` does not
  ignore permanently dead units, so the highlight inherits it deliberately: the highlight must agree
  with the click, not with the engine), DT-25 (`move-preview` is declared and never returned), DT-21
  (the bot only starts playing after a human action), DT-22 (ADR 0008 contradicts itself on
  `setMetadata`), DT-23, DT-26 and DT-28 (the manual acceptance of the scenes and of the HUD is not yet
  written down in a PR).
- **M2-b is not here.** Publishing, the tunnel and the reconnection tests over a real network are the
  next MR; `platform-api` is untouched, and there is no login, no persistence and no turn timer.
