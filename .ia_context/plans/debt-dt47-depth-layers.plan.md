# Plan — DT-47: depth layers in one table, tested in Node

**Milestone:** — (single frontend plan, no backend change, no protocol change)
**Parent debt:** [DT-47](../inputs/technical-debt.md) (scene part: no test of the depth order of effects, units and HUD)
**Created on:** 2026-10-05
**Status:** aguardando aprovação do dono. Nenhum código foi alterado.

---

### 1. Objective

Put every depth value of the match in one table in `frontend/src/view/depth.ts`, test the order of that table in Node, and add a static check that the scenes use only that table. A regression like DT-44 (an effect drawn under the board) then fails a test, without a Phaser scene in the test.

### 2. Current state (checked in the code, 2026-10-05)

Depth values are spread over five places:

| Where | What | Value |
|---|---|---|
| `view/iso.ts:31` | `EFFECT_DEPTH` | 20 |
| `view/iso.ts:122`, `:130` | `depthOfCell`, `depthOfUnit` | `x + y`, and `x + y + 0.5` |
| `scenes/MatchScene.ts:58`, `:501` | `HIGHLIGHT_DEPTH_STEP` added to the cell depth | 0.1 |
| `scenes/map/MapView.ts:25`, `:31` | `BACKDROP_DEPTH`, `OVERLAY_DEPTH` | -1, 19 |
| `view/layout.ts:29` | `HUD_DEPTH` | 100 |

Two facts the plan has to deal with:

- **`HUD_DEPTH` no longer protects the HUD.** The HUD is its own scene since map-zoom, and `main.ts` adds it after the match scene, so it draws above by scene order. `HUD_DEPTH` is set in no `setDepth` call; only `iso.test.ts:296` reads it. The existing assertion `EFFECT_DEPTH < HUD_DEPTH` therefore checks a number that no longer governs the HUD.
- **Unit depth moves during a step.** `scenes/units.ts:182-197` tweens the depth from `depthOfUnit(from)` to `depthOfUnit(to)`. The table must keep those two functions as the source of the unit depth.

### 3. Decisions

- **D1 — where the table lives: `view/depth.ts`, a new pure module.** It imports `depthOfCell` and `depthOfUnit` from `view/iso.ts` and exports one `LAYER` object with the constants, plus the functions the scenes already call. `view/iso.ts` keeps its projection and its depth functions, so the diff in the projection code is zero.
- **D2 — the HUD is not in the table as a depth.** It stays on top by scene order, and the table records that as a named entry (`hud: 'scene-order'`, not a number). A number for the HUD would suggest it is enforced by depth, which it is not.
- **D3 — `HUD_DEPTH` is removed from `view/layout.ts`.** Nothing sets it. The assertion that used it is replaced by the order test of D1.
- **D4 — the static check is a guard, not a proof.** It reads the scene sources and fails on a numeric literal passed to `setDepth`, and on any `setDepth` in `HudScene.ts`. It cannot check that a variable holds the right layer. That case stays with the order test and review.

### 4. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/depth.ts` | create | `LAYER` table: backdrop -1, board (`depthOfCell`), highlight (cell + 0.1), unit (`depthOfUnit`), map overlay 19, effect 20, HUD by scene order. Exports the functions the scenes call |
| `frontend/src/view/depth.test.ts` | create | Order tests (section 5, Node) |
| `frontend/src/scenes/depth-usage.test.ts` | create | Static check of the scene sources (section 5, Node) |
| `frontend/src/view/iso.ts` | modify | `EFFECT_DEPTH` moves to `depth.ts`; the depth functions stay here |
| `frontend/src/view/layout.ts` | modify | `HUD_DEPTH` removed |
| `frontend/src/view/iso.test.ts` | modify | The two assertions that read `EFFECT_DEPTH` and `HUD_DEPTH` (lines 295-296) move to `depth.test.ts` |
| `frontend/src/scenes/effects.ts` | modify | `EFFECT_DEPTH` import comes from `depth.ts` |
| `frontend/src/scenes/MatchScene.ts` | modify | `HIGHLIGHT_DEPTH_STEP` comes from `depth.ts` |
| `frontend/src/scenes/map/MapView.ts` | modify | `BACKDROP_DEPTH` and `OVERLAY_DEPTH` come from `depth.ts` |
| `frontend/src/scenes/units.ts` | unchanged | Already uses `depthOfUnit` |

No change in `backend/`, in the protocol, or in the look of the match.

### 5. Tests

**`view/depth.test.ts`** (Node):
- [ ] The board is below the highlight: for every cell of a 10×10 board, `LAYER.highlight(cell) > depthOfCell(cell)` and `< depthOfUnit(cell)`.
- [ ] A unit is above the board of its own cell and below the board of the next cell in the diagonal: `depthOfCell(c) < depthOfUnit(c) < depthOfCell(next)`.
- [ ] The backdrop is below every board cell; the map overlay (19) is above every board cell and below the effect.
- [ ] The effect (20) is above the deepest unit of a 10×10 board (18.5) and above the overlay.
- [ ] The HUD is not in the numeric table: `LAYER.hud === 'scene-order'`.
- [ ] `iso.test.ts` lines 295-296 are gone, and the order above is what replaces them.

**`scenes/depth-usage.test.ts`** (Node, reads the sources, as `engine/forbidden.test.ts` does):
- [ ] No `setDepth(` in `scenes/` takes a numeric literal.
- [ ] `scenes/HudScene.ts` contains no `setDepth(`.
- [ ] `scenes/effects.ts`, `scenes/MatchScene.ts` and `scenes/map/MapView.ts` import their depth values from `view/depth.ts`, and none of them declares its own `*_DEPTH` constant.

**Automated, before merge:** `npm test` and `npx tsc --noEmit` in `frontend/`. Manual: none. The look does not change, so the check is that the match draws as before, which the owner can confirm in one game against the bot.

### 6. Dependencies

- None on other milestones. Base: `develop`, which already has the map-zoom and the iso-board work.
- DT-44 is closed (quick wins M2), so the trigger "together with the fix of DT-44" is met by this plan.

### 7. Out of scope

- Scene-level tests that instantiate Phaser (DT-41). This plan does not create a scene test harness.
- Fading tiles that hide units (DT-55).
- Changing any depth value. The table reproduces today's values, and the order tests check them.

### 8. Risks

- **The static check can be satisfied by a wrong variable.** D4 says so. Review still checks each new `setDepth` call.
- **Removing `HUD_DEPTH` could hide a reason it existed.** The git history of `layout.ts` (the comment says the HUD sits over every tile) should be read before deleting it, and the removal is noted in the closure of DT-47.

### 9. Execution order (after approval)

1. Write `depth.test.ts` and `depth-usage.test.ts`, and see them fail.
2. Create `depth.ts` with today's values, and make the order tests pass.
3. Switch the five files to the table, and remove `HUD_DEPTH` and the two assertions of `iso.test.ts`.
4. Run `npm test` and `npx tsc --noEmit`.
5. Close DT-47 in `technical-debt.md`, moving it to the closed table with its resolution.
