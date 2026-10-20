# Plan: Tile highlight on hover — board, unit figure, and turn-queue portrait

**Milestone:** —
**Parent feature:** `feat/chances-visuals` (current branch, M5 playtest polish continuation)
**Created:** 2026-10-15
**Status:** pending — scoping questions resolved with the owner on 2026-10-15 (recorded in §7)

## 1. Objective

Give the player one visual answer to "what tile is the mouse over right now" — on the board itself,
on the figure of a unit standing on a tile, and on the turn-queue portrait of a unit, even when the
pointer never touches the board. It is draw-only feedback, independent of the EA-18 hit-chance preview,
which keeps answering its own question (is a shot legal from the hovered cell, and what are the odds)
rather than being repurposed to also drive this one.

## 2. Files changed

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/depth.ts` | modify | New `LAYER.hover(cell)` tier, above `LAYER.highlight` and below a unit — the depth table stays the one place a scene reads a layer from (DT-47) |
| `frontend/src/view/depth.test.ts` | modify | Orders `LAYER.hover` between `LAYER.highlight` and `depthOfUnit` (§4) |
| `frontend/src/view/theme.ts` | modify | `HOVER_HIGHLIGHT_COLOR = PAPER_COLOR`, `HOVER_HIGHLIGHT_ALPHA` — outline only, no fill (§7 D2) |
| `frontend/src/scenes/MatchScene.ts` | modify | `hoveredCell: Cell \| null` state; `hudCoversPoint` extracted read-only from `hudTakesPress`; `updateHoveredCell`, `setHoveredCell`, `drawHoverHighlight`; wired into `handlePointerMove`'s `hover` branch and into `pushHud` the way `drawTargetPreview` already is; cleared in `init()` and once `finished` is true |
| `frontend/src/scenes/MatchScene.test.ts` | modify | §4 |

It does **not** touch `frontend/src/game/highlight.ts`, `game/press.ts` or `game/targetPreview.ts` —
none of EA-18's own files change; that is the separate-state option the owner picked (§7 D1).

## 3. Contract of the layer

New private surface of `MatchScene` only. Nothing crosses the scene boundary — no protocol change, no
new engine export.

- `private hoveredCell: Cell | null` — the cell the mouse currently answers to: the board cell under
  the pointer, the cell of the unit figure under the pointer, or the position of the unit whose
  turn-queue portrait is under the pointer. Null when none of the three is true.
- `private hudCoversPoint(point: Pixel): boolean` — true wherever `hudTakesPress` would currently
  intercept a click (the ability menu, the open inspection window, the countdown, the settings gear
  and its open panel, the log, the action bar's buttons, the camera panel, a pending move's two chips,
  every rect `hudRects()` lists), but reads only — it performs none of `hudTakesPress`'s side effects.
  `hudTakesPress` itself is not changed; the two share no code and must be kept in step by hand (named
  explicitly in §6 as an accepted duplication, not hidden).
- `private updateHoveredCell(pointer): void` — called only from the `hover` outcome of
  `handlePointerMove` (a mouse with no button and no finger down, exactly EA-18's own gate), in this
  order: a portrait of the turn queue under the pointer's screen point wins first (`portraitAt`,
  already built for the click path); otherwise a point `hudCoversPoint` claims clears the hover;
  otherwise the board's own hit-test (`unitAtPoint`, then `cellAt`) answers, exactly the resolution
  `handlePress` already runs for a click.
- `private setHoveredCell(cell: Cell | null): void` — mirrors `setPreviewCell`: a no-op when the cell
  is unchanged, so a mouse sweeping the board does not throw away and recreate a `Graphics` object
  every frame (DT-46 is the precedent this follows, not reopens).
- `private drawHoverHighlight(state: PublicState | null): void` — draws one `Graphics`, stroke only
  (no fill), on the top face of `hoveredCell`'s view cell, at `LAYER.hover`, skipped when `hoveredCell`
  is null, when `state` is null, or when the cell has no floor (`NO_FLOOR`, a gap).

**What this layer does not do.**
- It never changes `this.mode`, `this.previewCell`, `this.selectedId` or anything EA-18 already owns —
  it draws an independent mark, not a replacement for the move/attack wash or the hit-chance badge, and
  the three can be on screen together.
- It never sends anything to the server and never reads or writes `state.rngState` — it is decoration,
  exactly like `drawHighlights`.
- It does not fade a building standing over the hovered cell (`drawCoveredBuildings`'s own comment
  already names this gap — "the client has no hover to read one from"); closing it is a natural
  follow-up, not asked for here (§6).
- It raises no exception path of its own: like `drawHighlights`, it is not wrapped in a try/catch,
  because it does no rule computation that can throw — only `targetPreviewChances` (EA-18) carries that
  guard, for a different reason (a catalog lookup that can fail).

## 4. Tests planned

**`view/depth.test.ts`:**
- [ ] `LAYER.hover(cell)` is greater than `LAYER.highlight(cell)` and less than `depthOfUnit(cell)`,
  for every cell of a 10×10 board.

**`scenes/MatchScene.test.ts`:**
- [ ] Moving the mouse over an empty tile sets `hoveredCell` to that tile and draws the outline; moving
  off the board clears it.
- [ ] Moving the mouse over the figure of a unit sets `hoveredCell` to that unit's own position — the
  same cell a click on the figure would act on (EA-8's own resolution, reused).
- [ ] Moving the mouse over a unit's turn-queue portrait sets `hoveredCell` to that unit's position,
  with the pointer nowhere near the board — and moving off the portrait onto empty HUD clears it.
- [ ] The hover highlight is drawn together with the move/attack wash when the hovered cell is also
  inside it — the two are independent marks, neither one suppresses the other.
- [ ] A point the ability menu, the open inspection window, the settings panel, the log, or any other
  `hudRects()` rectangle covers never sets `hoveredCell`, even when a board cell sits under it in world
  space.
- [ ] A touch pointer (a finger) never sets `hoveredCell` — only `Gestures.move`'s `hover` outcome does,
  and a finger never reports one (EA-18's own rule, unchanged).
- [ ] `hoveredCell` is cleared by `init()` and the moment `this.finished` becomes true, and stays
  cleared through the result screen and the battle report.
- [ ] Moving the mouse to the same cell twice in a row does not recreate the `Graphics` object (a spy on
  `this.add.graphics`, mirroring the DT-46 precedent).

## 5. Dependencies

- EA-8 (target by figure) for `unitAtPoint`'s figure-to-cell resolution, and EA-18 for the `hover`
  outcome `Gestures.move` already answers and for `portraitAt`, both reused as-is.
- Nothing server-side: no engine export, no protocol field, no ADR.

## 6. Out of scope

- Fading the building standing over the hovered cell (the gap `drawCoveredBuildings`'s own comment
  names) — a real follow-up, not asked for here.
- Any touch/finger equivalent of this hover — the owner's request named the mouse and the portrait
  explicitly; a finger has no hover today (the long press is its own answer to a different question,
  EA-18 D1) and this plan leaves that as it is.
- Reusing or renaming `previewCell` — ruled out explicitly in favour of a separate `hoveredCell` (§7 D1).

## 7. Decisions

**D1 · A separate `hoveredCell`, not a widened `previewCell`.** Owner's choice. Keeps EA-18's own mode
gate (`this.mode !== 'attack' && this.mode !== 'ability'`) untouched, at the cost of a second, similar
pointer-resolution path alongside `updatePreview`. **Alternative, not taken:** drop that gate and let
one state drive both the highlight and the chance badges — less state, but a hover over a portrait
would then also pop hit-chance numbers outside attack/ability, which nobody asked for.

**D2 · Outline only, no fill.** Owner's choice, and the one `cell.ts`'s own header comment already
anticipates ("the hover outline"). `PAPER_COLOR` is reused for it — already measured at the AAA outline
floor against every tile the three maps draw (`theme.contrast.test.ts`, "keeps the paper marker legible
on every tile"), so no new contrast test is needed.

**D3 · Always active, not gated to the human team's turn.** Owner's choice: the mark answers "what is
under the mouse," not "what could I do right now," so it keeps working while the bot plays and during a
replay's camera turn — `drawTargetPreview`'s own mid-turn guard (DT-86) is not reused here.

**D4 · `hudCoversPoint` duplicates `hudTakesPress`'s rectangles rather than refactoring it.**
`hudTakesPress` bundles each containment check together with the click's own side effect (toggling a
setting, sending a chip's action, opening a menu...), so splitting "is this point covered" from "act on
this point" cleanly would touch a press path with roughly twenty existing tests. The duplication is
accepted and named here rather than hidden; a later debt entry can fold the two together if it drifts.
**Alternative, not taken:** refactor `hudTakesPress` into a check-then-act pair now — more correct in
the long run, a bigger and riskier diff for this one subject (CLAUDE.md §"Rules", keep diffs focused).

**D5 · Hover clears once the match is `finished`.** The result screen and the battle report are not
read against `hudCoversPoint` (they are checked earlier, in `handlePress`'s own `finished` branch, not
in `hudTakesPress`), so the simplest correct rule is: no board is being played once `finished` is true,
so nothing on it is marked as hovered either.
