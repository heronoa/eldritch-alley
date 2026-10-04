# Technical debt

Living list of known debts. Each item has a trigger: the condition that moves it out of the list and into work. Items are never removed; closed items stay here with their resolution, so the history of decisions is visible.

Status values: **Open**, **Closed**.

---

## Open

### DT-04 · Per-client state filtering for hidden items
- **Category:** Security
- **Risk if untreated:** the identity of an unknown item dropped on the map would reach clients before pickup, breaking the post-MVP rule.
- **Effort:** M
- **Trigger:** implementing equipment drops (post-MVP).
- **Evidence:** `backend/engine/src/match.ts`, `publicState`. It filters only the rng; there is no per-viewer filter.



### DT-12 · Frontend bundle size warning
- **Category:** Performance
- **Risk if untreated:** the Phaser bundle exceeds Vite's chunk-size limit, so the first load is heavier than it needs to be.
- **Effort:** P
- **Trigger:** building the M2 client.
- **Evidence:** `npm run build` output: "Some chunks are larger than 500 kB".

### DT-13 · WebSocket reconnection and the 3 s ping are not yet verified through the tunnel
- **Category:** Testing
- **Risk if untreated:** the M2 acceptance criteria are unverified: the default 3 s ping through the tunnel, and reconnection after a forced drop.
- **Effort:** P
- **Trigger:** closing M2.
- **Evidence:** `ROADMAP.md`, M2, "Pending, part of the M2 acceptance test".


### DT-15 · Balance values are fixtures only
- **Category:** Design
- **Risk if untreated:** movement budgets, attack and hit values exist only in tests. Real values come with M3 balancing.
- **Effort:** M
- **Trigger:** M3 balancing.
- **Evidence:** `backend/engine/src/*.test.ts` fixtures.


### DT-05 · Resurrection needs its implementation
- **Category:** Rules
- **Risk if untreated:** resurrection (two steps, ADR 0003 addendum) is not implemented. Bodies occupy their tiles (implemented in M1, round counter included), so the engine is ready for it.
- **Effort:** M
- **Trigger:** implementing resurrection (M3).
- **Evidence:** `docs/adr/0003-permanent-death.md` addendum; `backend/engine/src/corpses.test.ts`.

### DT-19 · Low and moderate advisories left after the Colyseus 0.18 migration
- **Category:** Security
- **Risk if untreated:** `npm audit` still reports 19 advisories: 14 low and 5 moderate, none high and none critical. The low ones sit on the `@colyseus/*` packages and `colyseus` itself; the moderate one is `grant`, pulled in by `@colyseus/auth`. They have no fix inside 0.18.9.
- **Effort:** P (re-check on each Colyseus release; nothing to do until then).
- **Trigger:** a Colyseus release past 0.18.9, or an advisory on the same packages moving to high.
- **Evidence:** `npm audit --json` run on 2026-10-03: `{"low":14,"moderate":5,"high":0,"critical":0,"total":19}`; `docs/adr/0008-colyseus-0.18.md`.

### DT-17 · Reaction windows, slots and counter-attacks in the engine
- **Category:** Rules
- **Risk if untreated:** reactions (counterspell, counter-attack) are decided (ADR 0007) but cannot be played yet. The engine has no reaction window, no reaction slots and no pending-response state.
- **Effort:** M
- **Trigger:** M3, before reaction skills are added.
- **Evidence:** `docs/adr/0007-reaction-abilities.md`; the M1 engine has no reaction code.

### DT-18 · Movement after reloading: rule to confirm
- **Category:** Rules / plan alignment
- **Risk if untreated:** the owner's answer said a unit may move "before or after" reloading. The code follows the move-then-act rule (DT-09): movement is allowed before reloading, not after.
- **Effort:** P
- **Trigger:** owner decision, before M2-a combat is tested by players.
- **Evidence:** `docs/adr/0002-one-resource-per-class.md` addendum; `backend/engine/src/actions.ts` (`validateMove`); `backend/engine/src/ammo.test.ts`.

### DT-20 · Validate the shape of client messages in the match server
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

### DT-24 · The client's occupant lookup does not ignore permanently dead units
- **Category:** Aderência (correção)
- **Risk if untreated:** after a body is removed, the server accepts a move onto its tile, but the client treats the dead unit as an occupant and does not send the move. The player sees a legal move refused.
- **Effort:** P
- **Trigger:** before M3 (resurrection and bodies last longer), or together with the integration plan, whichever comes first.
- **Visual side (same root):** `redrawUnits` in `frontend/src/scenes/MatchScene.ts:213` draws every unit in `state.units`, including a removed body, which stays in the list in its last cell. The client shows a grey ghost on a tile the server considers free. Fix it together with the lookup: skip `permanentlyDead` units when drawing.
- **Race (suspected):** if the room is disposed at the end and the drop fires before `ended` is processed, `handleDrop` may try a reconnection to a finished match and show "Partida perdida" instead of the result. `handleDrop` returns early when `finished` is set, but the order of SDK messages is not confirmed. To confirm: observe the end of a real match in the browser (item in DT-26).
- **Evidence:** `frontend/src/game/selection.ts:21` versus `backend/engine/src/actions.ts:50`; `frontend/src/scenes/MatchScene.ts:213` and `:177`. No frontend test covers `permanentlyDead: true`.

### DT-25 · The move-preview intent is declared but never returned
- **Category:** Documentação (código morto)
- **Risk if untreated:** the type suggests a behaviour that does not exist.
- **Effort:** P
- **Trigger:** when the match scene draws the move preview (m2a-integration), or remove the variant before then.
- **Evidence:** `frontend/src/game/selection.ts:10`.

### DT-26 · Manual acceptance of the M2-a scenes is not recorded
- **Category:** Testing
- **Risk if untreated:** reconnection, "Versão incompatível", and the victory and defeat screens have no automated test and no recorded manual check. Their behaviour is unproven.
- **Effort:** P
- **Trigger:** before the merge of m2a-integration.
- **Evidence:** `.ia_context/plans/m2a-integration.plan.md`, section 5 (manual items); no record in the PR.

### DT-28 · Manual acceptance of the HUD: approved by the owner, not yet recorded in the PR
- **Category:** Testing
- **Status:** the owner played the match in the browser and approved it, with one reservation (DT-30). That approval applies to the **old** HUD (the one M2-a delivered); M3 replaces it, so the owner has to approve the new look, from screenshots, in the PR of the visual identity. The result still has to be written in the PR, and the reconnection and end-of-match items of the checklist have to be marked there.
- **Risk if untreated:** the HUD's playability is proved by one person's check, with no record and no automated test.
- **Effort:** P
- **Trigger:** when the PR of m2a-hud-view is opened.
- **Evidence:** `.ia_context/plans/m2a-hud-view.plan.md`, section 5 (manual checklist).

### DT-29 · The HUD view plan disagrees with the code on two numbers
- **Category:** Documentation
- **Risk if untreated:** the plan says 14 log lines and five panel rows; the code has 12 and six. Whoever reads the plan later will misjudge the layout.
- **Effort:** P
- **Trigger:** together with the next edit of the HUD plans.
- **Evidence:** `.ia_context/plans/m2a-hud-view.plan.md` section 4.1 versus `frontend/src/view/layout.ts:84` (`LOG_LINES = 12`) and the six rows of `frontend/src/game/panel.ts`.

### DT-31 · The engine property test sits on the default 5 s timeout and fails on a loaded machine
- **Category:** Testing
- **Risk if untreated:** `npm test` fails intermittently for a reason that has nothing to do with the change being tested, so a real regression can be dismissed as "the flaky one".
- **Effort:** P
- **Trigger:** the next red run of the engine suite, or the next change to `properties.test.ts`.
- **Evidence:** `backend/engine/src/properties.test.ts:158`, "replays every accepted sequence to the same hash". 200 seeds × 40 steps, each hashing the whole state. Measured on 2026-10-04 with the browser harness, the Colyseus server and the Vite preview running: the test reports **6112 ms** in the full suite (13 files in parallel), over the 5000 ms default timeout, so it fails; **4.4 s** on its own, so it passes. Run `npm test -w @eldritch-alley/engine` with the machine otherwise idle and it passes. Untouched by the visual identity work (`git status --porcelain -- backend/` is empty); the test predates it.

### DT-32 · The game-server test suite does not start at all
- **Category:** Testing
- **Risk if untreated:** `npm test` at the root stops on the second workspace, so every `battle-room` test is dead weight: they have not run, and no regression in the room, the bot or the message handlers can be caught. It also hides DT-31, because the root command never reaches the frontend.
- **Effort:** P
- **Trigger:** before the next change to `backend/game-server`, and before the M2-b deploy.
- **Evidence:** `npm test -w @eldritch-alley/game-server` (and `npx vitest run` inside the workspace, Node 22.19, vitest 3.2.7) fails with `failed to load config from backend/game-server/vitest.config.ts` / `Error [ERR_REQUIRE_ESM]: require() of ES Module .../vite/dist/node/index.js from .../vitest/dist/config.cjs not supported`. `frontend/package.json` carries `"type": "module"` and its suite runs; `backend/game-server/package.json` has no `type`, so Vite bundles the config as CJS and the `import { defineConfig } from 'vitest/config'` on line 1 lands on the CommonJS entry point, which `require`s the ESM-only `vite`. Suspected fix: add `"type": "module"` to the workspace (checking `tsconfig` and the `dist` output first), rename the config to `vitest.config.mts`, or drop the `vitest/config` import for a plain object. Not tried: nothing in the visual identity work touches `backend/` (`git status --porcelain -- backend/game-server/` is empty).

### DT-44 · Effects are drawn beneath the board's pieces
- **Category:** Architecture (design)
- **Risk if untreated:** shots, tracers, missile darts, impact particles and the sky column of the attacks are covered by the blocks in front of them, so the attack animations the owner approved are partly invisible on the isometric board.
- **Effort:** P
- **Trigger:** before the approval of M2 of the isometric board (required).
- **Evidence:** `frontend/src/scenes/effects.ts:68`, `:73`, `:87`, `:100`, `:128`, `:155`: no object sets a depth, so all of them sit at depth 0, while `BoardTiles` draws each cell at `depthOfCell` (`frontend/src/scenes/BoardTiles.ts`), from 0 to 14. Suggested fix: a constant `EFFECT_DEPTH` above every cell and below `HUD_DEPTH` (100).
- **Measured in a real match** (2026-10-04, headless Chrome on the built client, a match played to its end): the objects do exist — read live from the display list during a fired attack they are `16x16@0`, `6x6@0` and four `3x3@0` — and every one of them is at depth 0 while the tiles around them are at 0..28. A 42 fps screencast across twelve bot turns found no effect-coloured pixel anywhere (cyan peaked at 3 px, magenta at 15 px, both anti-aliasing noise against a warm baseline of 45..95 px). The turn whose log reads `A-priest acertou B-wizard por 2` leaves the board pixel-identical to the frame before it. So the effect is built and then covered: **no attack ever shows its animation.** This is why the M3 screenshots have no "attack in progress" (M3 plan, section 7 step 5).

### DT-46 · Highlight graphics are recreated on every redraw
- **Category:** Performance
- **Risk if untreated:** object churn in the scene on each state change. Suspected cost only; not measured.
- **Effort:** P
- **Trigger:** only if a measurement in a real match shows a cost.
- **Evidence:** `frontend/src/scenes/MatchScene.ts:453-454` destroys the previous highlights, and `:468` creates a new `Graphics` for each highlighted cell.

### DT-47 · No test of the scene's depth order
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

### DT-42 · The DT-30 close relies on a browser run with no artifact
- **Category:** Documentation
- **Risk if untreated:** the fix is approved on a check nobody can repeat; the defect may still be there for the owner.
- **Effort:** P
- **Trigger:** the owner confirms the clicks in his own browser, or DT-30 is reopened.
- **Evidence:** DT-30 resolution in the Closed table ("Verified at runtime in headless Chrome at a 0.79 scale"); no script or output is committed.

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

### DT-52 · The turn queue shows class letters, not the characters
- **Category:** Architecture (design)
- **Risk if untreated:** the queue does not match the look of the rest of the game; the owner asked for the character's image.
- **Effort:** P
- **Trigger:** owner's request, next design pass.
- **Evidence:** `frontend/src/scenes/widgets.ts` (`createTurnChip`, letter from `initialOf`); screenshot `.ia_context/descriptions/iso-board-screenshots/04-attack-landed-no-effect.png` (chips P, S, W).

### DT-53 · Attack after spending the movement: not reproduced
- **Category:** Testing
- **Risk if untreated:** the owner cannot attack after moving and no code path explains it, so the bug stays open with no test.
- **Effort:** P
- **Trigger:** the owner gives the class, the positions and the log line at the moment of the click.
- **Evidence:** the engine allows it: `backend/engine/src/actions.ts:107-117` (`validateAttack` has no movement term), `backend/engine/src/events.ts:24` (`moved` spends movement only). The client gates it with `frontend/src/game/actions.ts:57-59` (`canAct` and a target in reach). Likely cause to check: no enemy in reach from the new cell, or a Sniper with an empty magazine (melee reach 1, `selection.ts:29-31`).

### DT-54 · Movement is one tile per action; there is no pathfinding
- **Category:** Architecture (design)
- **Risk if untreated:** the owner cannot cross the board in one move, and the move range is not shown. The engine refuses any step that is not adjacent.
- **Effort:** G
- **Trigger:** decision between options A (client path, one message per step), B (engine path action, protocol bump) and C (engine `reachableCells`, one action); and whether allies block passage.
- **Evidence:** `backend/engine/src/actions.ts:96` (`not-adjacent`); `frontend/src/game/selection.ts` (`chebyshev(...) === 1`).

### DT-55 · Tiles that hide units are not faded
- **Category:** Architecture (design)
- **Risk if untreated:** a unit behind a raised block cannot be seen. Known limit, recorded in the isometric plan.
- **Effort:** M
- **Trigger:** playtest shows units lost behind blocks.
- **Evidence:** `.ia_context/plans/iso-board.index.md` (decision 4); `frontend/src/scenes/BoardTiles.ts`.

### DT-56 · No audio in the client
- **Category:** Architecture (design)
- **Risk if untreated:** effects such as the sniper's bolt click and the impacts are silent. Known limit of the identity and title plans.
- **Effort:** M
- **Trigger:** the first audio plan.
- **Evidence:** `.ia_context/plans/visual-identity-m2-integration.plan.md` (section 9); no audio file or loader in `frontend/`.

### DT-57 · Mana pips are not drawn; the engine has no mana
- **Category:** Architecture (design)
- **Risk if untreated:** wizards and priests show no resource on the board. Known limit.
- **Effort:** G
- **Trigger:** mana reaches the engine (ADR 0002, M3).
- **Evidence:** `frontend/src/view/unit-look.ts` (`pipsFor` returns `null` for magazine `null`); `.ia_context/plans/visual-identity-m1-logic.plan.md` (section 9).

### DT-58 · Sprites have no back view
- **Category:** Architecture (design)
- **Risk if untreated:** a unit walking away from the camera still shows its face. Known limit of the characters handoff.
- **Effort:** M
- **Trigger:** the first view of a unit facing away from the camera in a playtest.
- **Evidence:** `.ia_context/prototypes/eldritch-alley-characters-v1/README.md` ("Only the front view exists").

### DT-59 · No way out of the match after it ends
- **Category:** Architecture (design)
- **Risk if untreated:** after "Vitória" or "Derrota" the player is stuck on the final screen: no button to start again and no way back to the main menu. The only recovery is reloading the page.
- **Effort:** P
- **Trigger:** before the next playtest or the M2-b deploy.
- **Evidence:** `frontend/src/scenes/MatchScene.ts:416-425` (`handleEnded` only sets the result text and redraws; no transition); the only `scene.start` calls leave the match or the lobby (`LobbyScene.ts:80`, `BootScene.ts:41`), and none returns from `match`. The `Session` is also never closed on the way out (suspicion, not verified: `frontend/src/net/session.ts`).

---

## Closed

| ID | Item | Resolution |
|---|---|---|
| DT-07 | `publicState` returned shared references | Deep copy (`cloneData` in `match.ts`). Tested by `match.test.ts`. |
| DT-11 | Reaction windows were not designed | Decided in ADR 0007 (Accepted). Implementation tracked as DT-17. |
| DT-16 | "Initiated" vs "Initiate" | Kept "Initiated"; the pitch and the tables use it. |
| DT-17 | Implement reactions in the engine | Added as an open item for M3 (see below). |
| DT-08 | Known vulnerabilities in dependencies (one high left, on the server path) | Closed for the server path by the Colyseus 0.18 migration (ADR 0008): the `nanoid` high is gone and `npm audit` reports 0 high and 0 critical. The remaining low and moderate advisories are tracked as DT-19. Earlier step: `ts-node-dev` replaced by `tsx`, which removed the `chokidar` and `braces` highs. |
| DT-09 | Movement allowed after the action was spent | `validateMove` rejects with `already-acted` once the action is spent. Covered by `actions.test.ts`. |
| DT-10 | `unit-defeated` used `unit` while other events use `actor` or `target` | The field is now `target`, matching `attacked`. Covered by `actions.test.ts` and `events.test.ts`. |
| DT-14 | M1 plan checklists unmarked; red phase not recorded | All 36 items marked, each mapped to a test. A retroactive red check is recorded in plan section 9. The original red-first order cannot be shown. |
| DT-01 | Modulo bias in `nextInt` | Rejection sampling, `backend/engine/src/rng.ts`. Tested by `rng.test.ts`. |
| DT-02 | `nextInt` with an empty range returned `NaN` | Throws `RangeError`. Tested by `rng.test.ts`. |
| DT-03 | Setup with an empty team was accepted | `newMatch` throws `RangeError`. Tested by `match.test.ts`. |
| DT-06 | Wide public surface in `index.ts` | Exports only the contract. |
| BUG-01 | Replay did not advance the rng, so rebuilt matches rolled differently | `attacked` carries `rngState`; `applyEvent` applies it. Tested by `properties.test.ts` (replay on full state, and a rebuilt match rolling the same numbers). Found in review, not in the original audit. |
| EXTRA | Duplicate unit ids were accepted | `newMatch` throws `RangeError`. Tested by `match.test.ts`. |
| DT-27 | The legend called team A "Azul claro", but its colour was beige | Closed by M3 (visual identity, section 4.3). `TEAM_COLOR.A` became ink blue `#6f95d6` with the night palette, so "Azul" is now the colour of A, and the legend reads "Azul-tinta: você · Vermelho: bot · Papel: selecionado / Realce azul: movimento · Realce vermelho: ataque". The old wording is gone with the beige it described. |
| DT-30 | Clicks on the action buttons landed offset from where they are drawn | Closed by the recommended fix, applied as written. `Button` no longer takes pointer input of its own: it only draws. `layout.ts` gains `containsPoint` and `buttonIndexAt`, which test a point against the same `buttonRect` that draws the button, and `MatchScene.handleClick` tests the bar before `pixelToCell`, then acts on the `ActionButton` the drawn button came from. `LobbyScene` uses `containsPoint` against its own play-button rectangle, so its button did not stop responding when the widget lost its `pointerdown`. Covered by seven cases in `layout.test.ts` (each button under its centre and its corners, the far edge outside, the gap between buttons, above and below the bar, the board, off-canvas). Verified at runtime in headless Chrome at a 0.79 scale: all nine probe points inside each button act, the gap between buttons acts on nothing, and the lobby button answers at its bottom-right corner. **The original defect was never reproduced** — the old Container hit area also answered at the button centres in that harness — so the owner still has to confirm the fix in his own browser; if the offset survives, this item reopens. |
| DT-45 | Block faces use `shade`, not the prototype's face colours | Closed by M3 of the isometric board, section 4.1. `theme.ts` gains `FACE_COLORS`, one `{top, left, right}` per level, holding the prototype's asphalt, slab and plaza tiles; `BoardTiles` reads the two side faces from it and the top from `heightColor` as before, so `shade` and its constants are no longer called by the board (`iso.test.ts` keeps their tests). `grid.test.ts` holds the two tables together (`heightColor(level)` is `FACE_COLORS[level].top`), and `theme.contrast.test.ts` checks each entry's sides are darker than its top and pins the six values. Verified on screen: the start of a match shows the three tones with darker left and right faces. |
