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

### DT-27 · The legend calls team A "Azul claro", but its colour is beige
- **Category:** Documentation
- **Risk if untreated:** the player reads "Azul claro" for a beige piece. The plan wrote the wording and the colour, and they disagree.
- **Effort:** P
- **Trigger:** before the merge of the HUD view, together with the owner's visual check.
- **Evidence:** `frontend/src/scenes/MatchScene.ts:70` (LEGEND) and `TEAM_COLOR.A` in `frontend/src/view/theme.ts:7` (0xd9d4c7, beige).

### DT-28 · Manual acceptance of the HUD: approved by the owner, not yet recorded in the PR
- **Category:** Testing
- **Status:** the owner played the match in the browser and approved it, with one reservation (DT-30). The result still has to be written in the PR, and the reconnection and end-of-match items of the checklist have to be marked there.
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

### DT-30 · Clicks on the action buttons land offset from where they are drawn
- **Category:** Usability (defect)
- **Observed:** the owner reports that every button only responds when the click is further left and further up than the button's drawn area. The grid does not show the problem.
- **Probable cause (not reproduced):** each `Button` is a Container with its own hit area (`frontend/src/scenes/widgets.ts:57-60`). The grid uses the scene's `pointer.x/y` through `pixelToCell` (`frontend/src/scenes/MatchScene.ts:181`) and works. The two paths do not share coordinates, and the Container's local hit area is the suspect. The Phaser source read so far did not show the exact mechanism.
- **Recommended fix:** do not click the Container. In the scene's global `pointerdown`, test `pointer.x/y` against `buttonRect(i)` (the same geometry that draws the button) before `pixelToCell`, and call the same action. Remove the per-button `pointerdown` so the click does not fire twice. The geometry then lives in one place and is covered by `layout.test.ts`.
- **Effort:** P
- **Trigger:** before the merge of the HUD view, and before the M2-b deploy.
- **Evidence:** `frontend/src/scenes/widgets.ts:57-60,63-65`; `frontend/src/scenes/MatchScene.ts:178-182`; `frontend/src/view/layout.ts:98` (`buttonRect`).

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
